// デモ動画の場面 3〜7 を Playwright で録る。手順は video/README.md
//   node scripts/demo-record.mjs --deck <deckId> --sheet <sheetId> [--only sheet,list,editor,switch,export] [--out video/public/clips]
// 動いているサーバー(127.0.0.1:5190)が、撮影用の作業場(docs/screenshots.md の 1)を開いていること。
// 場面ごとに 1280x720・1x の mp4 と、合成に使う JSON(長さ・押した要素の位置・操作の時刻)を書く。
// Playwright はカーソルを描かないので、ページに丸いカーソルを注入して、録画に写るようにする
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(repoRoot, "package.json"))(
  "playwright",
);

const ORIGIN = "http://127.0.0.1:5190";
const SIZE = { width: 1280, height: 720 };
const STEPS = ["sheet", "list", "editor", "switch", "export"];
const LABELS = {
  next: "Next question",
  copy: "Copy answers",
  copied: "Copied",
  edit: ", safely",
};
// はみ出し検査の帯と、書き出しの知らせの中のはみ出しの行。文言が日本語固定なので英語の録画には写さない
const HIDE_OVERFLOW = `
.overflow-panel, .export-notice__warnings { display: none !important; }
.canvas__hit[data-overflow="true"] { outline: none !important; box-shadow: none !important; }`;

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
const outDir = resolve(args.out ?? join(repoRoot, "video/public/clips"));
const only = args.only ? args.only.split(",") : STEPS;
if (!args.deck || !args.sheet) {
  console.error("--deck と --sheet を指定する(docs/screenshots.md の 2)");
  process.exit(1);
}

// ページに注入するカーソル。pointermove に追いつき、押したときに輪が広がる。
// CSP(style-src)のあるページでも効くよう、style 属性ではなく CSSOM で書く
const CURSOR_SCRIPT = `(() => {
  const make = () => {
    if (document.getElementById("demo-cursor")) return;
    const dot = document.createElement("div");
    dot.id = "demo-cursor";
    const ring = document.createElement("div");
    ring.id = "demo-cursor-ring";
    const base = (el, size, color) => {
      const s = el.style;
      s.position = "fixed"; s.left = "0px"; s.top = "0px"; s.zIndex = "2147483647";
      s.width = size + "px"; s.height = size + "px"; s.marginLeft = -size / 2 + "px"; s.marginTop = -size / 2 + "px";
      s.borderRadius = "50%"; s.pointerEvents = "none"; s.background = color; s.transform = "translate(-100px,-100px)";
    };
    base(dot, 22, "rgba(37, 99, 235, 0.55)");
    dot.style.boxShadow = "0 0 0 2px #ffffff, 0 2px 8px rgba(15, 23, 42, 0.35)";
    base(ring, 22, "transparent");
    ring.style.border = "3px solid rgba(37, 99, 235, 0.7)";
    ring.style.opacity = "0";
    document.documentElement.append(ring, dot);
    const move = (e) => {
      const t = "translate(" + e.clientX + "px," + e.clientY + "px)";
      dot.style.transform = t;
      ring.style.transform = t;
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", (e) => {
      move(e);
      ring.style.transition = "none";
      ring.style.opacity = "1";
      ring.style.width = "22px"; ring.style.height = "22px"; ring.style.marginLeft = "-11px"; ring.style.marginTop = "-11px";
      requestAnimationFrame(() => {
        ring.style.transition = "all 420ms ease-out";
        ring.style.opacity = "0";
        ring.style.width = "64px"; ring.style.height = "64px"; ring.style.marginLeft = "-32px"; ring.style.marginTop = "-32px";
      });
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
})();`;

