import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type FigureInput,
  pageHtml,
  validate,
} from "../../design/figure/render.mjs";
import {
  sampleDeck,
  templateSampleAssetDir,
} from "../src/design/sample-deck.ts";
import { GENERATED_NOTE } from "../src/design/theme.ts";
import { SlideView } from "../src/renderer/SlideView.tsx";
import type { Slide } from "../src/schema/deck.ts";
import type { Locale } from "../src/schema/profile.ts";
import {
  figureExamples,
  readSelection,
  readSlideSample,
  SAMPLE_LANGS,
  templateAssetNames,
  templateAssetsDir,
  templateNames,
} from "./design.ts";
import { documentSampleBody } from "./document-sample.ts";
import {
  SHEET_LAYOUTS,
  type SheetLayout,
  sheetSampleBody,
} from "./sheet-sample.ts";

// design/samples/ の見本と、図の生成器の見本(dist/figure/examples/*.html)。
// どれも生成 CSS だけで描く。デザインページの iframe はスクリプトを動かさない

// 言語ごとの見本の置き場。日本語は samples/ の直下、ほかの言語は samples/<言語>/ に同じ名前で置く
const sampleDir = (lang: Locale): string =>
  lang === "ja" ? "samples" : `samples/${lang}`;

// 見本の HTML から design/ への相対。samples/<言語>/ は1段深い
const designRoot = (lang: Locale): string => (lang === "ja" ? ".." : "../..");

// 見本の題
const TITLES = {
  ja: {
    slide: "スライドの見本",
    template: (label: string) => `${label}の見本`,
    document: "文書の見本",
    sheet: (layout: SheetLayout) => `質問票の見本(${layout})`,
  },
  en: {
    slide: "Slide sample",
    template: (label: string) => `${label} sample`,
    document: "Document sample",
    sheet: (layout: SheetLayout) => `Question sheet sample (${layout})`,
  },
} as const satisfies Record<Locale, unknown>;

