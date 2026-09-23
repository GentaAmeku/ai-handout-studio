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
import {
  type MeasuredBox,
  type MeasuredSlide,
  measureSlides,
} from "../src/renderer/measure.ts";
import { buildPptx } from "./pptx.ts";

// 手順(process)の段のつなぎが、疑似要素でなく要素(.ds-process__link)として実測に出て、
// PPTX の XML にも入ることを実ブラウザで確かめる。97 の受入確認。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// つなぎの要素だけをマゼンタにして、実測の中から見分ける
const STYLE =
  ".ds-process__link { border-color: rgb(255, 0, 255) !important; }";

const context: {
  workspaceRoot: string;
  server?: ViteDevServer;
  browser?: Browser;
  origin: string;
} = { workspaceRoot: "", origin: "" };

const measure = async (templateId: string): Promise<MeasuredSlide[]> => {
  const browser = context.browser;
  if (!browser) throw new Error("ブラウザが起動していない");
  const response = await fetch(`${context.origin}/api/decks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      outlineId: "proposal",
      title: `手順のつなぎの確認(${templateId})`,
      templateId,
    }),
  });
  const { deckId } = (await response.json()) as DeckDetail;
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await page.goto(`${context.origin}/print/${deckId}`);
    await page.waitForSelector("[data-print-ready='true']");
    await page.addStyleTag({ content: STYLE });
    return await page.evaluate(measureSlides);
  } finally {
    await page.close();
  }
};

// マゼンタの辺を持つ箱(つなぎの要素)だけを取り出す
const links = (slides: MeasuredSlide[]): MeasuredBox[] =>
  slides.flatMap((slide) =>
    slide.items.filter(
      (item): item is MeasuredBox =>
        item.kind === "box" &&
        (item.sides ?? []).some((side) => side?.color === "ff00ff"),
    ),
  );

const pptxXml = async (slides: MeasuredSlide[]): Promise<string> => {
  const zip = await JSZip.loadAsync(
    await buildPptx({
      slides,
      images: new Map(),
      title: "t",
      notes: new Map(),
    }),
  );
  const names = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name),
  );
  const parts = await Promise.all(
    names.map((name) => zip.files[name]?.async("string") ?? ""),
  );
  return parts.join("");
};

beforeAll(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-process-link-"),
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
  context.browser = await chromium.launch();
});

afterAll(async () => {
  await context.browser?.close();
  await context.server?.close();
  delete process.env.AI_HANDOUT_STUDIO_WORKSPACE;
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

describe("手順の段のつなぎの書き出し", () => {
  it("AI Handout Studio Design(default)は回した矢印の箱として実測に出て、PPTX の XML に入る", async () => {
    const slides = await measure("default");
    const found = links(slides);
    // 4段の手順は、最後以外の3段がつなぎを持つ
    expect(found.length).toBe(3);
    for (const link of found) {
      expect(link.rotate).toBeCloseTo(45, 1);
      // 回す前の大きさ(12px の正方形)
      expect([link.w, link.h]).toEqual([12, 12]);
    }
    const xml = await pptxXml(slides);
    expect(xml).toMatch(/<a:srgbClr val="FF00FF"/i);
  });

  it("Civic は回さない1本の線の箱として実測に出て、PPTX の XML に入る", async () => {
    const slides = await measure("civic");
    const found = links(slides);
    expect(found.length).toBe(3);
    for (const link of found) {
      expect(link.rotate).toBeUndefined();
      // 段の中心から次の段の中心までの、上の辺だけの線
      expect(link.sides?.[0]?.width).toBe(1);
      expect(link.sides?.slice(1)).toEqual([undefined, undefined, undefined]);
    }
    const xml = await pptxXml(slides);
    expect(xml).toMatch(/<a:srgbClr val="FF00FF"/i);
  });
});
