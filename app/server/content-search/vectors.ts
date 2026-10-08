import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { VectorStatus } from "../../src/api/types.ts";
import { readFeatures } from "../profile.ts";
import { parseJson, readTextIfExists, writeTextAtomic } from "../workspace.ts";
import {
  isOlderVersion,
  MIN_OLLAMA_VERSION,
  type Ollama,
  pickVectorModel,
  VECTOR_MODEL_PULL,
} from "./ollama.ts";
import { type IndexedSource, keyOf, type SemanticScores } from "./rank.ts";

// ベクトル検索(180。方式は docs/plans/content-search.md §5)。
// 区切りを埋め込みモデル(embeddinggemma-2)でベクトルにして控え、打った文のベクトルとの近さを資料ごとに返す。
// 控えは workspace/search/embeddings.json(消しても作り直せる)。作るのは start だけで、status と scores は書かない

export const vectorStorePath = (root: string): string =>
  join(root, "search", "embeddings.json");

// モデルカードの前置き。区切りは題名つき、打った文は検索の問いとして渡す
export const documentInput = (title: string, text: string): string =>
  `title: ${title} | text: ${text}`;
export const queryInput = (query: string): string =>
  `task: search result | query: ${query}`;

const BATCH = 32;
// 初めての問い合わせはモデルを読み込むので長めに待つ(手元では 32 区切りで数秒)
const BATCH_TIMEOUT = 120_000;
// 窓で打った文は1秒で返らなければ文字の重なりだけで並べる
const QUERY_TIMEOUT = 1000;
// 何回分の問い合わせごとに控えを書くか(途中で止まっても作った分を残す)
const SAVE_EVERY = 5;

type StoreFile = { version: 1; vectors: Record<string, string> };

// 鍵はモデルと前置きつきの文から作る。モデルや中身が変わった区切りだけ作り直す
const vectorKey = (model: string, input: string): string =>
  createHash("sha256").update(`${model}\n${input}`).digest("hex").slice(0, 32);

const normalized = (vector: readonly number[]): Float32Array => {
  const length = Math.hypot(...vector) || 1;
  return Float32Array.from(vector, (value) => value / length);
};

const encode = (vector: Float32Array): string =>
  Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString(
    "base64",
  );

// Buffer の頭が4の倍数とは限らないので、写してから Float32Array にする
const decode = (text: string): Float32Array =>
  new Float32Array(new Uint8Array(Buffer.from(text, "base64")).buffer);

const dot = (a: Float32Array, b: Float32Array): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

type ChunkInput = {
  source: IndexedSource;
  chunk: number;
  key: string;
  input: string;
};

const inputsOf = (
  sources: readonly IndexedSource[],
  model: string,
): ChunkInput[] =>
  sources.flatMap((source) =>
    source.chunks.map((chunk, index) => {
      const input = documentInput(source.title, chunk.text);
      return { source, chunk: index, key: vectorKey(model, input), input };
    }),
  );

// Ollama とモデルが使えるか。使えれば版とモデルの名前、使えなければ状態
type Probe =
  | { ok: true; ollamaVersion: string; model: string }
  | { ok: false; status: VectorStatus };

export type VectorIndex = {
  // 今の状態。足りない区切りがあれば indexing(start が作る)
  status: () => Promise<VectorStatus>;
  // 足りない区切りのベクトルを裏で作り始め、今の状態を返す。作っている途中なら何もしない
  start: () => Promise<VectorStatus>;
  // 打った文との近さ。全部の区切りのベクトルがそろっていて、Ollama がすぐ返したときだけ
  scores: (
    query: string,
    sources: readonly IndexedSource[],
  ) => Promise<SemanticScores | undefined>;
};

