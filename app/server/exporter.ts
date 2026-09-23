import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import type { DeckDetail, ExportFormat } from "../src/api/types.ts";
import { type MeasuredSlide, measureSlides } from "../src/renderer/measure.ts";
import type { OverflowReport } from "../src/renderer/overflow.ts";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../src/schema/deck.ts";

export type ExportJob = {
  deckId: string;
  format: ExportFormat;
  outDir: string;
  // 配布HTML のタイトルに使う
  title: string;
};

export type ExportOutput = {
  files: string[];
  overflow: OverflowReport[];
};

export type Exporter = {
  exportDeck: (job: ExportJob) => Promise<ExportOutput>;
  close: () => Promise<void>;
};

const READY_TIMEOUT_MS = 60_000;

type PrintStatus =
  | { ready: true; overflow: string | null }
  | { ready: false; message: string | null };

const waitForPrintPage = async (page: Page): Promise<OverflowReport[]> => {
  const handle = await page.waitForFunction(
    (): PrintStatus | null => {
      const ready = document.querySelector("[data-print-ready='true']");
      if (ready) {
        return { ready: true, overflow: ready.getAttribute("data-overflow") };
      }
      const error = document.querySelector("[data-print-error]");
      return error
        ? { ready: false, message: error.getAttribute("data-print-error") }
        : null;
    },
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  const status = (await handle.jsonValue()) as PrintStatus;
  if (!status.ready) {
    throw new Error(status.message ?? "書き出し用ページを開けない");
  }
  return JSON.parse(status.overflow ?? "[]") as OverflowReport[];
};

const writePdf = async (page: Page, outDir: string): Promise<string[]> => {
  const path = join(outDir, "deck.pdf");
  await page.pdf({
    path,
    width: `${SLIDE_WIDTH}px`,
    height: `${SLIDE_HEIGHT}px`,
    printBackground: true,
    preferCSSPageSize: true,
  });
  return [path];
};

// スクロールを伴うので、1枚ずつ順に撮る
const writePngs = async (page: Page, outDir: string): Promise<string[]> => {
  const slides = await page.locator("[data-print-root] .ds-slide").all();
  const paths = slides.map((_, index) =>
    join(outDir, `slide-${String(index + 1).padStart(2, "0")}.png`),
  );
  await slides.reduce<Promise<void>>(
    (previous, slide, index) =>
      previous.then(async () => {
        await slide.screenshot({ path: paths[index] });
      }),
    Promise.resolve(),
  );
  return paths;
};

// 受け取った人の画面幅に合わせる。JavaScript は入れないので、段階で縮める
const DISTRIBUTION_CSS = `
body {
  margin: 0;
  padding: 16px;
  background: #f1f5f9;
}
.print-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: max-content;
  margin: 0 auto;
}
.print-page {
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 0.12);
}
@media (max-width: 1320px) { .print-root { zoom: 0.75; } }
@media (max-width: 1000px) { .print-root { zoom: 0.55; } }
@media (max-width: 760px) { .print-root { zoom: 0.4; } }
@media (max-width: 560px) { .print-root { zoom: 0.28; } }
`;

// 要素の撮影はその要素の矩形を撮るので、上に載っている文字まで一緒に写る。
// 撮る間だけ対象以外を隠し、下に敷かれた色も外して、対象だけを透過で残す
const CAPTURE_CSS = `
.ds-slide,
.ds-card,
.ds-kpi,
.ds-two-col__column,
.ds-process__step,
.ds-image__frame { background: transparent !important; }

.ds-capture .ds-slide * { visibility: hidden !important; }
.ds-capture .ds-slide [data-capture-target],
.ds-capture .ds-slide [data-capture-target] * { visibility: visible !important; }
`;

const dataUrl = (bytes: Buffer, type: string): string =>
  `data:${type};base64,${bytes.toString("base64")}`;

const shoot = async (page: Page, captureId: string): Promise<Buffer> => {
  const target = page.locator(`[data-capture-id="${captureId}"]`);
  await target.evaluate((element) => {
    element.setAttribute("data-capture-target", "");
  });
  const image = await target.screenshot({ omitBackground: true });
  await target.evaluate((element) => {
    element.removeAttribute("data-capture-target");
  });
  return image;
};

// 画像は元のファイルを貼る。PowerPoint が扱えない SVG は撮った PNG に替える
const imageEntry = async (
  page: Page,
  item: { url: string; captureId: string },
): Promise<[string, string]> => {
  const response = await page.request.get(item.url).catch(() => undefined);
  const type = response?.headers()["content-type"] ?? "";
  if (!response?.ok() || type.includes("svg")) {
    return [
      item.captureId,
      dataUrl(await shoot(page, item.captureId), "image/png"),
    ];
  }
  return [item.captureId, dataUrl(await response.body(), type)];
};

// 撮影はページを1枚ずつ使うので順に流す。画像の読み込みは同時でよい
const collectPptxImages = async (
  page: Page,
  slides: readonly MeasuredSlide[],
): Promise<Map<string, string>> => {
  const items = slides.flatMap((slide) => slide.items);
  await page.addStyleTag({ content: CAPTURE_CSS });
  await page.evaluate(() => {
    document.documentElement.classList.add("ds-capture");
  });
  const captured = await items
    .flatMap((item) => (item.kind === "capture" ? [item.captureId] : []))
    .reduce<Promise<[string, string][]>>(
      (previous, captureId) =>
        previous.then(async (entries) => [
          ...entries,
          [captureId, dataUrl(await shoot(page, captureId), "image/png")],
        ]),
      Promise.resolve([]),
    );
  const loaded = await Promise.all(
    items
      .flatMap((item) => (item.kind === "image" ? [item] : []))
      .map((item) => imageEntry(page, item)),
  );
  return new Map([...captured, ...loaded]);
};

// ノートは画面に出さないので DOM の実測には乗らない。deck.json から別に取る
const fetchNotes = async (
  page: Page,
  origin: string,
  deckId: string,
): Promise<ReadonlyMap<string, string>> => {
  const response = await page.request
    .get(`${origin.replace(/\/+$/, "")}/api/decks/${deckId}`)
    .catch(() => undefined);
  const detail = response?.ok()
    ? ((await response.json()) as DeckDetail)
    : undefined;
  if (detail?.state !== "ready") {
    console.warn(`PPTX のノートを入れられない: ${deckId} を読めなかった`);
    return new Map();
  }
  return new Map(
    detail.deck.slides.flatMap((slide) =>
      slide.notes?.trim() ? [[slide.id, slide.notes] as const] : [],
    ),
  );
};

// 本文は文字のまま置き、装飾とアイコンだけを画像にする
const writePptx = async (
  page: Page,
  outDir: string,
  title: string,
  origin: string,
  deckId: string,
): Promise<string[]> => {
  const slides = await page.evaluate(measureSlides);
  const images = await collectPptxImages(page, slides);
  const notes = await fetchNotes(page, origin, deckId);
  const { buildPptx } = await import("./pptx.ts");
  const path = join(outDir, "deck.pptx");
  await writeFile(path, await buildPptx({ slides, images, title, notes }));
  return [path];
};

export type Asset = { url: string; name: string };

// 取りに行った画像やフォントの応答。playwright の応答をこの形にして渡す(テストでは偽物を渡す)
export type AssetResponse = { ok: boolean; body: () => Promise<Buffer> };

// 取れた画像とフォントだけを返す。取れなかったもの(404 など)は写さない。
// 前は応答の中身(エラーの JSON)をそのまま画像の名前で書いていた
export const fetchAssets = async (
  assets: readonly Asset[],
  get: (url: string) => Promise<AssetResponse>,
): Promise<{ asset: Asset; body: Buffer }[]> =>
  (
    await Promise.all(
      assets.map(async (asset) => {
        const response = await get(asset.url).catch(() => undefined);
        return response?.ok ? { asset, body: await response.body() } : null;
      }),
    )
  ).flatMap((entry) => (entry ? [entry] : []));

const assetName = (url: string, used: Set<string>): string => {
  const base =
    decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "") ||
    "asset";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = used.has(clean) ? `${used.size}-${clean}` : clean;
  used.add(unique);
  return unique;
};

