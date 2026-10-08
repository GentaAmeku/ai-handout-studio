// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ContentSearchResult,
  HandoutSummary,
  VectorStatus,
} from "../../src/api/types.ts";
import { createApi } from "../api.ts";
import { createContentIndex } from "./index.ts";
import type { Ollama } from "./ollama.ts";
import { createVectorIndex, vectorStorePath } from "./vectors.ts";

// ベクトル検索(180)。Ollama は偽物に差し替える(CI に Ollama は無い)。
// 偽のモデルは、同じ話題の語(会議・ミーティング・朝会 など)を同じ向きのベクトルにする

const TOPICS = [
  ["会議", "ミーティング", "朝会", "打ち合わせ"],
  ["録音", "音声", "文字起こし"],
  ["献立", "料理", "晩ごはん"],
];

const fakeVector = (text: string): number[] => [
  ...TOPICS.map((words) => (words.some((word) => text.includes(word)) ? 1 : 0)),
  0.01,
];

type FakeOptions = {
  version?: string | undefined;
  models?: string[] | undefined;
  failQuery?: boolean;
};

const fakeOllama = (options: FakeOptions = {}) => {
  const calls: string[][] = [];
  const ollama: Ollama = {
    version: async () => ("version" in options ? options.version : "0.40.1"),
    models: async () =>
      "models" in options ? options.models : ["embeddinggemma-2:270m"],
    embed: async (_model, inputs) => {
      calls.push([...inputs]);
      if (options.failQuery && inputs[0]?.startsWith("task:")) return undefined;
      return inputs.map(fakeVector);
    },
  };
  return { ollama, calls };
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-vectors-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const send = (
  app: ReturnType<typeof createApi>,
  method: string,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const sheet = (title: string, detail: string) => ({
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title,
  questions: [{ id: "q1", title: "どうしますか", type: "text", detail }],
});

const createSheet = async (
  app: ReturnType<typeof createApi>,
  title: string,
  detail: string,
): Promise<string> =>
  (
    (await (
      await send(app, "POST", "/api/sheets", {
        questions: sheet(title, detail),
      })
    ).json()) as HandoutSummary
  ).id;

// 裏で作っている索引が終わるまで待つ
const untilReady = async (
  read: () => Promise<VectorStatus>,
): Promise<VectorStatus> => {
  for (const _ of Array.from({ length: 50 })) {
    const status = await read();
    if (status.state !== "indexing") return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return read();
};

const vectorIndexFor = (ollama: Ollama) => {
  const content = createContentIndex(context.workspaceRoot);
  return {
    content,
    vectors: createVectorIndex({
      root: context.workspaceRoot,
      ollama,
      sources: content.sources,
    }),
  };
};

describe("ベクトル検索の状態", () => {
  it("Ollama が動いていない・古い・モデルが無いを見分け、次の一手の材料を返す", async () => {
    const statusOf = (options: FakeOptions) =>
      vectorIndexFor(fakeOllama(options).ollama).vectors.status();
    expect(await statusOf({ version: undefined })).toEqual({
      state: "no-ollama",
      minVersion: "0.40.0",
      pull: "embeddinggemma-2:270m",
    });
    expect(await statusOf({ version: "0.30.7" })).toEqual({
      state: "outdated",
      ollamaVersion: "0.30.7",
      minVersion: "0.40.0",
      pull: "embeddinggemma-2:270m",
    });
    expect(await statusOf({ models: ["gemma4"] })).toEqual({
      state: "no-model",
      ollamaVersion: "0.40.1",
      pull: "embeddinggemma-2:270m",
    });
  });

  it("設定で止めていれば off", async () => {
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify({ orgName: "", features: { vectorSearch: false } }),
    );
    expect(await vectorIndexFor(fakeOllama().ollama).vectors.status()).toEqual({
      state: "off",
    });
  });

  it("足りない区切りがあれば indexing、start で作り終えると ready", async () => {
    const { ollama } = fakeOllama();
    const app = createApi({
      repoRoot,
      workspaceRoot: context.workspaceRoot,
      ollama,
    });
    await createSheet(app, "朝会の要望", "朝会で言われたことをまとめる");
    const { vectors } = vectorIndexFor(ollama);
    expect(await vectors.status()).toMatchObject({
      state: "indexing",
      indexed: 0,
      total: 2,
    });
    await vectors.start();
    expect(await untilReady(vectors.status)).toEqual({
      state: "ready",
      ollamaVersion: "0.40.1",
      model: "embeddinggemma-2:270m",
      indexed: 2,
      total: 2,
    });
  });
});

describe("ベクトル検索で並べる", () => {
  it("言葉が違っても、近い話題の資料が中身の当たりに出る(ベクトル検索あり)", async () => {
    const { ollama } = fakeOllama();
    const app = createApi({
      repoRoot,
      workspaceRoot: context.workspaceRoot,
      ollama,
    });
    const standup = await createSheet(
      app,
      "要望のずれ",
      "朝会で言われたことと作ったもののずれ",
    );
    await createSheet(app, "献立の相談", "晩ごはんの料理を決める");
    await send(app, "POST", "/api/search/index");
    await untilReady(
      async () =>
        (
          await send(app, "GET", "/api/search/status")
        ).json() as Promise<VectorStatus>,
    );
    const result = (await (
      await send(
        app,
        "GET",
        `/api/search?q=${encodeURIComponent("ミーティングでの食い違い")}`,
      )
    ).json()) as ContentSearchResult;
    expect(result.vector).toBe(true);
    expect(result.hits[0]?.id).toBe(standup);
  });

  it("索引がそろっていない・打った文のベクトルが返らないときは、文字の重なりだけで並べる", async () => {
    const { ollama } = fakeOllama({ failQuery: true });
    const app = createApi({
      repoRoot,
      workspaceRoot: context.workspaceRoot,
      ollama,
    });
    await createSheet(
      app,
      "要望のずれ",
      "朝会で言われたことと作ったもののずれ",
    );
    const before = (await (
      await send(
        app,
        "GET",
        `/api/search?q=${encodeURIComponent("言われたこと")}`,
      )
    ).json()) as ContentSearchResult;
    expect(before.vector).toBe(false);
    expect(before.hits).toHaveLength(1);
    await send(app, "POST", "/api/search/index");
    await untilReady(
      async () =>
        (
          await send(app, "GET", "/api/search/status")
        ).json() as Promise<VectorStatus>,
    );
    const after = (await (
      await send(
        app,
        "GET",
        `/api/search?q=${encodeURIComponent("言われたこと")}`,
      )
    ).json()) as ContentSearchResult;
    expect(after.vector).toBe(false);
    expect(after.hits).toHaveLength(1);
  });
});

describe("ベクトルの控え", () => {
  it("控えに残り、起こし直しても作り直さない。変わった区切りだけ作り、消えた資料の分は落とす", async () => {
    const first = fakeOllama();
    const app = createApi({
      repoRoot,
      workspaceRoot: context.workspaceRoot,
      ollama: first.ollama,
    });
    const keep = await createSheet(app, "朝会の要望", "朝会で言われたこと");
    const gone = await createSheet(app, "献立の相談", "晩ごはんの料理");
    const index = vectorIndexFor(first.ollama);
    await index.vectors.start();
    await untilReady(index.vectors.status);
    const stored = async () =>
      Object.keys(
        JSON.parse(
          await readFile(vectorStorePath(context.workspaceRoot), "utf8"),
        ).vectors,
      ).length;
    expect(await stored()).toBe(4);

    // 起こし直し(新しい索引)。控えを読むので問い合わせない
    const second = fakeOllama();
    const restarted = vectorIndexFor(second.ollama);
    expect(await restarted.vectors.status()).toMatchObject({ state: "ready" });
    expect(await restarted.vectors.start()).toMatchObject({ state: "ready" });
    expect(second.calls).toEqual([]);

    // 1件を直し、1件を消す。直した質問の区切りだけを作り、消えた資料の分は落とす
    await send(app, "PUT", `/api/sheets/${keep}`, {
      questions: { ...sheet("朝会の要望", "打ち合わせの録音"), revision: "2" },
    });
    await send(app, "DELETE", `/api/sheets/${gone}`);
    await restarted.vectors.start();
    await untilReady(restarted.vectors.status);
    expect(second.calls.flat()).toEqual([
      "title: 朝会の要望 | text: どうしますか\n\n打ち合わせの録音",
    ]);
    expect(await stored()).toBe(2);
  });
});
