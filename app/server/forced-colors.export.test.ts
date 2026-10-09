// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SHEET_LAYOUTS } from "./sheet-sample";

// 強制カラーモード(Windows のハイコントラストなど)では、地や文字の色が OS の色に置き換わる。
// 質問票の選択欄を、選んだときと選んでいないときで撮り比べ、見分けがつくかを測る。
// 地の色だけで選択の印を描くと、この表示では印が消えて同じ絵になる。pnpm test:export で流す
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designDir = join(repoRoot, "design");

const context: { server?: ViteDevServer; browser?: Browser; origin: string } = {
  origin: "",
};

const CHOICE_TYPES = ["radio", "checkbox"] as const;

const sheetTemplateNames = async (): Promise<string[]> => {
  const index = JSON.parse(
    await readFile(join(designDir, "dist", "sheet", "templates.json"), "utf8"),
  ) as { templates: Record<string, unknown> };
  return Object.keys(index.templates);
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

describe("強制カラーモードの質問票", () => {
  it("どのテンプレートも、選んだ選択欄と選んでいない選択欄の見分けがつく", async () => {
    const browser = context.browser;
    if (!browser) throw new Error("ブラウザが起動していない");
    const browserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      forcedColors: "active",
    });
    const page = await browserContext.newPage();
    const issues: string[] = [];
    const compared: string[] = [];
    for (const name of await sheetTemplateNames()) {
      for (const layout of SHEET_LAYOUTS) {
        const response = await page.goto(
          `${context.origin}/api/design/files/samples/sheet.${layout}.html?template=${name}`,
        );
        expect(response?.ok()).toBe(true);
        for (const type of CHOICE_TYPES) {
          const input = page
            .locator(`.ds-choice input[type="${type}"]`)
            .first();
          if ((await input.count()) === 0) continue;
          await input.evaluate((element: HTMLInputElement) => {
            element.checked = false;
          });
          const off = await input.screenshot();
          await input.evaluate((element: HTMLInputElement) => {
            element.checked = true;
          });
          const on = await input.screenshot();
          compared.push(`${name} ${layout} ${type}`);
          if (off.equals(on)) {
            issues.push(
              `${name} sheet.${layout}: ${type} の選択が見分けられない`,
            );
          }
        }
      }
    }
    await browserContext.close();
    // 見本に選択欄が無くなって何も比べずに通るのを防ぐ
    expect(compared.some((entry) => entry.endsWith("radio"))).toBe(true);
    expect(compared.some((entry) => entry.endsWith("checkbox"))).toBe(true);
    expect(issues).toEqual([]);
  });
});
