// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import { chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DeckDetail, ExportResult } from "../src/api/types";

// 実ブラウザで書き出す。時間がかかるので pnpm test:export で別に流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const context: {
  workspaceRoot: string;
  server?: ViteDevServer;
  origin: string;
  deckId: string;
} = { workspaceRoot: "", origin: "", deckId: "" };

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${context.origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(json));
  return json as T;
};

// PNG の IHDR から幅と高さを読む
const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

const pdfPageCount = (bytes: Buffer): number =>
  bytes.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;

beforeAll(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-export-"),
  );
  process.env.AI_HANDOUT_STUDIO_WORKSPACE = context.workspaceRoot;
  const server = await createServer({
    configFile: join(repoRoot, "vite.config.ts"),
    server: { port: 0 },
    logLevel: "error",
  });
  await server.listen();
  context.server = server;
  context.origin = (server.resolvedUrls?.local[0] ?? "").replace(/\/+$/, "");
  const detail = await postJson<DeckDetail>("/api/decks", {
    outlineId: "proposal",
    title: "書き出しテスト",
    // design/selection.json の既定(利用者が選んだテンプレート)に依らず、default で確かめる
    templateId: "default",
  });
  context.deckId = detail.deckId;
});

afterAll(async () => {
  await context.server?.close();
  delete process.env.AI_HANDOUT_STUDIO_WORKSPACE;
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

describe("書き出し", () => {
  it("PDF は1スライド1ページで書き出す", async () => {
    const result = await postJson<ExportResult>(
      `/api/decks/${context.deckId}/exports`,
      { format: "pdf" },
    );
    expect(result.files).toEqual(["deck.pdf"]);
    expect(result.overflow).toEqual([]);
    const pdf = await readFile(join(result.directory, "deck.pdf"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfPageCount(pdf)).toBe(13);
  });

  it("配布HTMLは1フォルダで、外部への通信なしに開ける", async () => {
    const result = await postJson<ExportResult>(
      `/api/decks/${context.deckId}/exports`,
      { format: "html" },
    );
    expect(result.files).toEqual(["index.html"]);

    const html = await readFile(join(result.directory, "index.html"), "utf8");
    expect(html).not.toMatch(/<script/i);
    // 外部への参照を持たない(SVG の名前空間 URL は参照ではないので除く)
    expect(html).not.toMatch(/(?:src|href)="https?:/i);

    // file:// で開き、全スライドが見えることと、外へ通信しないことを確かめる
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const external: string[] = [];
      page.on("request", (request) => {
        if (/^https?:/.test(request.url())) external.push(request.url());
      });
      await page.goto(pathToFileURL(join(result.directory, "index.html")).href);
      await page.waitForLoadState("networkidle");
      expect(await page.locator("[data-slide-id]").count()).toBe(13);
      expect(external).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  it("配布HTMLは、見つからない画像の代わりにエラーの応答を画像の名前で書かない", async () => {
    const created = await postJson<DeckDetail>("/api/decks", {
      outlineId: "proposal",
      title: "見つからない画像",
      templateId: "default",
    });
    if (created.state !== "ready") throw new Error("資料を作れなかった");
    const [first, ...rest] = created.deck.slides;
    if (!first) throw new Error("スライドが無い");
    const deck = {
      ...created.deck,
      slides: [
        {
          ...first,
          blocks: [
            ...first.blocks,
            {
              type: "image",
              id: "b-missing",
              x: 0,
              y: 0,
              w: 80,
              h: 80,
              props: { src: "assets/missing.png" },
            },
          ],
        },
        ...rest,
      ],
    };
    const saved = await fetch(`${context.origin}/api/decks/${created.deckId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deck,
        baseUpdatedAt: created.deck.meta.updatedAt,
      }),
    });
    expect(saved.ok).toBe(true);
    const result = await postJson<ExportResult>(
      `/api/decks/${created.deckId}/exports`,
      { format: "html" },
    );
    const assets = await readdir(join(result.directory, "assets"));
    expect(assets).not.toContain("missing.png");
    // 写したファイルに、エラーの応答(JSON)が紛れていない
    const texts = await Promise.all(
      assets
        .filter((name) => !name.endsWith(".woff2") && !name.endsWith(".png"))
        .map((name) =>
          readFile(join(result.directory, "assets", name), "utf8"),
        ),
    );
    expect(texts.some((text) => text.startsWith('{"error"'))).toBe(false);
  });

  it("PPTX は 16:9 のスライドで、本文を文字のまま持つ", async () => {
    const result = await postJson<ExportResult>(
      `/api/decks/${context.deckId}/exports`,
      { format: "pptx" },
    );
    expect(result.files).toEqual(["deck.pptx"]);

    const zip = await JSZip.loadAsync(
      await readFile(join(result.directory, "deck.pptx")),
    );
    const slides = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    expect(slides).toHaveLength(13);

    // 13.333in x 7.5in(EMU)
    const presentation = await zip
      .file("ppt/presentation.xml")
      ?.async("string");
    expect(presentation).toContain('cx="12192000"');
    expect(presentation).toContain('cy="6858000"');

    // 表紙の見出しが画像ではなく文字で入っている
    const cover = await zip.file("ppt/slides/slide1.xml")?.async("string");
    expect(cover).toContain("（提案のタイトル）");
  });

  it("PNG はスライドごとに 1280x720 で書き出す", async () => {
    const result = await postJson<ExportResult>(
      `/api/decks/${context.deckId}/exports`,
      { format: "png" },
    );
    expect(result.files).toHaveLength(13);
    const sizes = await Promise.all(
      result.files.map(async (file) =>
        pngSize(await readFile(join(result.directory, file))),
      ),
    );
    expect(
      sizes.every((size) => size.width === 1280 && size.height === 720),
    ).toBe(true);
  });
});