const htmlPage = ({
  title,
  styles,
  head = [],
  body,
  lang,
}: {
  title: string;
  styles: readonly string[];
  head?: readonly string[];
  body: string;
  lang: Locale;
}): string =>
  [
    "<!doctype html>",
    `<!-- ${GENERATED_NOTE} -->`,
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${title}</title>`,
    // 見本の iframe は CSP で外の書体を止めるので、design build が写した自前の書体を self で読む
    `<link rel="stylesheet" href="${designRoot(lang)}/dist/fonts.css" />`,
    ...styles.map(
      (href) =>
        `<link rel="stylesheet" href="${designRoot(lang)}/dist/${href}" />`,
    ),
    ...head,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");

// スライドを並べた1枚の HTML。
// 読む slide/tokens.css は既定のテンプレートの写しなので、専用の CSS が効くよう既定の名前を付ける
// (配信のときに ?template=<名前> でその CSS と名前に差し替わる)
const slideDeckHtml = (
  title: string,
  slides: readonly Slide[],
  template: string,
  lang: Locale,
  assetBaseUrl = ".",
): string => {
  const body = slides
    .map((slide, index) =>
      renderToStaticMarkup(
        createElement(SlideView, {
          slide,
          context: {
            pageNumber: index + 1,
            pageCount: slides.length,
            assetBaseUrl,
            // 変数は見本が読む slide/tokens.css に任せ、要素には当てない
            themeVariables: {},
            template,
          },
        }),
      ),
    )
    .join("\n");
  return htmlPage({
    title,
    lang,
    styles: ["slide/tokens.css", "slide.css"],
    head: [
      "<style>",
      "body { margin: 0; padding: var(--space-slide); background: var(--color-chip); }",
      "main { display: grid; gap: var(--space-slide); justify-content: center; }",
      ".ds-slide { box-shadow: var(--shadow-canvas); }",
      "</style>",
    ],
    body: ["<main>", body, "</main>"].join("\n"),
  });
};

// design/samples/slide.html。全ブロック種を描く。部品の見え方を測る
export const slideSampleHtml = (
  template: string,
  lang: Locale = "ja",
): string =>
  slideDeckHtml(TITLES[lang].slide, sampleDeck(lang).slides, template, lang);

// design/samples/slide.<名前>.html。そのテンプレートが持つ中身の見本(sample.json)を描く。
// 一覧のカードと編集画面が出すものと同じ資料なので、はみ出しと明暗差はここで測れる。
// 英語(samples/en/)は sample.en.json を描き、無ければ日本語の見本を描く
const templateSampleHtmls = async (
  designDir: string,
  lang: Locale,
): Promise<(readonly [string, string])[]> => {
  const names = await templateNames(designDir, "slide");
  const samples = await Promise.all(
    names.map(async (name) => ({
      name,
      sample: await readSlideSample(designDir, name, lang),
    })),
  );
  return samples.flatMap(({ name, sample }) =>
    sample
      ? [
          [
            `${sampleDir(lang)}/slide.${name}.html`,
            slideDeckHtml(
              TITLES[lang].template(sample.label ?? name),
              sample.slides,
              name,
              lang,
              lang === "ja"
                ? templateSampleAssetDir(name)
                : `../${templateSampleAssetDir(name)}`,
            ),
          ] as const,
        ]
      : [],
  );
};

// design/samples/slide.<名前>/assets/*.svg。テンプレートに同梱した絵の写し。
// 見本の HTML と画面の見本は、作った資料と同じ src(assets/<ファイル>)でここから読む
const templateSampleAssets = async (
  designDir: string,
): Promise<(readonly [string, string])[]> => {
  const names = await templateNames(designDir, "slide");
  const files = await Promise.all(
    names.map(async (name) =>
      Promise.all(
        (await templateAssetNames(designDir, name)).map(
          async (file) =>
            [
              `samples/${templateSampleAssetDir(name)}/assets/${file}`,
              await readFile(
                join(templateAssetsDir(designDir, name), file),
                "utf8",
              ),
            ] as const,
        ),
      ),
    ),
  );
  return files.flat();
};

// 消えたテンプレートや絵の写しを samples/ に残さない
export const pruneSampleAssets = async (
  designDir: string,
  outputs: ReadonlyMap<string, string>,
): Promise<void> => {
  const samplesDir = join(designDir, "samples");
  const folders = (
    await readdir(samplesDir, { withFileTypes: true }).catch(() => [])
  ).filter((entry) => entry.isDirectory() && entry.name.startsWith("slide."));
  await Promise.all(
    folders.map(async (folder) => {
      const assets = join(samplesDir, folder.name, "assets");
      const stale = (await readdir(assets).catch(() => [] as string[])).filter(
        (file) => !outputs.has(`samples/${folder.name}/assets/${file}`),
      );
      await Promise.all(stale.map((file) => rm(join(assets, file))));
      const left = await readdir(assets).catch(() => [] as string[]);
      if (left.length === 0) {
        await rm(join(samplesDir, folder.name), {
          recursive: true,
          force: true,
        });
      }
    }),
  );
};

// design/samples/document.html。文書の部品を1枚に並べる。
// DOM の正は document-render.ts、中身は document-sample.ts。
// 骨格(本文幅・脇・目次)はテーマの --doc-* が決める
export const documentSampleHtml = (lang: Locale = "ja"): string =>
  htmlPage({
    title: TITLES[lang].document,
    lang,
    styles: ["document/tokens.css", "document.css"],
    body: documentSampleBody(lang),
  });

// design/samples/sheet.<骨格>.html。質問票の画面を、client.js が作る DOM のまま静的に描く。
// DOM の正は sheet-sample.ts
export const sheetSampleHtml = (
  layout: SheetLayout,
  lang: Locale = "ja",
): string =>
  htmlPage({
    title: TITLES[lang].sheet(layout),
    lang,
    styles: ["sheet/tokens.css", "document.css", "interaction.css"],
    body: sheetSampleBody(layout, lang),
  });

// dist/figure/examples/*.html。検査に通る入力だけを、default のテンプレートで単体の HTML にする
const figureExamplePages = async (
  designDir: string,
): Promise<(readonly [string, string])[]> => {
  const css = (
    await Promise.all(
      ["document/default.css", "document.css"].map((name) =>
        readFile(join(designDir, "dist", name), "utf8"),
      ),
    )
  )
    .map((text) => text.trimEnd())
    .join("\n");
  const examples = await Promise.all(
    (await figureExamples(designDir)).map(async (path) => {
      const input: unknown = JSON.parse(
        await readFile(join(designDir, path), "utf8"),
      );
      return { path, input };
    }),
  );
  return examples
    .filter(({ input }) => validate(input).length === 0)
    .map(({ path, input }) => [
      `dist/${path.replace(/\.json$/, ".html")}`,
      pageHtml(input as FigureInput, css),
    ]);
};

// 1つの言語の見本の HTML。同梱の絵は言語によらず samples/slide.<名前>/assets/ の1組を読む
const localizedSampleHtmls = async (
  designDir: string,
  slideTemplate: string,
  lang: Locale,
): Promise<(readonly [string, string])[]> => [
  [`${sampleDir(lang)}/slide.html`, slideSampleHtml(slideTemplate, lang)],
  ...(await templateSampleHtmls(designDir, lang)),
  [`${sampleDir(lang)}/document.html`, documentSampleHtml(lang)],
  ...SHEET_LAYOUTS.map(
    (layout) =>
      [
        `${sampleDir(lang)}/sheet.${layout}.html`,
        sheetSampleHtml(layout, lang),
      ] as const,
  ),
];

// 生成 CSS(dist/)を読むので、CSS を書いた後に呼ぶ
export const sampleOutputs = async (
  designDir: string,
): Promise<Map<string, string>> => {
  const selection = await readSelection(designDir);
  if (!selection.success) throw new Error(selection.message);
  const localized = await Promise.all(
    (["ja", ...SAMPLE_LANGS] as const).map((lang) =>
      localizedSampleHtmls(designDir, selection.value.slide, lang),
    ),
  );
  return new Map([
    ...localized.flat(),
    ...(await templateSampleAssets(designDir)),
    ...(await figureExamplePages(designDir)),
  ]);
};