export const createVectorIndex = ({
  root,
  ollama,
  sources,
}: {
  root: string;
  ollama: Ollama;
  sources: () => Promise<IndexedSource[]>;
}): VectorIndex => {
  // サーバーの記憶に持つもの。控えの中身・作っている途中の仕事・最後に確かめたモデル
  const memory: {
    store: Map<string, Float32Array> | undefined;
    job: Promise<void> | undefined;
    model: string | undefined;
  } = { store: undefined, job: undefined, model: undefined };

  const loadStore = async (): Promise<Map<string, Float32Array>> => {
    if (memory.store) return memory.store;
    const text = await readTextIfExists(vectorStorePath(root));
    const parsed = text === undefined ? undefined : parseJson(text);
    const file =
      parsed?.success === true ? (parsed.value as Partial<StoreFile>) : {};
    const store = new Map(
      Object.entries(file.vectors ?? {}).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, decode(value)] as const] : [],
      ),
    );
    memory.store = store;
    return store;
  };

  // keep を渡すと、それ以外の鍵(消えた資料・変わった区切り)を落として書く
  const saveStore = async (keep?: ReadonlySet<string>): Promise<void> => {
    const store = await loadStore();
    if (keep) {
      [...store.keys()]
        .filter((key) => !keep.has(key))
        .forEach((key) => {
          store.delete(key);
        });
    }
    const file: StoreFile = {
      version: 1,
      vectors: Object.fromEntries(
        [...store].map(([key, vector]) => [key, encode(vector)]),
      ),
    };
    await mkdir(dirname(vectorStorePath(root)), { recursive: true });
    await writeTextAtomic(vectorStorePath(root), JSON.stringify(file));
  };

  const probe = async (): Promise<Probe> => {
    if (!(await readFeatures(root)).vectorSearch) {
      return { ok: false, status: { state: "off" } };
    }
    const ollamaVersion = await ollama.version();
    if (ollamaVersion === undefined) {
      return {
        ok: false,
        status: {
          state: "no-ollama",
          minVersion: MIN_OLLAMA_VERSION,
          pull: VECTOR_MODEL_PULL,
        },
      };
    }
    if (isOlderVersion(ollamaVersion, MIN_OLLAMA_VERSION)) {
      return {
        ok: false,
        status: {
          state: "outdated",
          ollamaVersion,
          minVersion: MIN_OLLAMA_VERSION,
          pull: VECTOR_MODEL_PULL,
        },
      };
    }
    const model = pickVectorModel((await ollama.models()) ?? []);
    if (model === undefined) {
      return {
        ok: false,
        status: { state: "no-model", ollamaVersion, pull: VECTOR_MODEL_PULL },
      };
    }
    memory.model = model;
    return { ok: true, ollamaVersion, model };
  };

  const statusWith = async (
    found: Extract<Probe, { ok: true }>,
  ): Promise<{
    status: Extract<VectorStatus, { state: "indexing" | "ready" }>;
    missing: ChunkInput[];
    keys: Set<string>;
  }> => {
    const store = await loadStore();
    const inputs = inputsOf(await sources(), found.model);
    const missing = inputs.filter((item) => !store.has(item.key));
    return {
      status: {
        state:
          missing.length === 0 && memory.job === undefined
            ? "ready"
            : "indexing",
        ollamaVersion: found.ollamaVersion,
        model: found.model,
        indexed: inputs.length - missing.length,
        total: inputs.length,
      },
      missing,
      keys: new Set(inputs.map((item) => item.key)),
    };
  };

  // 足りない区切りを BATCH ずつ問い合わせる。1回でも返らなければそこで止め、次の start でやり直す
  const build = async (
    model: string,
    missing: readonly ChunkInput[],
    keys: ReadonlySet<string>,
  ): Promise<void> => {
    const store = await loadStore();
    const batches = Array.from(
      { length: Math.ceil(missing.length / BATCH) },
      (_, index) => missing.slice(index * BATCH, (index + 1) * BATCH),
    );
    for (const [index, batch] of batches.entries()) {
      const vectors = await ollama.embed(
        model,
        batch.map((item) => item.input),
        BATCH_TIMEOUT,
      );
      if (!vectors) {
        await saveStore();
        return;
      }
      batch.forEach((item, position) => {
        store.set(item.key, normalized(vectors[position] ?? []));
      });
      if ((index + 1) % SAVE_EVERY === 0) await saveStore();
    }
    await saveStore(keys);
  };

  const status = async (): Promise<VectorStatus> => {
    const found = await probe();
    return found.ok ? (await statusWith(found)).status : found.status;
  };

  const start = async (): Promise<VectorStatus> => {
    const found = await probe();
    if (!found.ok) return found.status;
    const current = await statusWith(found);
    if (current.missing.length === 0 || memory.job !== undefined) {
      return current.status;
    }
    memory.job = build(found.model, current.missing, current.keys)
      .catch(() => undefined)
      .finally(() => {
        memory.job = undefined;
      });
    return { ...current.status, state: "indexing" as const };
  };

  const scores = async (
    query: string,
    list: readonly IndexedSource[],
  ): Promise<SemanticScores | undefined> => {
    if (!(await readFeatures(root)).vectorSearch) return undefined;
    const model =
      memory.model ??
      (await probe().then((found) => (found.ok ? found.model : undefined)));
    if (model === undefined) return undefined;
    const store = await loadStore();
    const inputs = inputsOf(list, model);
    if (inputs.some((item) => !store.has(item.key))) return undefined;
    const [vector] =
      (await ollama.embed(model, [queryInput(query)], QUERY_TIMEOUT)) ?? [];
    if (!vector) return undefined;
    const target = normalized(vector);
    return inputs.reduce((best, item) => {
      const stored = store.get(item.key);
      const score = stored ? dot(target, stored) : Number.NEGATIVE_INFINITY;
      const key = keyOf(item.source);
      const current = best.get(key);
      if (!current || score > current.score) {
        best.set(key, { score, chunk: item.chunk });
      }
      return best;
    }, new Map<string, { score: number; chunk: number }>());
  };

  return { status, start, scores };
};
