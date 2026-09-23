import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type HandoutKind, handoutDir } from "./handouts.ts";
import { readAssetFrom } from "./workspace.ts";

// 質問票と HTML 資料の画像。ファイルは資料フォルダの assets/ に置き、JSON は assets/<名前> で指す。
// 保存のとき、assets/ に無い画像(手元のファイルのパス)を assets/ へ写して参照を書き換える。
// 描くとき(プレビュー・原寸・書き出し・共有)は data: にして埋め込む。assets/ は足すだけで消さない

export const ASSET_PREFIX = "assets/";

// 1枚の上限。超えたら拒む。警告の目安を超えたら知らせる(止めない)
export const IMAGE_LIMIT_BYTES = 3 * 1024 * 1024;
export const IMAGE_WARN_BYTES = 1024 * 1024;

type ImageType = {
  readonly ext: "png" | "jpg" | "webp";
  readonly mime: string;
};

// 受け付けるのは PNG・JPEG・WebP だけ。SVG はスクリプトを持てるので受けない。拡張子ではなく中身の先頭で見る
export const sniffImage = (bytes: Uint8Array): ImageType | undefined => {
  const starts = (sig: readonly number[], at = 0): boolean =>
    sig.every((value, index) => bytes[at + index] === value);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", mime: "image/png" };
  }
  if (starts([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", mime: "image/webp" };
  }
  return undefined;
};

const IMAGE_CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
]);

export const assetsDirOf = (
  root: string,
  kind: HandoutKind,
  id: string,
): string => join(handoutDir(root, kind, id), "assets");

const isAssetSrc = (src: string): boolean => src.startsWith(ASSET_PREFIX);

// assets/ の中の画像を読む。外へ出るパス・受け付けない種類・無いファイルは undefined
const readStoredImage = async (
  assetsDir: string,
  src: string,
): Promise<Uint8Array | undefined> => {
  if (!isAssetSrc(src)) return undefined;
  const asset = await readAssetFrom(
    assetsDir,
    src.slice(ASSET_PREFIX.length),
    IMAGE_CONTENT_TYPES,
  );
  return asset && sniffImage(asset.body) ? asset.body : undefined;
};

const hashOf = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

// 取り込む前の画像。検査を通ったものだけ
export type PreparedImage = {
  readonly src: string;
  readonly bytes: Uint8Array;
  readonly type: ImageType;
};

export type PreparedImages =
  | {
      readonly success: true;
      readonly images: readonly PreparedImage[];
      readonly warnings: readonly string[];
    }
  | { readonly success: false; readonly message: string };

const readLocal = async (path: string): Promise<Uint8Array | undefined> => {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return undefined;
  }
};

// 取り込む画像を読んで確かめる。まだ何も書かない(資料の場所を確保する前に失敗を返すため)。
// assets/ で始まり、資料の assets/ にあるものはそのまま。無ければ baseDir(JSON のファイルの場所)から探す。
// baseDir が無い保存(画面から)では、assets/ に無い画像は拒む
export const prepareImages = async (
  srcs: readonly string[],
  options: { readonly assetsDir?: string; readonly baseDir?: string },
): Promise<PreparedImages> => {
  const unique = [...new Set(srcs)];
  const results = await Promise.all(
    unique.map(async (src) => {
      if (
        options.assetsDir &&
        (await readStoredImage(options.assetsDir, src)) !== undefined
      ) {
        return { src, state: "stored" as const };
      }
      if (!options.baseDir) {
        return {
          src,
          state: "error" as const,
          message: `画像 "${src}" が資料の assets/ に無い`,
        };
      }
      const bytes = await readLocal(resolve(options.baseDir, src));
      if (!bytes) {
        return {
          src,
          state: "error" as const,
          message: `画像が見つからない: ${src}`,
        };
      }
      if (bytes.byteLength > IMAGE_LIMIT_BYTES) {
        return {
          src,
          state: "error" as const,
          message: `画像が大きすぎる(3MB まで): ${src}`,
        };
      }
      const type = sniffImage(bytes);
      if (!type) {
        return {
          src,
          state: "error" as const,
          message: `画像は PNG・JPEG・WebP だけ受け付ける: ${src}`,
        };
      }
      return { src, state: "ready" as const, bytes, type };
    }),
  );
  const errors = results.flatMap((result) =>
    result.state === "error" ? [result.message] : [],
  );
  if (errors.length > 0) return { success: false, message: errors.join("\n") };
  const images = results.flatMap((result) =>
    result.state === "ready"
      ? [{ src: result.src, bytes: result.bytes, type: result.type }]
      : [],
  );
  return {
    success: true,
    images,
    warnings: images
      .filter((image) => image.bytes.byteLength > IMAGE_WARN_BYTES)
      .map(
        (image) =>
          `画像が 1MB を超えている(配る HTML が重くなる。撮る大きさを小さくする): ${image.src}`,
      ),
  };
};

const IMAGE_NAME = /^img-(\d+)\.(png|jpg|webp)$/;

// assets/ へ写し、元の src から新しい src(assets/img-<番号>.<拡張子>)への対応を返す。
// 同じ中身は、すでにある画像も含めて同じ名前にまとめる
export const storeImages = async (
  images: readonly PreparedImage[],
  assetsDir: string,
): Promise<ReadonlyMap<string, string>> => {
  if (images.length === 0) return new Map();
  await mkdir(assetsDir, { recursive: true });
  const names = (await readdir(assetsDir)).filter((name) =>
    IMAGE_NAME.test(name),
  );
  const existing = new Map(
    await Promise.all(
      names.map(
        async (name) =>
          [hashOf(await readFile(join(assetsDir, name))), name] as const,
      ),
    ),
  );
  const firstNumber =
    Math.max(0, ...names.map((name) => Number(IMAGE_NAME.exec(name)?.[1]))) + 1;
  // 番号は順に振るので、書き込みは1枚ずつ進める
  const { mapping } = await images.reduce<
    Promise<{ mapping: Map<string, string>; next: number }>
  >(
    async (pending, image) => {
      const state = await pending;
      const hash = hashOf(image.bytes);
      const known = existing.get(hash);
      if (known) {
        state.mapping.set(image.src, `${ASSET_PREFIX}${known}`);
        return state;
      }
      const name = `img-${state.next}.${image.type.ext}`;
      await writeFile(join(assetsDir, name), image.bytes);
      existing.set(hash, name);
      state.mapping.set(image.src, `${ASSET_PREFIX}${name}`);
      return { mapping: state.mapping, next: state.next + 1 };
    },
    Promise.resolve({ mapping: new Map<string, string>(), next: firstNumber }),
  );
  return mapping;
};

// 描くときの埋め込み。assets/ の画像を data: にした対応表。読めない画像は入れない(描画側が「見つからない」を出す)
export const loadImageDataUrls = async (
  srcs: readonly string[],
  assetsDir: string,
): Promise<ReadonlyMap<string, string>> =>
  new Map(
    (
      await Promise.all(
        [...new Set(srcs)].map(async (src) => {
          const bytes = await readStoredImage(assetsDir, src);
          const type = bytes && sniffImage(bytes);
          return bytes && type
            ? [
                [
                  src,
                  `data:${type.mime};base64,${Buffer.from(bytes).toString("base64")}`,
                ] as const,
              ]
            : [];
        }),
      )
    ).flat(),
  );
