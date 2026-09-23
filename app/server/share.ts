import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SHARE_URL_PREFIX,
  type ShareState,
  shareStateSchema,
} from "../src/schema/share.ts";
import { readDocumentSource } from "./document-source.ts";
import {
  readMeta,
  readSheetDocument,
  renderHandout,
  type StoreFailure,
} from "./handout-store.ts";
import { type HandoutKind, handoutDir } from "./handouts.ts";
import { readJsonFile, writeJsonAtomic } from "./workspace.ts";

// 質問票と HTML 資料を、Claude の Artifact に配れる束(index.html と画像のファイルだけ)にする。
// スライドの共有は次の段。束の中身は書き出し(handout-store.ts の exportHandout)と同じ HTML から作る

export { SHARE_URL_PREFIX };

export const shareDirOf = (
  root: string,
  kind: HandoutKind,
  id: string,
): string => join(handoutDir(root, kind, id), "share");

// share/ の外、資料のフォルダの直下に置く。束を作り直しても消えない
export const shareStatePathOf = (
  root: string,
  kind: HandoutKind,
  id: string,
): string => join(handoutDir(root, kind, id), "share.json");

export const readShareState = async (
  root: string,
  kind: HandoutKind,
  id: string,
): Promise<ShareState | undefined> => {
  const file = await readJsonFile(shareStatePathOf(root, kind, id), (input) => {
    const result = shareStateSchema.safeParse(input);
    return result.success
      ? { success: true as const, value: result.data }
      : { success: false as const, message: result.error.message };
  });
  return file.state === "ready" ? file.value : undefined;
};

export const writeShareState = (
  root: string,
  kind: HandoutKind,
  id: string,
  url: string,
  now: Date,
): Promise<void> =>
  writeJsonAtomic(shareStatePathOf(root, kind, id), {
    target: "claude-artifact",
    url,
    sharedAt: now.toISOString(),
  } satisfies ShareState);

// 文字のファイル(index.html)の目安の上限。公開の前にエージェントが読む量がおよそ3万トークンになる大きさ。
// 超えても止めず、警告だけ出す
const TEXT_BYTES_LIMIT = 100_000;

const PLACEHOLDER = "[[要確認]]";

const MIME_EXT: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  "svg+xml": "svg",
};

const extOf = (mime: string): string => {
  const lower = mime.toLowerCase();
  return MIME_EXT[lower] ?? lower.replace(/[^a-z0-9]/g, "");
};

export type ExtractedImage = { readonly name: string; readonly bytes: Buffer };

