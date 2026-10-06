// README の画像を撮る。手順は docs/screenshots.md
//   node scripts/readme-shots.mjs --lang en --deck <deckId> --sheet <sheetId> --document <docId> [--only hero,list,...]
// 動いているサーバー(127.0.0.1:5190)が、撮影用の作業場を開いていること
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(repoRoot, "package.json"))(
  "playwright",
);

const ORIGIN = "http://127.0.0.1:5190";
const TEMPLATES = [
  "chalk",
  "cobalt",
  "crayon",
  "linen",
  "lumen",
  "podium",
  "prism",
];
const STEPS = [
  "hero",
  "list",
  "editor",
  "document",
  "switch",
  "sheet",
  "phone",
];

// 画面の文言(言語ごと)。UI の locale と合わせる
const LABELS = {
  en: {
    properties: "Properties",
    next: "Next question",
    close: "Close",
    closeList: "Close question list",
    edit: ", safely",
    body: "Body",
    summary: " Keep it hands-on.",
  },
  ja: {
    properties: "プロパティ",
    next: "次の質問へ",
    close: "閉じる",
    closeList: "質問一覧を閉じる",
    edit: "、安全に",
    body: "本文",
    summary: "手を動かす時間を主にする。",
  },
};

const parseArgs = (argv) =>
  Object.fromEntries(
    argv
      .map((arg, index) =>
        arg.startsWith("--")
          ? [arg.slice(2), argv[index + 1] ?? ""]
          : undefined,
      )
      .filter((entry) => entry !== undefined),
  );

const args = parseArgs(process.argv.slice(2));
const lang = args.lang === "ja" ? "ja" : "en";
const labels = LABELS[lang];
const outDir = resolve(args.out ?? join(repoRoot, "docs/images", lang));
const only = args.only ? args.only.split(",") : STEPS;
const switchTo = args.to ?? "prism";

const sampleDir = join(repoRoot, "design/samples", lang === "en" ? "en" : "");

const settle = (page, ms = 800) => page.waitForTimeout(ms);

const shot = async (page, name, options = {}) => {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, name);
  await page.screenshot({ path, type: "png", ...options });
  console.log(`wrote ${path}`);
};

// 同じ表紙を 7 テンプレートで描いた帯。見本 HTML の最初のスライドを 1280x720 で撮り、2 段に並べる
const heroHtml = (files, { cover, gap, pad }) => {
  const img = (file) =>
    `<img src="${pathToFileURL(file).href}" width="${cover}" height="${(cover / 16) * 9}" />`;
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eef0f4;font-family:system-ui}
main{display:grid;gap:${gap}px;padding:${pad}px;width:max-content}
.row{display:flex;gap:${gap}px;justify-content:center}
img{display:block;border-radius:12px;box-shadow:0 8px 28px rgba(20,24,40,.18)}
</style><main><div class="row">${files.slice(0, 4).map(img).join("")}</div><div class="row">${files.slice(4).map(img).join("")}</div></main>`;
};

// 1280x640 のソーシャルプレビュー。帯の下敷きと同じ表紙を小さく並べ、上に名前を置く
const socialHtml = (files) => {
  const img = (file) =>
    `<img src="${pathToFileURL(file).href}" width="276" height="155" />`;
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:640px;background:#eef0f4;font-family:system-ui;color:#1f2430;overflow:hidden}
header{padding:52px 64px 28px}
h1{margin:0;font-size:56px;letter-spacing:-.02em}
p{margin:10px 0 0;font-size:24px;color:#5b6170}
.row{display:flex;gap:16px;padding:0 64px;margin-bottom:16px}
.row:last-child{padding-left:210px}
img{display:block;border-radius:10px;box-shadow:0 6px 20px rgba(20,24,40,.18)}
</style><header><h1>AI Handout Studio</h1><p>Slides, documents and question sheets from your AI agent, finished on screen</p></header>
<div class="row">${files.slice(0, 4).map(img).join("")}</div><div class="row">${files.slice(4).map(img).join("")}</div>`;
};

const shootHero = async (browser) => {
  const tmp = await mkdtemp(join(tmpdir(), "readme-hero-"));
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  const files = [];
  for (const name of TEMPLATES) {
    await page.goto(pathToFileURL(join(sampleDir, `slide.${name}.html`)).href, {
      waitUntil: "networkidle",
    });
    await settle(page, 600);
    const file = join(tmp, `${name}.png`);
    await page.locator(".ds-slide").first().screenshot({ path: file });
    files.push(file);
  }
  const layout = { cover: 640, gap: 24, pad: 32 };
  const heroPath = join(tmp, "hero.html");
  await writeFile(heroPath, heroHtml(files, layout));
  await page.setViewportSize({
    width: layout.pad * 2 + layout.cover * 4 + layout.gap * 3,
    height: layout.pad * 2 + (layout.cover / 16) * 9 * 2 + layout.gap,
  });
  await page.goto(pathToFileURL(heroPath).href, { waitUntil: "networkidle" });
  await settle(page, 300);
  await shot(page, "hero-templates.png");
  if (lang === "en") {
    const socialPath = join(tmp, "social.html");
    await writeFile(socialPath, socialHtml(files));
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto(pathToFileURL(socialPath).href, {
      waitUntil: "networkidle",
    });
    await settle(page, 300);
    await page.screenshot({
      path: join(outDir, "..", "social-preview.png"),
      type: "png",
    });
    console.log(`wrote ${join(outDir, "..", "social-preview.png")}`);
  }
  await page.close();
};

