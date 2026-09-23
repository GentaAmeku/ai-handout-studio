// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HandoutExportResult, HandoutSummary } from "../src/api/types";
import { createApi } from "./api";
import { documentSample } from "./document-sample";
import { openFolderCommand } from "./open-folder";
import { writeShareState } from "./share";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-hapi-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const send = (method: string, path: string, body?: unknown) =>
  createApi({ repoRoot, workspaceRoot: context.workspaceRoot }).request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const questions = {
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "配布の進め方を決める",
  questions: [
    {
      id: "where",
      title: "どこに置きますか",
      type: "single",
      options: [
        { id: "studio", label: "ai-handout-studio に保存する" },
        { id: "tmp", label: "一時フォルダに置く" },
      ],
    },
  ],
};

const body = '<div class="ds-page"><h1>保存の仕組み</h1></div>';

const createSheet = () => send("POST", "/api/sheets", { questions });

const createDocument = () =>
  send("POST", "/api/documents", { title: "保存の仕組み", body });

describe("質問票の API", () => {
  it("作って一覧・1件で読める", async () => {
    const created = await createSheet();
    expect(created.status).toBe(201);
    const summary = (await created.json()) as HandoutSummary;
    expect(summary).toMatchObject({ kind: "sheet", questionCount: 1 });

    const list = (await (
      await send("GET", "/api/sheets")
    ).json()) as HandoutSummary[];
    expect(list).toHaveLength(1);
    const detail = await send("GET", `/api/sheets/${summary.id}`);
    expect(detail.status).toBe(200);
  });

  it("見本は外への通信を止めた1枚の HTML", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const preview = await send("GET", `/api/sheets/${summary.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("text/html");
    expect(preview.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(await preview.text()).toContain("配布の進め方を決める");
  });

  it("テンプレートを替えられる。知らないテンプレートは 404", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const swapped = await send("PUT", `/api/sheets/${summary.id}/template`, {
      template: "paper",
    });
    expect(swapped.status).toBe(200);
    expect(await swapped.json()).toMatchObject({ template: "paper" });
    expect(
      (
        await send("PUT", `/api/sheets/${summary.id}/template`, {
          template: "missing",
        })
      ).status,
    ).toBe(404);
  });

  it("回答を置ける", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const saved = await send("PUT", `/api/sheets/${summary.id}/answers`, {
      schemaVersion: 1,
      documentId: "demo",
      revision: "1",
      answers: [{ id: "where", selected: ["studio"], text: "保存する" }],
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ hasAnswers: true });
  });

  it("書き出しは置き場所を返し、消すと一覧から消える", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const exported = await send("POST", `/api/sheets/${summary.id}/exports`);
    expect(exported.status).toBe(200);
    expect(await exported.json()).toMatchObject({ kind: "sheet" });
    expect((await send("DELETE", `/api/sheets/${summary.id}`)).status).toBe(
      200,
    );
    expect((await send("DELETE", `/api/sheets/${summary.id}`)).status).toBe(
      404,
    );
  });

  it("書き出しは、ファイルの入ったフォルダを開くコマンドも返す", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const exported = (await (
      await send("POST", `/api/sheets/${summary.id}/exports`)
    ).json()) as HandoutExportResult;
    // コマンドはサーバーの OS で決まる(macOS はファイルを選んで開き、Linux はフォルダを開く)
    expect(exported.openCommand).toBe(
      openFolderCommand(exported.path, process.platform),
    );
  });

  it("形の違う id と壊れた質問 JSON は断る", async () => {
    expect((await send("GET", "/api/sheets/nope")).status).toBe(400);
    expect((await send("GET", "/api/sheets/doc_20260920_001")).status).toBe(
      400,
    );
    const bad = await send("POST", "/api/sheets", { questions: { a: 1 } });
    expect(bad.status).toBe(422);
  });
});

describe("HTML 資料の API", () => {
  it("作って見本を出し、本文を差し替えられる", async () => {
    const created = await createDocument();
    expect(created.status).toBe(201);
    const summary = (await created.json()) as HandoutSummary;
    const preview = await send("GET", `/api/documents/${summary.id}/preview`);
    expect(await preview.text()).toContain("保存の仕組み");
    const updated = await send("PUT", `/api/documents/${summary.id}`, {
      body: '<div class="ds-page"><h1>直した</h1></div>',
      title: "直した資料",
    });
    expect(await updated.json()).toMatchObject({ title: "直した資料" });
  });

  it("スクリプトを含む本文は 422", async () => {
    const bad = await send("POST", "/api/documents", {
      title: "だめな本文",
      body: "<script>alert(1)</script>",
    });
    expect(bad.status).toBe(422);
  });
});

// 画面からの保存は画像を取り込まない(assets/ に無い画像は 422)。見本から画像を抜いて使う
const documentWithoutImages = () => {
  const doc = documentSample();
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      blocks: section.blocks.filter((block) => block.type !== "image"),
    })),
  };
};

describe("HTML 資料の document.json の API", () => {
  const createJson = () =>
    send("POST", "/api/documents", {
      document: documentWithoutImages(),
      title: "保存の仕組み",
    });

  it("画面(HTTP)からは画像の取り込み元(baseDir)を渡せない", async () => {
    const created = await send("POST", "/api/documents", {
      document: documentSample(),
      baseDir: "/",
      title: "取り込み元つき",
    });
    expect(created.status).toBe(400);
  });

  it("assets/ に無い画像を指す document は 422", async () => {
    const created = await send("POST", "/api/documents", {
      document: documentSample(),
      title: "画像つき",
    });
    expect(created.status).toBe(422);
    expect(await created.text()).toContain("assets/ に無い");
  });

  it("document を受けて作り、読み、baseUpdatedAt つきで保存できる", async () => {
    const created = await createJson();
    expect(created.status).toBe(201);
    const summary = (await created.json()) as HandoutSummary;
    const read = await send("GET", `/api/documents/${summary.id}/document`);
    const document = (await read.json()) as { meta: { updatedAt: string } };
    const saved = await send("PUT", `/api/documents/${summary.id}`, {
      document: { ...document, title: "直した題" },
      baseUpdatedAt: document.meta.updatedAt,
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ title: "直した題" });
    const versions = await send("GET", `/api/documents/${summary.id}/versions`);
    expect(await versions.json()).toHaveLength(1);
  });

  it("古い画面からの保存は 409", async () => {
    const summary = (await (await createJson()).json()) as HandoutSummary;
    const document = await (
      await send("GET", `/api/documents/${summary.id}/document`)
    ).json();
    const body = { document, baseUpdatedAt: "2020-01-01T00:00:00.000Z" };
    expect(
      (await send("PUT", `/api/documents/${summary.id}`, body)).status,
    ).toBe(409);
  });

  it("document だけで baseUpdatedAt が無い保存、document と body の両方は 400", async () => {
    const summary = (await (await createJson()).json()) as HandoutSummary;
    expect(
      (
        await send("PUT", `/api/documents/${summary.id}`, {
          document: documentWithoutImages(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("POST", "/api/documents", {
          title: "両方",
          document: documentWithoutImages(),
          body,
        })
      ).status,
    ).toBe(400);
  });

  it("版を取り出して復元できる", async () => {
    const summary = (await (await createJson()).json()) as HandoutSummary;
    const document = (await (
      await send("GET", `/api/documents/${summary.id}/document`)
    ).json()) as { meta: { updatedAt: string } };
    await send("PUT", `/api/documents/${summary.id}`, {
      document: { ...document, title: "二版目" },
      baseUpdatedAt: document.meta.updatedAt,
    });
    const [version] = (await (
      await send("GET", `/api/documents/${summary.id}/versions`)
    ).json()) as { versionId: string }[];
    const detail = await send(
      "GET",
      `/api/documents/${summary.id}/versions/${version?.versionId}`,
    );
    expect(await detail.json()).toMatchObject({
      document: { title: "保存の仕組み" },
    });
    const restored = await send(
      "POST",
      `/api/documents/${summary.id}/versions/${version?.versionId}/restore`,
    );
    expect(await restored.json()).toMatchObject({ title: "保存の仕組み" });
  });
});

// 画面の「共有の依頼をコピー」。束の作り方自体は share.test.tsで確かめている
describe("共有の API", () => {
  it("質問票の束を作り、依頼文を返す。共有中でなければ url は null", async () => {
    const summary = (await (await createSheet()).json()) as HandoutSummary;
    const detail = await send("GET", `/api/sheets/${summary.id}`);
    expect((await detail.json()) as HandoutSummary).toMatchObject({
      shareUrl: null,
    });

    const shared = await send("POST", `/api/sheets/${summary.id}/share`);
    expect(shared.status).toBe(200);
    const body = (await shared.json()) as {
      bundle: string;
      files: { name: string }[];
      url: string | null;
      prompt: string;
    };
    expect(body.url).toBeNull();
    expect(body.files.map((file) => file.name)).toContain("index.html");
    expect(body.prompt).toContain(body.bundle);
    expect(body.prompt).toContain("Artifact");
  });

  it("HTML 資料は画像をファイルに出し、公開済みなら url を返して更新の依頼文になる", async () => {
    const summary = (await (await createDocument()).json()) as HandoutSummary;
    const shared = await send("POST", `/api/documents/${summary.id}/share`);
    const first = (await shared.json()) as { url: string | null };
    expect(first.url).toBeNull();

    await writeShareState(
      context.workspaceRoot,
      "document",
      summary.id,
      "https://claude.ai/artifacts/demo",
      new Date(),
    );
    const detail = (await (
      await send("GET", `/api/documents/${summary.id}`)
    ).json()) as HandoutSummary;
    expect(detail.shareUrl).toBe("https://claude.ai/artifacts/demo");

    const again = await send("POST", `/api/documents/${summary.id}/share`);
    const body = (await again.json()) as { url: string | null; prompt: string };
    expect(body.url).toBe("https://claude.ai/artifacts/demo");
    expect(body.prompt).toContain("更新してください");
  });

  it("[[要確認]] が残っていれば warning を返し、依頼文にも警告の行が入る", async () => {
    const created = await send("POST", "/api/sheets", {
      questions: { ...questions, title: "[[要確認]] 配布の進め方" },
    });
    const summary = (await created.json()) as HandoutSummary;
    const shared = await send("POST", `/api/sheets/${summary.id}/share`);
    const body = (await shared.json()) as { warning?: string; prompt: string };
    expect(body.warning).toContain("[[要確認]] が 1 か所残っている");
    expect(body.prompt).toContain(`束の警告: ${body.warning}`);
  });

  it("無い資料への共有は 404", async () => {
    expect(
      (await send("POST", "/api/sheets/sheet_00000000_000/share")).status,
    ).toBe(404);
  });
});
