// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { type Browser, chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DeckDetail } from "../src/api/types";
import { type MeasuredSlide, measureSlides } from "../src/renderer/measure.ts";
import { buildPptx } from "./pptx.ts";

// カードのしっぽ(回した小さな箱)が書き出しの実測に出ること、
// 既定で display: none の飾りの箱は出ないことを、実ブラウザで確かめる。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const context: {
  workspaceRoot: string;
  server?: ViteDevServer;
  browser?: Browser;
  origin: string;
  deckId: string;
} = { workspaceRoot: "", origin: "", deckId: "" };

// 部品の変種を選ぶ代わりに、しっぽの変数を直接当てる(左下のしっぽの値)。変種の変数はスライドに敷かれるので、カードに直接当てて勝たせる
const TAIL_ON = `.ds-card {
  --card-tail-display: block;
  --card-tail-left: 48px;
  --card-tail-right: auto;
  --card-tail-space: 16px;
  --card-tail-border-width: 1px;
}`;

const measure = async (style?: string): Promise<MeasuredSlide[]> => {
  const page = await context.browser?.newPage({
    viewport: { width: 1280, height: 720 },
  });
  if (!page) throw new Error("ブラウザが起動していない");
  try {
    await page.goto(`${context.origin}/print/${context.deckId}`);
    await page.waitForSelector("[data-print-ready='true']");
    if (style) await page.addStyleTag({ content: style });
    return await page.evaluate(measureSlides);
  } finally {
    await page.close();
  }
};

const rotated = (slides: MeasuredSlide[]) =>
  slides.flatMap((slide) =>
    slide.items.filter((item) => item.kind === "box" && item.rotate),
  );

beforeAll(async () => {
  context.workspaceRoot = await mkdtemp(join(tmpdir(), "ai-handout-tail-"));
  process.env.AI_HANDOUT_STUDIO_WORKSPACE = context.workspaceRoot;
  const server = await createServer({
    configFile: join(repoRoot, "vite.config.ts"),
    server: { port: 0 },
    logLevel: "error",
  });
  await server.listen();
  context.server = server;
  context.origin = (server.resolvedUrls?.local[0] ?? "").replace(/\/+$/, "");
  context.browser = await chromium.launch();
  const response = await fetch(`${context.origin}/api/decks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outlineId: "proposal", title: "しっぽの確認" }),
  });
  context.deckId = ((await response.json()) as DeckDetail).deckId;
});

afterAll(async () => {
  await context.browser?.close();
  await context.server?.close();
  delete process.env.AI_HANDOUT_STUDIO_WORKSPACE;
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

describe("カードのしっぽの書き出し", () => {
  it("既定ではしっぽも飾りの箱も実測に出ない", async () => {
    expect(rotated(await measure())).toEqual([]);
  });

  it("しっぽは回した箱として実測に出て、PPTX に図形として入る", async () => {
    const slides = await measure(TAIL_ON);
    const tails = rotated(slides);
    expect(tails.length).toBeGreaterThan(0);
    // 回す前の大きさ(20px の正方形)で持つ。外接の四角の大きさにはならない
    for (const tail of tails) {
      expect(tail.kind === "box" && [tail.w, tail.h]).toEqual([20, 20]);
      expect(tail.kind === "box" && tail.rotate).toBeCloseTo(45, 1);
    }
    const pptx = await buildPptx({
      slides,
      images: new Map(),
      title: "t",
      notes: new Map(),
    });
    const zip = await JSZip.loadAsync(pptx);
    const xml = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .map((name) => zip.files[name]?.async("string") ?? ""),
      )
    ).join("");
    expect(xml).toContain('rot="2700000"');
  });
});
