import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { IMAGE_WARN_BYTES } from "./handout-assets.ts";

// 資料に載せるスクリーンショット。Web の画面か、手元の HTML(見た目の案のモック)を PNG に撮る。
// 撮った PNG は、HTML 資料の image や質問票の images に手元のパスで書けば、保存のときに取り込まれる

export type ShotOptions = {
  readonly target: string;
  readonly out: string;
  readonly width: number;
  readonly height: number;
  // ページ全体(縦に長いまま)を撮る
  readonly full: boolean;
  // 読み込んだあとに待つ時間(ミリ秒)。動きや書体の読み込みが落ち着くまで
  readonly wait: number;
};

// http(s) の URL はそのまま、それ以外は手元のファイルとして file: の URL にする
export const shotUrl = (target: string, cwd: string): string =>
  /^https?:\/\//i.test(target)
    ? target
    : pathToFileURL(resolve(cwd, target)).href;

export const isShotTarget = (target: string): boolean =>
  /^https?:\/\//i.test(target) || !/^[a-z][a-z0-9+.-]*:/i.test(target);

export type ShotResult = {
  readonly path: string;
  readonly bytes: number;
  readonly warnings: readonly string[];
};

export const takeShot = async (
  options: ShotOptions,
  cwd: string,
): Promise<ShotResult> => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    await page.goto(shotUrl(options.target, cwd), { waitUntil: "load" });
    await page.waitForTimeout(options.wait);
    const path = resolve(cwd, options.out);
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({ path, fullPage: options.full, type: "png" });
    const bytes = (await stat(path)).size;
    return {
      path,
      bytes,
      warnings:
        bytes > IMAGE_WARN_BYTES
          ? [
              "1MB を超えた。資料に載せると重くなるので、--width と --height を小さくするか、--full を外す",
            ]
          : [],
    };
  } finally {
    await browser.close();
  }
};