// 1 場面 = 1 コンテキスト = 1 動画。操作の記録(JSON)も一緒に返す
const record = async (browser, name, run) => {
  const dir = await mkdtemp(join(tmpdir(), `demo-${name}-`));
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: SIZE },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const t0 = Date.now();
  const log = { start: 0, end: 0, targets: {}, events: [] };
  const now = () => Date.now() - t0;
  const api = {
    page,
    // 見せ始める時刻(ページの読み込みを切る)
    begin: () => {
      log.start = now();
    },
    // 合成で矢印を向ける要素の位置(画面内に送ってから測る。枠そのものを渡してもよい)
    target: async (key, locator) => {
      const box =
        typeof locator.boundingBox === "function"
          ? await locator
              .scrollIntoViewIfNeeded()
              .then(() => locator.boundingBox())
          : locator;
      if (box) log.targets[key] = box;
      return box;
    },
    event: (kind, label) => {
      log.events.push({ t: now() - log.start, kind, label });
    },
    // 要素の中央へゆっくり動かして押す
    click: async (locator, label, options = {}) => {
      await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const box = await locator.boundingBox();
      if (!box) throw new Error(`${label} が見つからない`);
      log.targets[label] = box;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: options.steps ?? 24 });
      await page.waitForTimeout(options.pause ?? 350);
      api.event("click", label);
      await page.mouse.click(x, y, {
        clickCount: options.double ? 2 : 1,
        delay: 60,
      });
    },
    wait: (ms) => page.waitForTimeout(ms),
  };
  await run(api).catch(async (error) => {
    await page.screenshot({ path: join(tmpdir(), `demo-${name}-failed.png`) });
    throw error;
  });
  log.end = now();
  const video = page.video();
  await page.close();
  await context.close();
  const webm = await video.path();
  await mkdir(outDir, { recursive: true });
  const mp4 = join(outDir, `${name}.mp4`);
  const seconds = (log.end - log.start) / 1000;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    String(log.start / 1000),
    "-i",
    webm,
    "-t",
    String(seconds),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4,
  ]);
  const measured = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      mp4,
    ]).toString(),
  );
  await writeFile(
    join(outDir, `${name}.json`),
    `${JSON.stringify({ name, seconds: measured, size: SIZE, targets: log.targets, events: log.events }, null, 2)}\n`,
  );
  await rm(dir, { recursive: true, force: true });
  console.log(`wrote ${mp4} (${measured.toFixed(1)}s)`);
};

// 指定の要素が画面の上から offset px のところへ来るまで、なめらかに送る
const scrollTo = async (page, selector, offset) => {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
      window.scrollTo({ top: Math.max(0, top - off), behavior: "smooth" });
    },
    [selector, offset],
  );
  await page.waitForTimeout(700);
};

// 場面 3: 質問票。3 案を見比べ、推奨(B)を選び、最後の質問で回答をコピーする
const recordSheet = (browser) =>
  record(browser, "sheet", async ({ page, begin, target, click, wait }) => {
    await page.goto(`${ORIGIN}/api/sheets/${args.sheet}/preview`, {
      waitUntil: "networkidle",
    });
    await page.mouse.move(640, 500);
    await wait(600);
    begin();
    await wait(600);
    await scrollTo(page, "figure img, img", 140);
    await wait(900);
    const radios = page.locator("input[type=radio]:visible");
    await target("optionB", radios.nth(1));
    await click(radios.nth(1), "choose B");
    await wait(900);
    const next = page.getByRole("button", { name: LABELS.next }).first();
    await scrollTo(page, "h2", 120);
    await wait(300);
    await click(next, "next");
    await wait(900);
    const first = page.locator("input[type=radio]:visible").first();
    await click(first, "choose first");
    await wait(600);
    const copy = page
      .locator("button[data-copy]:visible", { hasText: LABELS.copy })
      .first();
    await target("copy", copy);
    await click(copy, "copy");
    await page
      .getByText(LABELS.copied)
      .first()
      .waitFor({ timeout: 3000 })
      .catch(() => undefined);
    await wait(1800);
  });

// 場面 4: 一覧。お気に入り → 全部 → タグの並びを上から下へ見せる
const recordList = (browser) =>
  record(browser, "list", async ({ page, begin, wait }) => {
    await page.goto(`${ORIGIN}/slides`, { waitUntil: "networkidle" });
    await page.mouse.move(900, 80);
    await wait(800);
    begin();
    await wait(800);
    await page.mouse.move(640, 420, { steps: 30 });
    const height = await page.evaluate(() => document.body.scrollHeight);
    const stops = [0.25, 0.5, 0.8].map((ratio) =>
      Math.round((height - SIZE.height) * ratio),
    );
    for (const top of stops) {
      await page.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "smooth" }),
        top,
      );
      await wait(1100);
    }
    await wait(600);
  });

// キャンバスの最初の見出しブロック(幅 300px より広く、上の帯より下)
const headingBox = async (page) => {
  const blocks = page.locator("[data-block-id]");
  const count = await blocks.count();
  const boxes = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      blocks.nth(index).boundingBox(),
    ),
  );
  const target = boxes.find((box) => box && box.width > 300 && box.y > 60);
  if (!target) throw new Error("見出しブロックが見つからない");
  return target;
};