const desktopPage = (browser) =>
  browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

const shootList = async (browser) => {
  const page = await desktopPage(browser);
  await page.goto(`${ORIGIN}/slides`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "list.png");
  await page.close();
};

// キャンバスの最初の見出しブロック(幅 300px より広く、上の帯より下)をクリックして選ぶ
const selectHeading = async (page) => {
  const blocks = page.locator("[data-block-id]");
  const count = await blocks.count();
  const boxes = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      blocks.nth(index).boundingBox(),
    ),
  );
  const target = boxes.find((box) => box && box.width > 300 && box.y > 60);
  if (!target) throw new Error("見出しブロックが見つからない");
  await page.mouse.click(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  await settle(page, 400);
};

const shootEditor = async (browser) => {
  const page = await desktopPage(browser);
  await page.goto(`${ORIGIN}/decks/${args.deck}`, { waitUntil: "networkidle" });
  await settle(page, 1200);
  await selectHeading(page);
  await page.getByRole("tab", { name: labels.properties }).click();
  await settle(page, 400);
  const heading = page.locator("textarea").first();
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(labels.edit, { delay: 40 });
  await settle(page, 400);
  await shot(page, "editor.png");
  await page.close();
};

// HTML 資料の編集画面(3 列)。表紙まわりを選び、要約の本文の末尾に文を足している最中
const shootDocument = async (browser) => {
  if (!args.document) throw new Error("--document を指定する");
  const page = await desktopPage(browser);
  await page.goto(`${ORIGIN}/documents/${args.document}`, {
    waitUntil: "networkidle",
  });
  await settle(page, 1200);
  await page.locator(".outline__front").click();
  await settle(page, 400);
  const body = page.getByLabel(labels.body, { exact: true }).last();
  await body.click();
  await body.evaluate((el) => {
    el.setSelectionRange(el.value.length, el.value.length);
  });
  await page.keyboard.type(labels.summary, { delay: 40 });
  await settle(page, 400);
  await shot(page, "document.png");
  await page.close();
};

const shootSwitch = async (browser) => {
  const page = await desktopPage(browser);
  await page.goto(`${ORIGIN}/decks/${args.deck}`, { waitUntil: "networkidle" });
  await settle(page, 1200);
  await shot(page, "template-switch-01.png");
  await page.locator("header button:has(.lucide-palette)").click();
  await settle(page, 1200);
  await shot(page, "template-switch-02.png");
  await page
    .locator("label.template-option", { hasText: new RegExp(switchTo, "i") })
    .click();
  await settle(page, 1200);
  await shot(page, "template-switch-03.png");
  await page.locator(".dialog__actions .button--primary").click();
  await settle(page, 800);
  // 切り替え直後に走るはみ出し検査の帯は閉じて、キャンバスを見せる
  await page
    .locator(".overflow-panel button[aria-label]")
    .click({ timeout: 2000 })
    .catch(() => undefined);
  await settle(page, 400);
  await shot(page, "template-switch-04.png");
  await page.close();
};

// 指定の要素が画面の上から offset px のところに来るまで送る
const scrollTo = (page, selector, offset) =>
  page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
      window.scrollTo(0, Math.max(0, top - off));
    },
    [selector, offset],
  );

const shootSheet = async (browser) => {
  const page = await desktopPage(browser);
  await page.goto(`${ORIGIN}/api/sheets/${args.sheet}/preview`, {
    waitUntil: "networkidle",
  });
  await settle(page);
  // 1 問目: 3 案の画像を見比べて、2 つ目(推奨)を選んだ状態
  await page.locator("input[type=radio]").nth(1).check({ force: true });
  await settle(page, 300);
  await scrollTo(page, "figure img, img", 330);
  await settle(page, 300);
  await shot(page, "sheet.png");
  // 最後の質問まで進めて答え、「回答をコピー」が見える状態
  await page.getByRole("button", { name: labels.next }).click();
  await settle(page, 500);
  await page
    .locator("input[type=radio]:visible")
    .first()
    .check({ force: true });
  await settle(page, 300);
  await scrollTo(page, "h2", 120);
  await settle(page, 300);
  await shot(page, "sheet-answers.png");
  await page.close();
};

const shootPhone = async (browser) => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${ORIGIN}/api/sheets/${args.sheet}/preview`, {
    waitUntil: "networkidle",
  });
  await settle(page);
  // 質問の一覧を畳み、1 問目の見出しから見せる
  await page.locator("button").filter({ hasText: labels.closeList }).click();
  await settle(page, 400);
  await scrollTo(page, "figure img, img", 24);
  await settle(page, 300);
  await shot(page, "phone.png");
  await page.close();
};

const STEP_RUNNERS = {
  hero: shootHero,
  list: shootList,
  editor: shootEditor,
  document: shootDocument,
  switch: shootSwitch,
  sheet: shootSheet,
  phone: shootPhone,
};

const main = async () => {
  const browser = await chromium.launch();
  try {
    for (const step of only) {
      const run = STEP_RUNNERS[step];
      if (!run) throw new Error(`知らない手順: ${step}`);
      await run(browser);
    }
  } finally {
    await browser.close();
  }
};

await main();
