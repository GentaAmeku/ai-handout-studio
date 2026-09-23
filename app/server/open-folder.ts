import { dirname } from "node:path";

// 書き出したファイルの入ったフォルダを開くコマンド。画面の「フォルダを開くコマンドをコピー」が
// 端末に貼る。ファイルはサーバーの PC にあるので、サーバーの OS(process.platform)で決める。
// Mac と Windows はフォルダを開いてファイルを選んだ状態にし、それ以外はフォルダを開く

// sh の1つの引数にする。' は '\'' に置き換える
const shQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

export const openFolderCommand = (
  file: string,
  platform: NodeJS.Platform,
): string => {
  if (platform === "darwin") return `open -R ${shQuote(file)}`;
  // Windows のパスに " は入らない。cmd でも PowerShell でも同じ形で動く
  if (platform === "win32") return `explorer /select,"${file}"`;
  return `xdg-open ${shQuote(dirname(file))}`;
};
