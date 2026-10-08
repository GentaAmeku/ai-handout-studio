// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ContentSearchResult,
  HandoutSummary,
} from "../../src/api/types.ts";
import { createApi } from "../api.ts";
import { createContentIndex } from "./index.ts";

// 索引は workspace の資料を読み、変わった資料だけ読み直す。窓は GET /api/search で引く

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-search-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const api = () => createApi({ repoRoot, workspaceRoot: context.workspaceRoot });

const send = (
  app: ReturnType<typeof api>,
  method: string,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const questions = (detail: string) => ({
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "配布の進め方を決める",
  questions: [{ id: "where", title: "どこに置きますか", type: "text", detail }],
});

const createSheet = async (
  app: ReturnType<typeof api>,
  detail: string,
): Promise<string> =>
  (
    (await (
      await send(app, "POST", "/api/sheets", { questions: questions(detail) })
    ).json()) as HandoutSummary
  ).id;

describe("GET /api/search", () => {
  it("質問票と HTML 資料の中身から引き、場所と前後の文を返す", async () => {
    const app = api();
    const sheetId = await createSheet(
      app,
      "共有のフォルダに置いて週次で更新する",
    );
    await send(app, "POST", "/api/documents", {
      title: "保存の仕組み",
      body: "<p>資料は workspace に置き、週次で控えを取る</p>",
    });
    const result = (await (
      await send(app, "GET", `/api/search?q=${encodeURIComponent("週次")}`)
    ).json()) as ContentSearchResult;
    expect(result.hits.map((hit) => hit.kind).sort()).toEqual([
      "document",
      "sheet",
    ]);
    const sheetHit = result.hits.find((hit) => hit.id === sheetId);
    expect(sheetHit?.place).toEqual({ type: "question", number: 1 });
    expect(sheetHit?.snippet.some((segment) => segment.hit)).toBe(true);
  });

  it("題名で当たる資料は中身の区分に出さない", async () => {
    const app = api();
    await createSheet(app, "共有のフォルダに置く");
    const result = (await (
      await send(app, "GET", `/api/search?q=${encodeURIComponent("配布")}`)
    ).json()) as ContentSearchResult;
    expect(result.hits).toEqual([]);
  });

  it("語が空・1字なら何も返さない", async () => {
    const app = api();
    await createSheet(app, "共有のフォルダに置く");
    const empty = await send(app, "GET", "/api/search");
    expect(await empty.json()).toEqual({ hits: [] });
    const one = await send(
      app,
      "GET",
      `/api/search?q=${encodeURIComponent("共")}`,
    );
    expect(await one.json()).toEqual({ hits: [] });
  });
});

describe("createContentIndex", () => {
  it("資料を直すと、次に探したときに新しい中身で引ける", async () => {
    const app = api();
    const index = createContentIndex(context.workspaceRoot);
    const id = await createSheet(app, "共有のフォルダに置く");
    expect(
      await index.search("共有のフォルダ", { excludeTitleHits: false }),
    ).toHaveLength(1);
    await send(app, "PUT", `/api/sheets/${id}`, {
      questions: { ...questions("手元の外付けの円盤に置く"), revision: "2" },
    });
    expect(
      await index.search("共有のフォルダ", { excludeTitleHits: false }),
    ).toEqual([]);
    expect(
      (await index.search("外付けの円盤", { excludeTitleHits: false })).map(
        (hit) => hit.id,
      ),
    ).toEqual([id]);
  });

  it("消した資料は出さない", async () => {
    const app = api();
    const index = createContentIndex(context.workspaceRoot);
    const id = await createSheet(app, "共有のフォルダに置く");
    expect(
      await index.search("共有のフォルダ", { excludeTitleHits: false }),
    ).toHaveLength(1);
    await send(app, "DELETE", `/api/sheets/${id}`);
    expect(
      await index.search("共有のフォルダ", { excludeTitleHits: false }),
    ).toEqual([]);
  });
});
