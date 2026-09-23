// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { type Browser, chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DeckDetail } from "../src/api/types";
import {
  type CssVariable,
  resolveTemplate,
  templateVariables,
} from "../src/design/theme.ts";
import {
  type MeasuredSlide,
  type MeasuredText,
  measureSlides,
} from "../src/renderer/measure.ts";
import {
  componentsSchema,
  templateSchemas,
  tokensSchema,
} from "../src/schema/design.ts";
import { buildPptx } from "./pptx.ts";

// 字の大きさの倍率が書き出しに効くことを実ブラウザで確かめる。pnpm test:export で流す。
// 書き出し用ページのスライドへ、build と同じ関数で解いた 120% の --fs-* を当てて実測し、PPTX を組む
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designDir = join(repoRoot, "design");
const SCALE = 1.2;

const context: {
  workspaceRoot: string;
  server?: ViteDevServer;
  browser?: Browser;
  origin: string;
  deckId: string;
} = { workspaceRoot: "", origin: "", deckId: "" };

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(designDir, path), "utf8"));

// default のスライドのテンプレートに倍率を持たせて解いた、字の大きさの変数
const scaledFontSizes = async (): Promise<CssVariable[]> => {
  const template = templateSchemas.slide.parse(
    await readJson("templates/slide/default/template.json"),
  );
  const result = resolveTemplate(
    "slide",
    "default",
    { ...template, textScale: SCALE },
    tokensSchema.parse(await readJson("tokens.json")),
    componentsSchema.parse(await readJson("components.json")),
  );
  if (!result.success) throw new Error(result.message);
  return templateVariables(result.template).filter(([name]) =>
    name.startsWith("--fs-"),
  );
};

// 書き出し用ページを実測する。style があれば、スライドの inline の変数より強く当てる
const measure = async (style?: string): Promise<MeasuredSlide[]> => {
  const page = await (context.browser as Browser).newPage({
    viewport: { width: 1280, height: 720 },
  });
  try {
    await page.goto(`${context.origin}/print/${context.deckId}`);
    await page.waitForSelector("[data-print-ready='true']");
    if (style) await page.addStyleTag({ content: style });
    return await page.evaluate(measureSlides);
  } finally {
    await page.close();
  }
};

const pptxXml = async (slides: MeasuredSlide[]): Promise<string> => {
  const zip = await JSZip.loadAsync(
    await buildPptx({
      slides,
      images: new Map(),
      title: "t",
      notes: new Map(),
    }),
  );
  return (
    await Promise.all(
      Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map((name) => zip.files[name]?.async("string") ?? ""),
    )
  ).join("");
};

// スライドの順と字で同じ文字を突き合わせる(同じスライドに同じ字が2つあるものは除く)
const textsByKey = (slides: MeasuredSlide[]): Map<string, MeasuredText> => {
  const entries = slides.flatMap((slide, index) =>
    slide.items
      .filter((item): item is MeasuredText => item.kind === "text")
      .map((text) => [`${index}:${text.text}`, text] as const),
  );
  const counts = entries.reduce(
    (map, [key]) => map.set(key, (map.get(key) ?? 0) + 1),
    new Map<string, number>(),
  );
  return new Map(entries.filter(([key]) => counts.get(key) === 1));
};

const maxSz = (xml: string): number =>
  Math.max(
    ...[...xml.matchAll(/ sz="(\d+)"/g)].map((match) => Number(match[1])),
  );

beforeAll(async () => {
  context.workspaceRoot = await mkdtemp(join(tmpdir(), "ai-handout-scale-"));
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
      title: "字の大きさの確認",
      // design/selection.json の既定(利用者が選んだテンプレート)に依らず、default で確かめる
      templateId: "default",
    }),
  });
  context.deckId = ((await response.json()) as DeckDetail).deckId;
});

afterAll(async () => {
  await context.browser?.close();
  await context.server?.close();
  delete process.env.AI_HANDOUT_STUDIO_WORKSPACE;
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

describe("字の大きさの倍率の書き出し", () => {
  it("120% にすると、実測した字と PPTX の字がそろって 1.2 倍になる", async () => {
    const sizes = await scaledFontSizes();
    const style = `.ds-slide {\n${sizes
      .map(([name, value]) => `  ${name}: ${value} !important;`)
      .join("\n")}\n}`;
    const plain = await measure();
    const scaled = await measure(style);

    const before = textsByKey(plain);
    const after = textsByKey(scaled);
    const pairs = [...before].flatMap(([key, text]) => {
      const other = after.get(key);
      return other ? [[text.fontSize, other.fontSize] as const] : [];
    });
    expect(pairs.length).toBeGreaterThan(20);
    // トークンを 0.1px で丸めるぶんだけずれてよい
    const off = pairs.filter(
      ([base, big]) => Math.abs(big - base * SCALE) > 0.15,
    );
    expect(off).toEqual([]);

    // PPTX でもいちばん大きい字(表紙の題)が 1.2 倍になる
    const [plainXml, scaledXml] = await Promise.all([
      pptxXml(plain),
      pptxXml(scaled),
    ]);
    expect(maxSz(scaledXml) / maxSz(plainXml)).toBeCloseTo(SCALE, 1);
  });
});
