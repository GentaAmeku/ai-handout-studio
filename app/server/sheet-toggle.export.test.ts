// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 質問票のテンプレートの編集画面で、見本の「質問一覧を閉じる/開く」が実ブラウザで効くこと。
// 見本の iframe はスクリプトを許さない(sandbox="allow-same-origin"・CSP に script-src なし)まま、
// 同じオリジンの親の画面が中のボタンに開閉をつなぐ。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const context: { server?: ViteDevServer; browser?: Browser; origin: string } = {
  origin: "",
};

beforeAll(async () => {
  const server = await createServer({
    configFile: join(repoRoot, "vite.config.ts"),
    server: { port: 0 },
    logLevel: "error",
  });
  await server.listen();
  context.server = server;
  context.origin = (server.resolvedUrls?.local[0] ?? "").replace(/\/+$/, "");
  context.browser = await chromium.launch();
});

afterAll(async () => {
  await context.browser?.close();
  await context.server?.close();
});

describe("質問票のテンプレートの編集画面の見本", () => {
  it("1問ずつは一覧を開いて始まり、見本のボタンで一覧が開閉する", async () => {
    const browser = context.browser;
    if (!browser) throw new Error("ブラウザが起動していない");
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const sample = page.waitForResponse((response) =>
      response.url().includes("/api/design/files/samples/sheet.focus.html"),
    );
    await page.goto(`${context.origin}/sheets/templates/default`);
    const response = await sample;
    // 見本の決まりは変えていない。スクリプトは許さない
    expect(response.headers()["content-security-policy"]).not.toContain(
      "script-src",
    );
    const frame = page.locator('iframe[title="質問票"]');
    expect(await frame.getAttribute("sandbox")).toBe("allow-same-origin");
    const inner = page.frameLocator('iframe[title="質問票"]');
    const toggle = inner.locator(".ds-sidebar-toggle");
    const sidebar = inner.locator("#question-sidebar");
    await expect.poll(() => toggle.textContent()).toBe("質問一覧を閉じる");
    expect(await sidebar.isVisible()).toBe(true);
    await toggle.click();
    await expect.poll(() => sidebar.isVisible()).toBe(false);
    expect(await toggle.textContent()).toBe("質問一覧を開く");
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    await toggle.click();
    await expect.poll(() => sidebar.isVisible()).toBe(true);
    expect(await toggle.textContent()).toBe("質問一覧を閉じる");
    // 一覧の位置を右にすると、開いた一覧が本文の右へ移る(見本は読み込み直さない)
    const before = await sidebar.boundingBox();
    await page.locator("label.skeleton-segment", { hasText: "右" }).click();
    expect(await page.getByLabel("右", { exact: true }).isChecked()).toBe(true);
    await expect
      .poll(async () => (await sidebar.boundingBox())?.x ?? 0)
      .toBeGreaterThan(before?.x ?? 0);
    expect(await sidebar.isVisible()).toBe(true);
    await page.close();
  });
});
