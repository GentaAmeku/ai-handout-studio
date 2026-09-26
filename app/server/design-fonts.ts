import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 画面の見本(design/samples/)と読む画面(質問票・文書のプレビュー)が、外へ出ずに読む書体。
// fontsource の同梱の書体を design/dist/fonts/<書体>/ へ写し、dist/fonts.css に @font-face をまとめる。
// 出どころは node_modules。書体の許諾(SIL OFL)は README・LICENSE をそのまま同梱するのではなく、
// パッケージの中身(可変フォントの分割ファイルそのもの)だけを写す

// 写す書体。fontsource-variable の wght.css は文字の範囲ごとに分けた @font-face の並び
// (使う字の範囲だけを読む。87 の「気をつける点」)
const FONT_PACKAGES = [
  { pkg: "@fontsource-variable/noto-sans-jp", dir: "noto-sans-jp" },
  { pkg: "@fontsource-variable/noto-sans-mono", dir: "noto-sans-mono" },
] as const;

// このファイルからの相対で node_modules を探す(design/ の置き場所に依らない。テストは design/ を写して使う)
const packageDir = (pkg: string): string =>
  fileURLToPath(new URL(`../../node_modules/${pkg}/`, import.meta.url));

// dist/fonts/<dir>/*.woff2 を写し、dist/fonts.css からの相対 url() に書き換えた wght.css を返す
const buildFontPackage = async (
  designDir: string,
  { pkg, dir }: (typeof FONT_PACKAGES)[number],
): Promise<string> => {
  const source = packageDir(pkg);
  const css = await readFile(join(source, "wght.css"), "utf8");
  const filesDir = join(source, "files");
  const files = (await readdir(filesDir)).filter((name) =>
    name.endsWith(".woff2"),
  );
  const targetDir = join(designDir, "dist", "fonts", dir);
  await mkdir(targetDir, { recursive: true });
  await Promise.all(
    files.map((name) => copyFile(join(filesDir, name), join(targetDir, name))),
  );
  return css.replaceAll("url(./files/", `url(./fonts/${dir}/`);
};

// design/dist/fonts.css と design/dist/fonts/**。samples/ と読む画面はここを self で読む
export const buildFontAssets = async (designDir: string): Promise<string[]> => {
  const parts = await Promise.all(
    FONT_PACKAGES.map((entry) => buildFontPackage(designDir, entry)),
  );
  const target = join(designDir, "dist", "fonts.css");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${parts.join("\n")}\n`, "utf8");
  return [
    "dist/fonts.css",
    ...FONT_PACKAGES.flatMap(({ dir }) => [`dist/fonts/${dir}/`]),
  ];
};