// 場面 5: 編集。見出しをダブルクリックして直し、ブロックをドラッグする
// (はみ出し検査は、結果の文言が日本語固定なので英語の録画には入れない)
const recordEditor = (browser) =>
  record(browser, "editor", async ({ page, begin, target, event, wait }) => {
    await page.goto(`${ORIGIN}/decks/${args.deck}`, {
      waitUntil: "networkidle",
    });
    await page.mouse.move(640, 600);
    await wait(1500);
    begin();
    await wait(500);
    const heading = await headingBox(page);
    const hx = heading.x + heading.width / 2;
    const hy = heading.y + heading.height / 2;
    await target("heading", page.locator("[data-block-id]").first());
    await page.mouse.move(hx, hy, { steps: 28 });
    await wait(400);
    event("dblclick", "heading");
    await page.mouse.dblclick(hx, hy, { delay: 40 });
    await wait(500);
    await page.keyboard.press("End");
    await page.keyboard.type(LABELS.edit, { delay: 90 });
    await wait(700);
    // 枠の外(キャンバスの余白)を押して確定する
    const stage = await page.locator(".canvas").boundingBox();
    await page.mouse.move(stage.x + 12, stage.y + stage.height - 12, {
      steps: 18,
    });
    await page.mouse.click(stage.x + 12, stage.y + stage.height - 12);
    await wait(600);
    // 見出しの下にある 2 つ目のブロック(日付の行)を、少し下へ引く。1 つ目を引くと次の行に重なる
    const hits = page.locator(".canvas__hit");
    const count = await hits.count();
    const boxes = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        hits.nth(index).boundingBox(),
      ),
    );
    const below = boxes
      .filter((box) => box && box.y > heading.y + heading.height)
      .sort((a, b) => a.y - b.y);
    const moving = below[1] ?? below[0];
    if (moving) {
      const sx = moving.x + moving.width / 2;
      const sy = moving.y + moving.height / 2;
      await page.mouse.move(sx, sy, { steps: 24 });
      await wait(300);
      event("drag", "block");
      await target("block", moving);
      await page.mouse.down();
      await page.mouse.move(sx + 4, sy + 40, { steps: 30 });
      await wait(150);
      await page.mouse.up();
      await wait(1200);
    }
    // 枠の外を押して選択を外し、直した表紙を見せる
    await page.mouse.move(stage.x + 12, stage.y + stage.height - 12, {
      steps: 18,
    });
    await page.mouse.click(stage.x + 12, stage.y + stage.height - 12);
    await wait(1500);
  });

// 場面 6: テンプレートの切り替え。窓を開き、Lumen → Podium → Prism と替える
const recordSwitch = (browser) =>
  record(browser, "switch", async ({ page, begin, target, click, wait }) => {
    await page.goto(`${ORIGIN}/decks/${args.deck}`, {
      waitUntil: "networkidle",
    });
    await page.mouse.move(640, 600);
    await wait(1500);
    begin();
    await wait(500);
    const palette = page.locator("header button:has(.lucide-palette)");
    await target("palette", palette);
    await click(palette, "open");
    await wait(1200);
    for (const name of ["lumen", "podium", "prism"]) {
      const option = page.locator("label.template-option", {
        hasText: new RegExp(name, "i"),
      });
      await target(name, option);
      await click(option, name, { steps: 18, pause: 250 });
      await wait(1300);
    }
    // 閉じた直後に走るはみ出し検査の帯(文言が日本語固定)は録画に写さない
    await page.addStyleTag({ content: HIDE_OVERFLOW });
    await click(page.locator(".dialog__actions .button--primary"), "close");
    await wait(1800);
  });

// 場面 7: 書き出し。PDF を押し、書き出した知らせが出るまで
const recordExport = (browser) =>
  record(browser, "export", async ({ page, begin, target, click, wait }) => {
    await page.goto(`${ORIGIN}/decks/${args.deck}`, {
      waitUntil: "networkidle",
    });
    await page.mouse.move(640, 600);
    await wait(1500);
    // 書き出し前のはみ出しの確認は進める。知らせの中のはみ出しの行(日本語固定)は写さない
    page.on("dialog", (dialog) => dialog.accept());
    await page.addStyleTag({ content: HIDE_OVERFLOW });
    begin();
    await wait(400);
    const actions = page.locator(".viewer__actions");
    await target("actions", actions);
    const pdf = actions.getByRole("button", { name: "PDF" });
    await target("pdf", pdf);
    await click(pdf, "pdf");
    await page
      .locator(".export-notice .export-notice__title", { hasText: "Exported" })
      .waitFor({ timeout: 60000 });
    // 書き出し先はホームからの相対で見せる(撮る人のユーザー名を写さない)
    const home = process.env.HOME ?? "";
    await page.evaluate((prefix) => {
      for (const code of document.querySelectorAll(".export-notice__path")) {
        code.textContent = (code.textContent ?? "").split(prefix).join("~");
      }
    }, home);
    await target("notice", page.locator(".export-notice"));
    await wait(2200);
  });

const STEP_RUNNERS = {
  sheet: recordSheet,
  list: recordList,
  editor: recordEditor,
  switch: recordSwitch,
  export: recordExport,
};

const main = async () => {
  const browser = await chromium.launch();
  try {
    for (const step of only) {
      const run = STEP_RUNNERS[step];
      if (!run) throw new Error(`知らない場面: ${step}`);
      await run(browser);
    }
  } finally {
    await browser.close();
  }
};

await main();
