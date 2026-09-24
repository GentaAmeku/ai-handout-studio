// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeckDetail, DeckSummary, ExportResult } from "../src/api/types";
import { validateDeck } from "../src/schema/deck";
import { createApi } from "./api";
import type { Exporter, ExportJob } from "./exporter";
import { openFolderCommand } from "./open-folder";
import {
  copyDesignWithDefaultSelection,
  proposalDeck,
} from "./test-fixtures.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixedNow = new Date(2026, 8, 16, 10, 0, 0);

const context = { workspaceRoot: "", designDir: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-api-"),
  );
  // design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
  context.designDir = await copyDesignWithDefaultSelection();
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
  await rm(context.designDir, { recursive: true, force: true });
});

const api = () =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    designDir: context.designDir,
    now: () => fixedNow,
  });

const postJson = (path: string, body: unknown) =>
  api().request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const createDeck = async (title = "テスト提案"): Promise<string> => {
  const response = await postJson("/api/decks", {
    outlineId: "proposal",
    title,
  });
  const detail = (await response.json()) as DeckDetail;
  return detail.deckId;
};

const writeDeckFolder = async (deckId: string, content: string) => {
  const dir = join(context.workspaceRoot, "decks", deckId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "deck.json"), content, "utf8");
};

describe("GET /api/decks", () => {
  it("workspace が空なら空の一覧を返す", async () => {
    const response = await api().request("/api/decks");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("作った資料を表紙と枚数つきで、更新の新しい順に返す", async () => {
    const first = await createDeck("一本目");
    const second = await createDeck("二本目");
    const deckDir = join(context.workspaceRoot, "decks", first);
    const deck = JSON.parse(await readFile(join(deckDir, "deck.json"), "utf8"));
    await writeFile(
      join(deckDir, "deck.json"),
      JSON.stringify({
        ...deck,
        meta: { ...deck.meta, updatedAt: "2026-09-17T00:00:00Z" },
      }),
    );

    const summaries = (await (
      await api().request("/api/decks")
    ).json()) as DeckSummary[];
    expect(summaries.map((summary) => summary.deckId)).toEqual([first, second]);
    const [latest] = summaries;
    expect(latest).toMatchObject({
      state: "ready",
      title: "一本目",
      status: "draft",
      slideCount: 13,
      tags: ["提案"],
    });
    expect(latest?.state === "ready" && latest.cover?.id).toBe("s01");
  });

  it("壊れた資料とフォルダ名が違う資料は invalid として残す", async () => {
    await writeDeckFolder("deck_20260901_001", "{ broken");
    const template = proposalDeck();
    await writeDeckFolder(
      "deck_20260901_002",
      JSON.stringify({ ...template, id: "deck_20260901_999" }),
    );

    const summaries = (await (
      await api().request("/api/decks")
    ).json()) as DeckSummary[];
    const messages = Object.fromEntries(
      summaries.map((summary) => [
        summary.deckId,
        summary.state === "invalid" ? summary.message : "",
      ]),
    );
    expect(messages.deck_20260901_001).toMatch(/JSON として読めない/);
    expect(messages.deck_20260901_002).toMatch(/フォルダ名/);
  });
});

describe("POST /api/decks", () => {
  it("テンプレートから日付と連番の id で資料を作り、フォルダ一式を用意する", async () => {
    const response = await postJson("/api/decks", {
      outlineId: "proposal",
      title: "  ご提案書A  ",
    });
    expect(response.status).toBe(201);
    const detail = (await response.json()) as DeckDetail;
    expect(detail.deckId).toBe("deck_20260916_001");

    const dir = join(context.workspaceRoot, "decks", detail.deckId);
    const saved = validateDeck(
      JSON.parse(await readFile(join(dir, "deck.json"), "utf8")),
    );
    expect(saved).toMatchObject({
      id: "deck_20260916_001",
      title: "ご提案書A",
      status: "draft",
      meta: { createdAt: fixedNow.toISOString() },
    });
    const subdirs = await Promise.all(
      ["versions", "assets", "exports"].map(async (name) =>
        (await stat(join(dir, name))).isDirectory(),
      ),
    );
    expect(subdirs).toEqual([true, true, true]);
    expect(await createDeck()).toBe("deck_20260916_002");
  });

  it("テンプレートを選べる。無ければ既定のテンプレートで、deck.json の template に書く", async () => {
    const template = async (body: Record<string, string>) => {
      const response = await postJson("/api/decks", {
        outlineId: "proposal",
        title: "a",
        ...body,
      });
      return response.status === 201
        ? ((await response.json()) as { deck: { template?: string } }).deck
            .template
        : response.status;
    };
    expect(await template({})).toBe("default");
    expect(await template({ templateId: "linen" })).toBe("linen");
    // 構成の名前はテンプレートとして使えない
    expect(await template({ templateId: "proposal" })).toBe(404);
  });

  it("テンプレートに同梱の絵(assets/)を資料の assets/ へ写し、見本と同じ src で読める", async () => {
    const response = await postJson("/api/decks", {
      outlineId: "lumen",
      templateId: "lumen",
      title: "絵つき",
    });
    const detail = (await response.json()) as DeckDetail;
    const asset = await api().request(
      `/api/decks/${detail.deckId}/assets/hero.svg`,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("image/svg+xml");
    // 見本の image の src(assets/<ファイル>)はどれも写った先にある
    const deck = detail.state === "ready" ? detail.deck : undefined;
    const sources = (deck?.slides ?? [])
      .flatMap((slide) => slide.blocks)
      .flatMap((block) =>
        block.type === "image" ? [String(block.props.src)] : [],
      );
    const statuses = await Promise.all(
      sources.map(
        async (src) =>
          (await api().request(`/api/decks/${detail.deckId}/${src}`)).status,
      ),
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
    // 絵を持たない構成と既定のテンプレートからは何も写さない
    const plain = await createDeck();
    expect(
      (await api().request(`/api/decks/${plain}/assets/hero.svg`)).status,
    ).toBe(404);
  });

  it("空のタイトルは 400、無いテンプレートは 404", async () => {
    expect(
      (await postJson("/api/decks", { outlineId: "proposal", title: " " }))
        .status,
    ).toBe(400);
    expect(
      (await postJson("/api/decks", { outlineId: "missing", title: "a" }))
        .status,
    ).toBe(404);
    expect(
      (await postJson("/api/decks", { outlineId: "../proposal", title: "a" }))
        .status,
    ).toBe(400);
  });
});

describe("GET /api/decks/:deckId", () => {
  it("検証済みの資料を返す", async () => {
    const deckId = await createDeck();
    const response = await api().request(`/api/decks/${deckId}`);
    const detail = (await response.json()) as DeckDetail;
    expect(detail.state).toBe("ready");
    expect(detail.state === "ready" && detail.deck.slides).toHaveLength(13);
  });

  it("形の違う id は 400、無い資料は 404", async () => {
    expect((await api().request("/api/decks/deck_1")).status).toBe(400);
    expect((await api().request("/api/decks/deck_20260101_001")).status).toBe(
      404,
    );
  });
});

describe("GET /api/decks/:deckId/assets/*", () => {
  it("assets/ の画像を種類つきで返し、外のファイルや未対応の拡張子は返さない", async () => {
    const deckId = await createDeck();
    const assetsDir = join(context.workspaceRoot, "decks", deckId, "assets");
    await writeFile(join(assetsDir, "logo.svg"), "<svg/>");
    await writeFile(join(assetsDir, "memo.txt"), "secret");

    const logo = await api().request(`/api/decks/${deckId}/assets/logo.svg`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    expect(await logo.text()).toBe("<svg/>");

    const outside = await api().request(
      `/api/decks/${deckId}/assets/..%2Fdeck.json`,
    );
    expect(outside.status).toBe(404);
    const text = await api().request(`/api/decks/${deckId}/assets/memo.txt`);
    expect(text.status).toBe(404);
  });
});

describe("POST /api/decks/:deckId/exports", () => {
  // 実ブラウザは使わず、受け取った依頼だけを記録する
  const fakeExporter = (
    names: readonly string[] = ["deck.pdf"],
  ): Exporter & { jobs: ExportJob[] } => {
    const jobs: ExportJob[] = [];
    return {
      jobs,
      exportDeck: async (job) => {
        jobs.push(job);
        return {
          files: names.map((name) => join(job.outDir, name)),
          overflow: [],
        };
      },
      close: async () => undefined,
    };
  };

  const exportRequest = (
    exporter: Exporter | undefined,
    deckId: string,
    body: unknown,
  ) =>
    createApi({
      repoRoot,
      workspaceRoot: context.workspaceRoot,
      designDir: context.designDir,
      now: () => fixedNow,
      exporter,
    }).request(`/api/decks/${deckId}/exports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("検証済みの資料を、日時のフォルダへ書き出すよう依頼する", async () => {
    const deckId = await createDeck();
    const exporter = fakeExporter();
    const response = await exportRequest(exporter, deckId, { format: "pdf" });
    expect(response.status).toBe(200);
    const directory = join(
      context.workspaceRoot,
      "decks",
      deckId,
      "exports",
      "20260916T100000",
    );
    expect((await response.json()) as ExportResult).toEqual({
      format: "pdf",
      directory,
      files: ["deck.pdf"],
      path: join(directory, "deck.pdf"),
      openCommand: openFolderCommand(
        join(directory, "deck.pdf"),
        process.platform,
      ),
      overflow: [],
    });
    expect(exporter.jobs).toEqual([
      { deckId, format: "pdf", outDir: directory, title: "テスト提案" },
    ]);
  });

  it("ファイルがいくつもあれば、パスはフォルダを指し、コマンドは最初のファイルを選ぶ", async () => {
    const deckId = await createDeck();
    const exporter = fakeExporter(["slide-01.png", "slide-02.png"]);
    const response = await exportRequest(exporter, deckId, { format: "png" });
    const result = (await response.json()) as ExportResult;
    expect(result.path).toBe(result.directory);
    expect(result.openCommand).toBe(
      openFolderCommand(
        join(result.directory, "slide-01.png"),
        process.platform,
      ),
    );
  });

  it("書き出し処理が無ければ 503、形式が違えば 400、壊れた資料は 422", async () => {
    const deckId = await createDeck();
    expect(
      (await exportRequest(undefined, deckId, { format: "pdf" })).status,
    ).toBe(503);
    expect(
      (await exportRequest(fakeExporter(), deckId, { format: "docx" })).status,
    ).toBe(400);
    await writeDeckFolder("deck_20260901_001", "{ broken");
    expect(
      (
        await exportRequest(fakeExporter(), "deck_20260901_001", {
          format: "png",
        })
      ).status,
    ).toBe(422);
  });
});
