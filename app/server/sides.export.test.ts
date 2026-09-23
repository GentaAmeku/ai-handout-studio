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
  type MeasuredTable,
  type MeasuredText,
  measureSlides,
} from "../src/renderer/measure.ts";
import { buildPptx } from "./pptx.ts";

// 辺ごとの枠・表の罫・字間・下線が、実測に出て PPTX の XML に入ることを実ブラウザで確かめる。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const context: {
  workspaceRoot: string;
  server?: ViteDevServer;
  browser?: Browser;
  origin: string;
  deckId: string;
  slides: MeasuredSlide[];
  xml: string;
} = { workspaceRoot: "", origin: "", deckId: "", slides: [], xml: "" };

// 左だけ太い帯のカード、見出しの下だけの線の表、字間と下線の見出しを当てる
const STYLE = `.ds-slide .ds-card {
  border: 0;
  border-left: 8px solid rgb(255, 0, 0);
}
.ds-slide .ds-table {
  border: 0;
}
.ds-slide .ds-table td {
  border-top: 0;
  border-left: 0;
}
.ds-slide .ds-table thead + tbody > tr:first-child > td {
  border-top: 3px solid rgb(0, 255, 0);
}
.ds-slide .ds-heading__text {
  letter-spacing: 4px;
  text-decoration: underline;
}`;

const items = <K extends MeasuredSlide["items"][number]["kind"]>(kind: K) =>
  context.slides.flatMap((slide) =>
    slide.items.filter((item) => item.kind === kind),
  );

beforeAll(async () => {
  context.workspaceRoot = await mkdtemp(join(tmpdir(), "ai-handout-sides-"));
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
    body: JSON.stringify({
      outlineId: "proposal",
      title: "辺ごとの枠の確認",
      // design/selection.json の既定(利用者が選んだテンプレート)に依らず、default で確かめる
      templateId: "default",
    }),
  });
  context.deckId = ((await response.json()) as DeckDetail).deckId;

  const page = await context.browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await page.goto(`${context.origin}/print/${context.deckId}`);
    await page.waitForSelector("[data-print-ready='true']");
    await page.addStyleTag({ content: STYLE });
    context.slides = await page.evaluate(measureSlides);
  } finally {
    await page.close();
  }
  const zip = await JSZip.loadAsync(
    await buildPptx({
      slides: context.slides,
      images: new Map(),
      title: "t",
      notes: new Map(),
    }),
  );
  context.xml = (
    await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map((name) => zip.files[name]?.async("string") ?? ""),
    )
  ).join("");
});

afterAll(async () => {
  await context.browser?.close();
  await context.server?.close();
  delete process.env.AI_HANDOUT_STUDIO_WORKSPACE;
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

describe("辺ごとの枠・表の罫・字間・下線の書き出し", () => {
  it("左だけの枠は四辺の枠でなく左の辺として実測され、帯の箱で PPTX に入る", () => {
    const banded = (items("box") as MeasuredBox[]).filter(
      (box) => box.sides?.[3]?.color === "ff0000",
    );
    expect(banded.length).toBeGreaterThan(0);
    for (const box of banded) {
      expect(box.line).toBeUndefined();
      expect(box.sides?.[3]?.width).toBe(8);
      expect(box.sides?.slice(0, 3)).toEqual([undefined, undefined, undefined]);
    }
    // 8px = 76200 EMU の幅の赤い箱
    expect(context.xml).toContain('cx="76200"');
    expect(context.xml).toMatch(/<a:srgbClr val="FF0000"/i);
  });

  it("表は見出しの下だけに線が出て、外枠と縦罫は出ない", () => {
    const tables = items("table") as MeasuredTable[];
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const [head, first] = table.rows;
      expect(first?.cells.every((cell) => cell.sides[0]?.width === 3)).toBe(
        true,
      );
      expect(head?.cells.every((cell) => cell.sides[3] === undefined)).toBe(
        true,
      );
    }
    // 3px = 2.25pt = 28575 EMU の緑の線が、見出しの下の辺と本文の1行目の上の辺に出る
    expect(context.xml).toMatch(
      /<a:lnB w="28575"[^>]*><a:solidFill><a:srgbClr val="00FF00"/i,
    );
    expect(context.xml).toMatch(
      /<a:lnT w="28575"[^>]*><a:solidFill><a:srgbClr val="00FF00"/i,
    );
  });

  it("見出しの字間と下線が実測に出て、PPTX の spc と u に入る", () => {
    const headings = (items("text") as MeasuredText[]).filter(
      (text) => text.letterSpacing === 4,
    );
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every((text) => text.underline)).toBe(true);
    // 4px = 3pt = spc 300
    expect(context.xml).toContain('spc="300"');
    expect(context.xml).toContain('u="sng"');
  });
});
