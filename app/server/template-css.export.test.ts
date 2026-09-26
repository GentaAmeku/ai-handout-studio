// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  surfaceNames,
  type TemplateChecks,
  templateChecksSchema,
} from "../src/schema/design";
import { SAMPLE_LANGS } from "./design";
import { SHEET_LAYOUTS } from "./sheet-sample";

// テンプレートごとに、専用の CSS を当てた見本を実ブラウザで描き、文字の明暗差とはみ出しを測る。
// 明暗差は、文字を透明にした画面を撮って文字の下の地の色を読み、文字の色と比べる
// (専用の CSS が敷く帯・面・疑似要素の地も拾える)。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designDir = join(repoRoot, "design");

const context: { server?: ViteDevServer; browser?: Browser; origin: string } = {
  origin: "",
};

// 本文は 4.5、大きい字(24px 以上、太字は 18.66px 以上)は 3。
// スライドは段 B からアクセント色の文字などを 3 以上で見ている(theme.test.ts の knownLowPairs)
const BODY_MIN = 4.5;
const VIEWPORT = { width: 1280, height: 800 };
const LARGE_MIN = 3;

type TextRun = {
  where: string;
  text: string;
  color: string;
  large: boolean;
  fontSize: number;
  rects: { x: number; y: number; w: number; h: number }[];
};

// 見本の中の文字。見えないもの・押せないもの・読み上げ専用のものは除く
const collectText = (page: Page): Promise<TextRun[]> =>
  page.evaluate(() => {
    const skip = new Set(["SCRIPT", "STYLE", "TITLE", "OPTION", "TEXTAREA"]);
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const runs: TextRun[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const parent = node.parentElement;
      if (!text || !parent || skip.has(parent.tagName)) continue;
      if (parent.closest(":disabled, [aria-disabled='true'], [hidden]"))
        continue;
      const style = getComputedStyle(parent);
      if (style.visibility !== "visible") continue;
      const hidden = (element: Element | null): boolean =>
        element !== null &&
        (Number(getComputedStyle(element).opacity) === 0 ||
          hidden(element.parentElement));
      if (hidden(parent)) continue;
      // 読み上げ専用(1px に切り抜いたもの)
      const box = parent.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()]
        .filter((rect) => rect.width >= 4 && rect.height >= 4)
        .map((rect) => ({
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          w: rect.width,
          h: rect.height,
        }));
      if (rects.length === 0) continue;
      const size = Number.parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const inSvg = parent instanceof SVGElement;
      runs.push({
        where: [
          parent.tagName.toLowerCase(),
          ...[...parent.classList].slice(0, 2).map((name) => `.${name}`),
        ].join(""),
        text: text.slice(0, 24),
        color: inSvg ? style.fill : style.color,
        large: size >= 24 || (bold && size >= 18.66),
        fontSize: size,
        rects,
      });
    }
    return runs;
  });

const HIDE_TEXT = `
*, *::before, *::after {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
  caret-color: transparent !important;
}
svg text { fill: transparent !important; }
`;

// 文字を透明にした画面の、各文字の下の地の色(rgb)。撮った画像は空のページで読む
const backgroundsUnder = async (
  page: Page,
  reader: Page,
  runs: readonly TextRun[],
): Promise<[number, number, number][][]> => {
  const style = await page.addStyleTag({ content: HIDE_TEXT });
  const shot = await page.screenshot();
  await style.evaluate((element) => (element as Element).remove());
  const points = runs.map((run) =>
    run.rects.flatMap((rect) =>
      [0.25, 0.5, 0.75].flatMap((fx) =>
        [0.3, 0.5, 0.7].map((fy) => ({
          x: Math.floor(rect.x + rect.w * fx),
          y: Math.floor(rect.y + rect.h * fy),
        })),
      ),
    ),
  );
  const colors = await reader.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context2d = canvas.getContext("2d");
      if (!context2d) throw new Error("canvas が使えない");
      context2d.drawImage(image, 0, 0);
      const pixels = context2d.getImageData(0, 0, image.width, image.height);
      return points.map((list) =>
        list.flatMap(({ x, y }) => {
          if (x < 0 || y < 0 || x >= image.width || y >= image.height)
            return [];
          const offset = (y * image.width + x) * 4;
          return [
            [
              pixels.data[offset] ?? 0,
              pixels.data[offset + 1] ?? 0,
              pixels.data[offset + 2] ?? 0,
            ] as [number, number, number],
          ];
        }),
      );
    },
    { data: shot.toString("base64"), points },
  );
  return colors;
};

const parseColor = (value: string): [number, number, number, number] => {
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return [r, g, b, value.startsWith("rgba") || parts.length === 4 ? a : 1];
};

const channel = (value: number): number => {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: readonly number[]): number =>
  0.2126 * channel(r ?? 0) +
  0.7152 * channel(g ?? 0) +
  0.0722 * channel(b ?? 0);

