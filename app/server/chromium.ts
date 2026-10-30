import type { Browser } from "playwright";

export const CHROMIUM_MISSING =
  "Chromium が入っていない(書き出しと撮影に使う)。clone したフォルダで「pnpm exec playwright install chromium」を実行してから、もう一度試す";

// Playwright の文は `npx playwright install` を勧め、罫線の箱で囲んである。
// 画面にもターミナルにもそのまま出すと読みにくいので、この repo での入れ方に言い換える
const isMissingExecutable = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("Executable doesn't exist");

export const launchChromium = async (): Promise<Browser> => {
  const { chromium } = await import("playwright");
  return chromium.launch().catch((error: unknown) => {
    throw isMissingExecutable(error)
      ? new Error(CHROMIUM_MISSING, { cause: error })
      : error;
  });
};
