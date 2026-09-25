// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SheetDocument } from "../src/schema/sheet.ts";
import { renderSheetHtml } from "./handout-html.ts";

// 案の画像の拡大(156)を実ブラウザで確かめる。閉じたダイアログがページに出ないこと
// (display を常に決めると、ブラウザーの「閉じたダイアログは隠す」に勝ってしまう)と、
// 開いたら画像が読めて、閉じたら消えること。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// 2x2 の PNG
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==";

const doc: SheetDocument = {
  schemaVersion: 1,
  id: "zoom",
  revision: "1",
  title: "見た目を決める",
  questions: [
    {
      id: "look",
      title: "見た目はどちらにしますか",
      type: "single",
      options: [
        { id: "a", label: "案A" },
        { id: "b", label: "案B" },
      ],
      visual: {
        type: "images",
        items: [
          { src: PNG, label: "案A", alt: "案Aの画面" },
          { src: PNG, label: "案B", alt: "案Bの画面" },
        ],
      },
    },
  ],
};

const context: { browser?: Browser } = {};

beforeAll(async () => {
  context.browser = await chromium.launch();
});

afterAll(async () => {
  await context.browser?.close();
});

describe("質問票の案の画像の拡大", () => {
  it("閉じている間はページに出ず、開くと画像が読め、閉じると消える", async () => {
    const browser = context.browser;
    if (!browser) throw new Error("ブラウザが起動していない");
    const html = await renderSheetHtml({
      designDir: join(repoRoot, "design"),
      template: "cobalt",
      doc,
      layout: "all",
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.setContent(html);
    const dialog = page.locator(".ds-image-zoom-dialog");
    const zoomed = page.locator(".ds-image-zoom-img");
    expect(await dialog.count()).toBe(1);
    expect(await dialog.isVisible()).toBe(false);

    await page.locator(".ds-images-item img").first().click();
    await expect.poll(() => dialog.isVisible()).toBe(true);
    expect(
      await dialog.evaluate((node) => getComputedStyle(node).display),
    ).toBe("flex");
    await expect
      .poll(() =>
        zoomed.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(2);

    await page.keyboard.press("Escape");
    await expect.poll(() => dialog.isVisible()).toBe(false);
    // src を外すのは close イベント(ダイアログが閉じたあとに届く)
    await expect.poll(() => zoomed.getAttribute("src")).toBe(null);

    // 閉じたらフォーカスは元の画像に戻り、輪は画像ではなくカードの枠に出る
    const image = page.locator(".ds-images-item img").first();
    const frame = page.locator(".ds-images-item .ds-figure-frame").first();
    await expect
      .poll(() => image.evaluate((node) => node === document.activeElement))
      .toBe(true);
    expect(
      await image.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).toBe("none");
    expect(
      await frame.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).toBe("solid");
    await page.close();
  });
});