// SVG の <image href="data:…">(xlink:href も)と <img src="data:…"> の両方を拾い、番号のファイル名に置き換える。
// 本文はエージェントが手で書くので、引用符は " と '、= の前後の空白、種類の大文字、
// ;base64 の前の引数(;charset=… など)、base64 の途中の改行も受ける。
// 同じ画像(空白を除いた同じ base64)は最初に出た番号のファイルにまとめる
const DATA_IMAGE =
  /\b(src|href)(\s*=\s*)(["'])data:image\/([a-z0-9+.-]+)(?:;[a-z0-9-]+=[^;,"']*)*;base64,([a-z0-9+/=\s]+)\3/gi;

// 置き換えのあとに残った data: の画像(srcset・style の url()・base64 でない SVG など)。見つけたら警告する
const LEFTOVER_IMAGE =
  /\b(?:src|href|srcset)\s*=\s*["']\s*data:image\/|url\(\s*["']?\s*data:image\//i;

export const extractImages = (
  html: string,
): { html: string; images: readonly ExtractedImage[] } => {
  const named = new Map<string, string>();
  const images: ExtractedImage[] = [];
  const replaced = html.replaceAll(
    DATA_IMAGE,
    (
      _whole,
      attr: string,
      equals: string,
      quote: string,
      mime: string,
      raw: string,
    ) => {
      const base64 = raw.replace(/\s+/g, "");
      const existing = named.get(base64);
      const name = existing ?? `img-${images.length + 1}.${extOf(mime)}`;
      if (!existing) {
        named.set(base64, name);
        images.push({ name, bytes: Buffer.from(base64, "base64") });
      }
      return `${attr}${equals}${quote}${name}${quote}`;
    },
  );
  return { html: replaced, images };
};

export const hasLeftoverImage = (html: string): boolean =>
  LEFTOVER_IMAGE.test(html);

// [[要確認]] は正本(questions.json・document.json)で数える。HTML では題名が目次や
// data-qtitle にも写るので、同じ1か所が何度も数えられる
const placeholdersOf = async (
  root: string,
  kind: HandoutKind,
  id: string,
): Promise<number> => {
  const count = (value: unknown): number =>
    JSON.stringify(value).split(PLACEHOLDER).length - 1;
  if (kind === "sheet") {
    const doc = await readSheetDocument(root, id);
    return doc.state === "ready" ? count(doc.value) : 0;
  }
  const meta = await readMeta(root, kind, id);
  if (meta.state !== "ready") return 0;
  const source = await readDocumentSource(root, meta.value);
  return source.state === "ready" ? count(source.doc) : 0;
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 ? `${Math.round(bytes / 1024)}KB` : `${bytes}B`;

export type ShareFile = { readonly name: string; readonly bytes: number };

export type ShareBuildResult =
  | {
      success: true;
      bundleDir: string;
      files: readonly ShareFile[];
      textBytes: number;
      warning?: string;
    }
  | StoreFailure;

// 束を作り直す。share/ を空にしてから index.html と画像を置く。share.json(束の外)は消さない
export const buildShareBundle = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
): Promise<ShareBuildResult> => {
  // 質問票だけ、「ファイルで保存」を出さない data-share の印を付ける
  const rendered = await renderHandout(
    root,
    designDir,
    kind,
    id,
    "external",
    kind === "sheet",
  );
  if (!rendered.success) return rendered;
  const { html, images } =
    kind === "document"
      ? extractImages(rendered.html)
      : { html: rendered.html, images: [] as readonly ExtractedImage[] };

  const dir = shareDirOf(root, kind, id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
  await Promise.all(
    images.map((image) => writeFile(join(dir, image.name), image.bytes)),
  );

  const textBytes = Buffer.byteLength(html, "utf8");
  const placeholders = await placeholdersOf(root, kind, id);
  const warnings = [
    ...(textBytes > TEXT_BYTES_LIMIT
      ? [
          `文字のファイルが ${formatBytes(textBytes)} ある(目安の ${formatBytes(TEXT_BYTES_LIMIT)} を超えている)`,
        ]
      : []),
    ...(placeholders > 0
      ? [`${PLACEHOLDER} が ${placeholders} か所残っている`]
      : []),
    ...(kind === "document" && hasLeftoverImage(html)
      ? [
          "ファイルに出せなかった data: の画像が index.html に残っている(Artifact では読む量が増える)",
        ]
      : []),
  ];

  return {
    success: true,
    bundleDir: dir,
    files: [
      { name: "index.html", bytes: textBytes },
      ...images.map((image) => ({
        name: image.name,
        bytes: image.bytes.length,
      })),
    ],
    textBytes,
    ...(warnings.length > 0 ? { warning: warnings.join(" / ") } : {}),
  };
};

// Claude Code に渡す依頼文。前に公開した URL(share.json)があれば、更新の依頼にする。
// warning は画面のボタンから渡す。コマンドは warning の行を別に出すので渡さない。
// 画面の知らせは消えるので、貼った先のエージェントにも警告が届くよう依頼文に入れる
export const formatShareRequest = ({
  id,
  bundleDir,
  files,
  previousUrl,
  warning,
}: {
  id: string;
  bundleDir: string;
  files: readonly ShareFile[];
  previousUrl?: string;
  warning?: string;
}): string => {
  const images = files.filter((file) => file.name !== "index.html");
  const lead = previousUrl
    ? `${previousUrl} の Artifact を、次の束で更新してください。`
    : "次の束を Claude の Artifact として公開してください。";
  const shareCommand = previousUrl
    ? `更新したら \`ai-handout-studio share ${id} --url ${previousUrl}\` を実行して残す(URL は変わらない)`
    : `公開したら \`ai-handout-studio share ${id} --url <公開した URL>\` を実行して URL を残す`;
  return [
    lead,
    `- 束の場所: ${join(bundleDir, "index.html")}`,
    "- 中身を変えずにそのまま公開する。デザインは直さない",
    ...(images.length > 0
      ? [
          `- 画像は files で相対パスのまま渡す(${images.map((file) => file.name).join("・")})`,
        ]
      : []),
    `- ${shareCommand}`,
    "- 公開リンクにするかどうかは本人が Artifact の画面の Share から選ぶ。エージェントは公開リンクにしない",
    "- 資料に入っている名前(署名など)は、公開リンクにすると誰でも読める",
    ...(warning ? [`- 束の警告: ${warning}。公開したら本人に伝える`] : []),
  ].join("\n");
};

// share <id> の出力。`名前: 値` の行のあとに空行を挟み、依頼文を続ける
export const formatShareBuild = ({
  kind,
  id,
  bundleDir,
  files,
  textBytes,
  warning,
  previousUrl,
}: {
  kind: HandoutKind;
  id: string;
  bundleDir: string;
  files: readonly ShareFile[];
  textBytes: number;
  warning?: string;
  previousUrl?: string;
}): string =>
  [
    `kind: ${kind}`,
    `id: ${id}`,
    `bundle: ${bundleDir}`,
    `files: ${files.map((file) => `${file.name} (${formatBytes(file.bytes)})`).join(", ")}`,
    `textBytes: ${textBytes}`,
    ...(previousUrl ? [`url: ${previousUrl}`] : []),
    ...(warning ? [`warning: ${warning}`] : []),
    "",
    formatShareRequest({ id, bundleDir, files, previousUrl }),
  ].join("\n");

// share <id> --url <URL> の出力
export const formatShareUrl = ({
  kind,
  id,
  url,
}: {
  kind: HandoutKind;
  id: string;
  url: string;
}): string => [`kind: ${kind}`, `id: ${id}`, `url: ${url}`].join("\n");