// 実際に読み込まれたフォントと画像だけを写す
const collectAssets = async (page: Page): Promise<Asset[]> => {
  const urls = await page.evaluate(() => [
    ...new Set(
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) =>
          /\.(?:woff2?|png|jpe?g|gif|webp|svg)(?:\?.*)?$/i.test(name),
        ),
    ),
  ]);
  const used = new Set<string>();
  return urls.map((url) => ({ url, name: assetName(url, used) }));
};

const captureCss = (page: Page): Promise<string> =>
  page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .join("\n"),
  );

const rewriteAssetUrls = (
  text: string,
  assets: readonly Asset[],
  prefix: string,
): string =>
  assets.reduce((current, asset) => {
    const { pathname, search } = new URL(asset.url);
    return [asset.url, `${pathname}${search}`].reduce(
      (replaced, from) => replaced.split(from).join(`${prefix}${asset.name}`),
      current,
    );
  }, text);

// 写していないフォントは、参照だけ残らないよう @font-face ごと落とす
const dropUnusedFontFaces = (css: string): string =>
  css.replace(/@font-face\s*{[^}]*}/g, (block) =>
    block.includes("./") ? block : "",
  );

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 配布HTML。描画済みの中身と、使われた CSS・フォント・画像を1フォルダに集める
const writeHtml = async (
  page: Page,
  outDir: string,
  title: string,
): Promise<string[]> => {
  const assetsDir = join(outDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  const fetched = await fetchAssets(await collectAssets(page), (url) =>
    page.request
      .get(url)
      .then((response) => ({ ok: response.ok(), body: () => response.body() })),
  );
  await Promise.all(
    fetched.map(({ asset, body }) =>
      writeFile(join(assetsDir, asset.name), body),
    ),
  );
  // 参照を書き換えるのは写せたものだけ。取れなかった画像は元の参照のまま残り、画面と同じく出ない
  const assets = fetched.map(({ asset }) => asset);

  const css = dropUnusedFontFaces(
    rewriteAssetUrls(await captureCss(page), assets, "./"),
  );
  await writeFile(
    join(assetsDir, "style.css"),
    `${css}\n${DISTRIBUTION_CSS}`,
    "utf8",
  );

  const body = rewriteAssetUrls(
    await page
      .locator("[data-print-root]")
      .evaluate((element) => element.outerHTML),
    assets,
    "assets/",
  );
  const path = join(outDir, "index.html");
  await writeFile(
    path,
    [
      "<!doctype html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      `<title>${escapeHtml(title)}</title>`,
      '<link rel="stylesheet" href="assets/style.css" />',
      "</head>",
      `<body>${body}</body>`,
      "</html>",
      "",
    ].join("\n"),
    "utf8",
  );
  return [path];
};

// ブラウザは最初の書き出しで起動して使い回す。書き出しは同時に1件だけ
export const createExporter = ({
  getOrigin,
}: {
  getOrigin: () => string | undefined;
}): Exporter => {
  const state: { browser?: Promise<Browser>; queue: Promise<unknown> } = {
    queue: Promise.resolve(),
  };

  const getBrowser = (): Promise<Browser> => {
    state.browser ??= import("playwright").then(({ chromium }) =>
      chromium.launch(),
    );
    return state.browser;
  };

  const run = async ({ deckId, format, outDir, title }: ExportJob) => {
    const origin = getOrigin();
    if (!origin) throw new Error("サーバーの URL がまだ決まっていない");
    const browser = await getBrowser();
    const page = await browser.newPage({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: 1,
    });
    try {
      await page.goto(`${origin.replace(/\/+$/, "")}/print/${deckId}`);
      const overflow = await waitForPrintPage(page);
      await mkdir(outDir, { recursive: true });
      const writers = {
        pdf: () => writePdf(page, outDir),
        png: () => writePngs(page, outDir),
        html: () => writeHtml(page, outDir, title),
        pptx: () => writePptx(page, outDir, title, origin, deckId),
      };
      const files = await writers[format]();
      return { files, overflow };
    } finally {
      await page.close();
    }
  };

  return {
    exportDeck: (job) => {
      const result = state.queue.then(() => run(job));
      state.queue = result.catch(() => undefined);
      return result;
    },
    close: async () => {
      const browser = state.browser;
      state.browser = undefined;
      if (browser) await (await browser).close();
    },
  };
};