const ratio = (text: string, background: [number, number, number]): number => {
  const [r, g, b, a] = parseColor(text);
  const blended = [r, g, b].map(
    (value, index) => value * a + (background[index] ?? 0) * (1 - a),
  );
  const [light, dark] = [luminance(blended), luminance(background)].sort(
    (x, y) => y - x,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

// 画面の高さを文書の高さに合わせてから測る。測ったときと撮ったときで配置がずれない
const fitViewport = async (page: Page): Promise<void> => {
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.setViewportSize({ width: VIEWPORT.width, height });
};

const contrastIssues = async (
  page: Page,
  reader: Page,
  surface: string,
  checks: TemplateChecks,
): Promise<{ issues: string[]; runs: TextRun[] }> => {
  await fitViewport(page);
  const runs = await collectText(page);
  const backgrounds = await backgroundsUnder(page, reader, runs);
  // strictContrast: 真なら、大きさと区分に関係なくどの字も 4.5 で測る
  const issues = runs.flatMap((run, index) => {
    const min = checks.strictContrast
      ? BODY_MIN
      : surface === "slide" || run.large
        ? LARGE_MIN
        : BODY_MIN;
    const worst = Math.min(
      ...(backgrounds[index] ?? []).map((background) =>
        ratio(run.color, background),
      ),
    );
    return worst < min
      ? [`${run.where}「${run.text}」 ${worst.toFixed(2)} < ${min}`]
      : [];
  });
  return { issues, runs };
};

// minFontSize: 見本の文字を持つ要素の算出した font-size がこれより小さければ落とす
const fontSizeIssues = (
  runs: readonly TextRun[],
  checks: TemplateChecks,
): string[] => {
  const min = checks.minFontSize;
  if (min === undefined) return [];
  return runs
    .filter((run) => run.fontSize < min)
    .map(
      (run) =>
        `${run.where}「${run.text}」の字が小さい ${run.fontSize.toFixed(1)}px < ${min}px`,
    );
};

// テンプレートが自分の検査の基準(checks)を持てば読む。無ければ今の基準のまま(空)
const checksOf = async (
  designDir: string,
  surface: string,
  name: string,
): Promise<TemplateChecks> => {
  const raw: unknown = await readFile(
    join(designDir, "templates", surface, name, "template.json"),
    "utf8",
  ).then(JSON.parse);
  const template = raw as { checks?: unknown };
  return template.checks ? templateChecksSchema.parse(template.checks) : {};
};

// スライドはブロック枠からのはみ出し、質問票と文書は横のはみ出し
const overflowIssues = (page: Page, surface: string): Promise<string[]> =>
  surface === "slide"
    ? page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".ds-block")].flatMap(
          (block) =>
            block.scrollHeight > block.clientHeight + 1 ||
            block.scrollWidth > block.clientWidth + 1
              ? [
                  `${block.closest<HTMLElement>(".ds-slide")?.dataset.slideId} / ${block.dataset.blockId} がはみ出す`,
                ]
              : [],
        ),
      )
    : page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 1
          ? [`横にはみ出す(${document.documentElement.scrollWidth}px)`]
          : [],
      );

// 文書の見本は document.json を document-render.ts で描いたもの、質問票の見本は
// sheet-render.ts の出力。どちらも保存した資料の書き出しと同じ DOM なので、実描画を測っている。
// スライドは部品の見本(slide.html)に加え、そのテンプレートが中身の見本(sample.json)を持てば
// それを描いた slide.<名前>.html も測る。画面の一覧と編集画面が出すのと同じ資料。
// 英語の見本(samples/en/)も同じ名前で並ぶので、同じ検査にかける
const samplesIn = async (
  dir: string,
  surface: string,
  name: string,
): Promise<string[]> => {
  const prefix = dir === "" ? "" : `${dir}/`;
  if (surface === "document") return [`${prefix}document.html`];
  if (surface === "sheet") {
    return SHEET_LAYOUTS.map((layout) => `${prefix}sheet.${layout}.html`);
  }
  const own = `${prefix}slide.${name}.html`;
  const has = await readFile(join(designDir, "samples", own)).then(
    () => true,
    () => false,
  );
  return has ? [`${prefix}slide.html`, own] : [`${prefix}slide.html`];
};

const samplesOf = async (surface: string, name: string): Promise<string[]> =>
  (
    await Promise.all(
      ["", ...SAMPLE_LANGS].map((dir) => samplesIn(dir, surface, name)),
    )
  ).flat();

const templateNamesOf = async (surface: string): Promise<string[]> => {
  const index = JSON.parse(
    await readFile(join(designDir, "dist", surface, "templates.json"), "utf8"),
  ) as { templates: Record<string, unknown> };
  return Object.keys(index.templates);
};

beforeAll(async () => {
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
});

describe("テンプレートの専用の CSS を当てた見本", () => {
  it.each(surfaceNames)(
    "%s: どのテンプレートも明暗差が足り、はみ出さない",
    async (surface) => {
      const browser = context.browser;
      if (!browser) throw new Error("ブラウザが起動していない");
      const browserContext = await browser.newContext({ viewport: VIEWPORT });
      const page = await browserContext.newPage();
      const reader = await browserContext.newPage();
      const names = await templateNamesOf(surface);
      const issues: string[] = [];
      for (const name of names) {
        const checks = await checksOf(designDir, surface, name);
        for (const sample of await samplesOf(surface, name)) {
          await page.setViewportSize(VIEWPORT);
          const response = await page.goto(
            `${context.origin}/api/design/files/samples/${sample}?template=${name}`,
          );
          expect(response?.ok()).toBe(true);
          await page.evaluate(() => document.fonts.ready);
          const { issues: contrastFound, runs } = await contrastIssues(
            page,
            reader,
            surface,
            checks,
          );
          const found = [
            ...contrastFound,
            ...fontSizeIssues(runs, checks),
            ...(await overflowIssues(page, surface)),
          ];
          issues.push(...found.map((issue) => `${name} ${sample}: ${issue}`));
        }
      }
      await browserContext.close();
      expect(issues).toEqual([]);
    },
  );
});
