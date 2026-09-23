import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SheetBase } from "../src/schema/design.ts";
import type { DocumentFile } from "../src/schema/document.ts";
import type { Locale } from "../src/schema/profile.ts";
import type { SheetAnswers, SheetDocument } from "../src/schema/sheet.ts";
import { readTemplate } from "./design.ts";
import { documentImageSrcs } from "./document-images.ts";
import { documentBody } from "./document-render.ts";
import { loadImageDataUrls } from "./handout-assets.ts";
import { HANDOUT_STRINGS } from "./handout-i18n.ts";
import type { HandoutKind } from "./handouts.ts";
import { sheetScript } from "./sheet-client.ts";
import { escapeHtml, sheetBody, sheetView } from "./sheet-render.ts";

// 質問票と HTML 資料を、テンプレートの CSS を埋めた1枚の HTML にする。
// 画面の見本(preview)も書き出し(export)も中身は同じものを作るので、見えているものがそのまま配れる。
// 書体の読み方だけが違う。画面は CSP で外を止めるので design build が写した自前の書体を self で読み、
// 書き出しは1ファイルで持ち運べるよう今までどおり Google Fonts の link を埋める

export type FontSource = "hosted" | "external";

const FONT_LINK: Record<FontSource, string> = {
  hosted: '<link rel="stylesheet" href="/api/design/files/dist/fonts.css" />',
  external:
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&amp;display=swap" />',
};

// 区分ごとに読む CSS。1枚目がテンプレート(変数と専用の CSS)、残りは部品
const STYLES: Record<HandoutKind, readonly string[]> = {
  sheet: ["document.css", "interaction.css"],
  document: ["document.css"],
};

// テンプレートの CSS(pnpm design:build が作る)。テンプレートを消したあとの資料はここで見つからなくなる
export const templateCssPath = (
  designDir: string,
  kind: HandoutKind,
  template: string,
): string => join(designDir, "dist", kind, `${template}.css`);

export const hasTemplateCss = (
  designDir: string,
  kind: HandoutKind,
  template: string,
): Promise<boolean> =>
  access(templateCssPath(designDir, kind, template)).then(
    () => true,
    () => false,
  );

const readCss = async (
  designDir: string,
  kind: HandoutKind,
  template: string,
): Promise<string> => {
  const paths = [
    templateCssPath(designDir, kind, template),
    ...STYLES[kind].map((name) => join(designDir, "dist", name)),
  ];
  const parts = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  return parts.join("\n");
};

// </style>・</script> で閉じられないように、埋める中身の < を逃がす
const safeInline = (text: string): string => text.replaceAll("</", "<\\/");

const page = ({
  title,
  css,
  body,
  script,
  fonts,
  lang = "ja",
}: {
  title: string;
  css: string;
  body: string;
  script?: string;
  fonts: FontSource;
  // 画面の文言の言語。<html lang> に出す
  lang?: Locale;
}): string =>
  [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    FONT_LINK[fonts],
    `<style>${safeInline(css)}</style>`,
    "</head>",
    "<body>",
    body,
    ...(script ? [`<script>${safeInline(script)}</script>`] : []),
    "</body>",
    "</html>",
    "",
  ].join("\n");

// 質問票の骨格(レイアウト)。控え(HandoutMeta.layout)で明示に選んでいればそれを使い、
// 無ければテンプレートが選んでいる骨格。テンプレートも読めなければ1問ずつ(focus)
export const sheetBaseOf = async (
  designDir: string,
  template: string,
  override?: SheetBase,
): Promise<SheetBase> => {
  if (override) return override;
  const found = await readTemplate(designDir, "sheet", template);
  return found.success ? found.value.layout.base : "focus";
};

export const renderSheetHtml = async ({
  designDir,
  template,
  doc,
  answers,
  layout,
  orgName,
  fonts = "hosted",
  share = false,
}: {
  designDir: string;
  template: string;
  doc: SheetDocument;
  answers?: SheetAnswers;
  layout?: SheetBase;
  // 設定の組織名。題名の上に出す
  orgName?: string;
  // 既定は画面(self の書体)。書き出しだけ external を渡す
  fonts?: FontSource;
  // 共有用の束。「ファイルで保存」を出さない印を付ける
  share?: boolean;
}): Promise<string> => {
  const base = await sheetBaseOf(designDir, template, layout);
  // 画面の文言の言語。資料に無ければ ja で描く
  const lang: Locale = doc.lang ?? "ja";
  return page({
    title: `${doc.title} — ${HANDOUT_STRINGS[lang].sheet.titleSuffix}`,
    css: await readCss(designDir, "sheet", template),
    body: sheetBody(
      { ...sheetView(doc, answers, 0, lang), ...(orgName ? { orgName } : {}) },
      base,
      true,
      share,
    ),
    // 質問を移動するだけのスクリプト。回答の保存・送信は持たない
    script: sheetScript(lang),
    fonts,
    lang,
  });
};

// 中身の出どころ。正本は document.json で、body は移行期の受け口
// (document.json を持たない資料の document.html)
export type DocumentSource =
  | { readonly doc: DocumentFile }
  | { readonly body: string };

export const renderDocumentHtml = async (
  input: {
    designDir: string;
    template: string;
    title: string;
    // 設定の組織名。資料の署名に組織名が無いときに出す
    orgName?: string;
    // 既定は画面(self の書体)。書き出しだけ external を渡す
    fonts?: FontSource;
    // 資料の assets/。画像はここから読んで data: で埋め込む
    assetsDir?: string;
  } & DocumentSource,
): Promise<string> =>
  page({
    title: input.title,
    css: await readCss(input.designDir, "document", input.template),
    body:
      "doc" in input
        ? documentBody(
            input.doc,
            input.orgName,
            input.assetsDir
              ? await loadImageDataUrls(
                  documentImageSrcs(input.doc),
                  input.assetsDir,
                )
              : new Map(),
            // 画面の文言の言語。資料に無ければ ja で描く
            input.doc.lang ?? "ja",
          )
        : input.body,
    fonts: input.fonts ?? "hosted",
    lang: "doc" in input ? (input.doc.lang ?? "ja") : "ja",
  });
