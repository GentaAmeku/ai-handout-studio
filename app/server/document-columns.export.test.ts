// @vitest-environment node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DocumentFile } from "../src/schema/document.ts";
import { renderDocumentHtml } from "./handout-html.ts";

// HTML 資料の表の列の幅を、読む人が実ブラウザで変えられるかを確かめる。
// 境目の取っ手をドラッグすると隣り合う2列の間で幅が移り、表全体の幅は変わらない。
// 左右キーでも動き、ダブルクリックで元に戻る。印刷では取っ手を出さない。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ORIGIN = "http://columns.test";
const AT = "2026-09-25T00:00:00.000Z";

const doc: DocumentFile = {
  id: "doc_columns",
  title: "比較",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "比較" },
  toc: "none",
  sections: [
    {
      id: "s1",
      heading: "案",
      blocks: [
        {
          id: "b1",
          type: "table",
          props: {
            headers: ["案", "費用", "期間"],
            rows: [
              ["A", "100", "3 か月"],
              ["B", "80", "5 か月"],
            ],
            rowLabel: true,
          },
        },
      ],
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

const open = async (): Promise<Page> => {
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
  return page;
};

// 見出しのセルの幅(px)と、表全体の幅
const widths = (page: Page): Promise<{ cells: number[]; table: number }> =>
  page.evaluate(() => {
    const table = document.querySelector("table.ds-table");
    if (!table) throw new Error("表が無い");
    return {
      cells: Array.from(table.querySelectorAll("thead th")).map(
        (cell) => cell.getBoundingClientRect().width,
      ),
      table: table.getBoundingClientRect().width,
    };
  });

describe("HTML 資料の表の列の幅", () => {
  it("境目をドラッグすると隣の列と幅をやり取りし、表全体の幅は変わらない", async () => {
    const page = await open();
    const before = await widths(page);
    const handle = page.locator(".ds-col-resize").first();
    const box = await handle.boundingBox();
    if (!box) throw new Error("取っ手が見えない");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 4 });
    await page.mouse.up();

    const after = await widths(page);
    const [first = 0, second = 0, third = 0] = after.cells;
    const [first0 = 0, second0 = 0, third0 = 0] = before.cells;
    expect(first - first0).toBeCloseTo(60, 0);
    expect(second - second0).toBeCloseTo(-60, 0);
    expect(third).toBeCloseTo(third0, 0);
    expect(after.table).toBeCloseTo(before.table, 0);
    await page.close();
  });

  it("細くしても最小の幅で止まる", async () => {
    const page = await open();
    const handle = page.locator(".ds-col-resize").first();
    const box = await handle.boundingBox();
    if (!box) throw new Error("取っ手が見えない");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(0, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    const [first = 0] = (await widths(page)).cells;
    expect(first).toBeGreaterThanOrEqual(47);
    expect(first).toBeLessThan(60);
    await page.close();
  });

  it("左右キーで動き、ダブルクリックで元の幅に戻る", async () => {
    const page = await open();
    const before = await widths(page);
    const handle = page.locator(".ds-col-resize").nth(1);
    await handle.focus();
    const start = Number(await handle.getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const moved = await widths(page);
    expect(moved.cells[1] ?? 0).toBeGreaterThan(before.cells[1] ?? 0);
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBe(start + 4);

    await handle.dblclick();
    const reset = await widths(page);
    reset.cells.forEach((width, index) => {
      expect(width).toBeCloseTo(before.cells[index] ?? 0, 0);
    });
    expect(
      await page.locator("table.ds-table").getAttribute("data-col-resized"),
    ).toBe(null);
    await page.close();
  });

  it("印刷では取っ手を出さない", async () => {
    const page = await open();
    expect(await page.locator(".ds-col-resize").first().isVisible()).toBe(true);
    await page.emulateMedia({ media: "print" });
    expect(await page.locator(".ds-col-resize").first().isVisible()).toBe(
      false,
    );
    await page.close();
  });
});
