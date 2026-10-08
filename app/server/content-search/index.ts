import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import type { ContentHit, ContentSearchResult } from "../../src/api/types.ts";
import {
  bodyPathOf,
  documentPathOf,
  readDocumentSource,
} from "../document-source.ts";
import {
  answersPathOf,
  questionsPathOf,
  readMeta,
  readSheetAnswers,
  readSheetDocument,
} from "../handout-store.ts";
import { listHandoutIds, metaPathOf } from "../handouts.ts";
import {
  deckDir,
  decksDir,
  isDeckId,
  listDirNames,
  readDeckFile,
} from "../workspace.ts";
import { deckChunks, documentChunks, sheetChunks } from "./chunks.ts";
import {
  type ContentSource,
  type IndexedSource,
  indexSource,
  type RankOptions,
  rankContent,
} from "./rank.ts";
import { bigramsOf } from "./score.ts";

// サイト内検索の中身の索引。資料を区切って片を数えたものを記憶に持ち、
// 探すたびに資料のファイルの更新時刻と大きさを見て、変わった資料だけ読み直す。
// サーバー(GET /api/search)とコマンド(ai-handout-studio search)が同じものを使う

type SourceRef = {
  key: string;
  // 変わったかを見るファイル。無いファイルも「無い」として控える
  files: readonly string[];
  read: () => Promise<ContentSource | undefined>;
};

const deckRefs = async (root: string): Promise<SourceRef[]> =>
  (await listDirNames(decksDir(root))).filter(isDeckId).map((id) => ({
    key: `slide:${id}`,
    files: [join(deckDir(root, id), "deck.json")],
    read: async () => {
      const file = await readDeckFile(root, id);
      if (file.state !== "ready") return undefined;
      const deck = file.value;
      return {
        kind: "slide",
        id,
        title: deck.title,
        titleFields: [deck.title, ...(deck.meta.tags ?? []), id],
        chunks: deckChunks(deck),
      };
    },
  }));

const sheetRefs = async (root: string): Promise<SourceRef[]> =>
  (await listHandoutIds(root, "sheet")).map((id) => ({
    key: `sheet:${id}`,
    files: [
      metaPathOf(root, "sheet", id),
      questionsPathOf(root, id),
      answersPathOf(root, id),
    ],
    read: async () => {
      const [meta, doc, answers] = await Promise.all([
        readMeta(root, "sheet", id),
        readSheetDocument(root, id),
        readSheetAnswers(root, id),
      ]);
      if (meta.state !== "ready" || doc.state !== "ready") return undefined;
      return {
        kind: "sheet",
        id,
        title: meta.value.title,
        titleFields: [meta.value.title, id],
        chunks: sheetChunks(
          doc.value,
          answers.state === "ready" ? answers.value : undefined,
        ),
      };
    },
  }));

const documentRefs = async (root: string): Promise<SourceRef[]> =>
  (await listHandoutIds(root, "document")).map((id) => ({
    key: `document:${id}`,
    files: [
      metaPathOf(root, "document", id),
      documentPathOf(root, id),
      bodyPathOf(root, id),
    ],
    read: async () => {
      const meta = await readMeta(root, "document", id);
      if (meta.state !== "ready") return undefined;
      const source = await readDocumentSource(root, meta.value);
      if (source.state !== "ready") return undefined;
      return {
        kind: "document",
        id,
        title: meta.value.title,
        titleFields: [meta.value.title, id],
        chunks: documentChunks(source.doc),
      };
    },
  }));

const stampOf = async (files: readonly string[]): Promise<string> =>
  (
    await Promise.all(
      files.map((file) =>
        stat(file).then(
          (info) => `${info.mtimeMs}:${info.size}`,
          () => "-",
        ),
      ),
    )
  ).join("|");

type Cached = { stamp: string; source: IndexedSource | undefined };

export type ContentIndex = {
  search: (query: string, options: RankOptions) => Promise<ContentHit[]>;
};

export const createContentIndex = (root: string): ContentIndex => {
  const cache = new Map<string, Cached>();

  const load = async (): Promise<IndexedSource[]> => {
    const refs = (
      await Promise.all([deckRefs(root), sheetRefs(root), documentRefs(root)])
    ).flat();
    const entries = await Promise.all(
      refs.map(async (ref) => {
        const stamp = await stampOf(ref.files);
        const cached = cache.get(ref.key);
        if (cached?.stamp === stamp) return [ref.key, cached] as const;
        const source = await ref.read();
        return [
          ref.key,
          { stamp, source: source && indexSource(source) },
        ] as const;
      }),
    );
    // 消えた資料は控えからも落とす
    cache.clear();
    entries.forEach(([key, value]) => {
      cache.set(key, value);
    });
    return entries.flatMap(([, value]) => (value.source ? [value.source] : []));
  };

  return {
    // 1字だけ・空なら読みに行かない(片が作れず、中身は探さない)
    search: async (query, options) =>
      bigramsOf(query).length === 0
        ? []
        : rankContent(await load(), query, options),
  };
};

export const registerContentSearchRoutes = (
  app: Hono,
  index: ContentIndex,
): void => {
  // 窓の「資料の中身」。題名で当たった資料は題名の区分に出ているので外す
  app.get("/search", async (c) =>
    c.json({
      hits: await index.search(c.req.query("q") ?? "", {
        excludeTitleHits: true,
      }),
    } satisfies ContentSearchResult),
  );
};
