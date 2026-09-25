// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DocumentFile } from "../src/schema/document.ts";
import { renderDocumentHtml } from "./handout-html.ts";

// 章ごとに読む HTML 資料(paging: "chapter")を実ブラウザで確かめる。画面では章を1つずつ見せ、
// 前へ・次へと「すべての章を表示」で動き、印刷(PDF)では全章を流す。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ORIGIN = "http://paging.test";
const AT = "2026-09-25T00:00:00.000Z";

const text = (id: string, body: string) => ({
  id,
  type: "text" as const,
  props: { text: body },
});

const doc: DocumentFile = {
  id: "doc_paging",
  title: "手順",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "手順", lede: "始めから終わりまで" },
  toc: "auto",
  paging: "chapter",
  sections: [
    { id: "s1", heading: "準備", level: 2, blocks: [text("b1", "入れる")] },
    { id: "s1-a", heading: "入れる", level: 3, blocks: [text("b2", "a")] },
    { id: "s2", heading: "動かす", level: 2, blocks: [text("b3", "動かす")] },
    { id: "s2-a", heading: "起こす", level: 3, blocks: [text("b4", "b")] },
    { id: "s3", heading: "片付ける", level: 2, blocks: [text("b5", "片付け")] },
  ],
};

const context: { browser?: Browser } = {};

beforeAll(async () => {
  context.browser = await chromium.launch();
});

afterAll(async () => {
  await context.browser?.close();
});

const shownChapters = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".ds-main > section"))
      .filter((section) => section.getClientRects().length > 0)
      .map((section) => section.id),
  );

describe("章ごとに読む HTML 資料", () => {
  it("画面では章を1つずつ見せ、印刷では全章を流す", async () => {
    const browser = context.browser;
    if (!browser) throw new Error("ブラウザが起動していない");
    const html = await renderDocumentHtml({
      designDir: join(repoRoot, "design"),
      template: "documentation",
      title: doc.title,
      doc,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
    );
    await page.goto(`${ORIGIN}/doc.html`);

    // 1章目: 題名とリードが出て、目次は今の章だけ節を開く
    expect(await shownChapters(page)).toEqual(["s1"]);
    expect(await page.locator(".ds-head").isVisible()).toBe(true);
    expect(await page.locator('.ds-toc a[href="#s1-a"]').isVisible()).toBe(
      true,
    );
    expect(await page.locator('.ds-toc a[href="#s2-a"]').isVisible()).toBe(
      false,
    );

    const size = (selector: string) =>
      page
        .locator(selector)
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    // 1章目の章の見出しは、ふつうの h2 の大きさ
    const firstChapterSize = await size("#s1 > h2");

    // 次へで2章目。題名は隠れ、章の見出しが大きくなる
    await page.locator(".ds-pager-next").click();
    await expect.poll(() => shownChapters(page)).toEqual(["s2"]);
    expect(page.url()).toBe(`${ORIGIN}/doc.html#s2`);
    expect(await page.locator(".ds-head").isVisible()).toBe(false);
    expect(await size("#s2 > h2")).toBeGreaterThan(firstChapterSize);
    expect(await page.locator('.ds-toc a[href="#s2-a"]').isVisible()).toBe(
      true,
    );

    // 戻るで1章目
    await page.goBack();
    await expect.poll(() => shownChapters(page)).toEqual(["s1"]);

    // 印刷では全章を流し、前へ・次へと切り替えは出さない
    await page.emulateMedia({ media: "print" });
    expect(await shownChapters(page)).toEqual(["s1", "s2", "s3"]);
    expect(await page.locator(".ds-pager").isVisible()).toBe(false);
    expect(await page.locator(".ds-paging-toggle").isVisible()).toBe(false);
    await page.emulateMedia({ media: "screen" });

    // すべての章を表示
    await page.locator(".ds-paging-toggle").click();
    expect(await shownChapters(page)).toEqual(["s1", "s2", "s3"]);
    expect(await page.locator(".ds-pager").isVisible()).toBe(false);
    await page.close();
  });
});
