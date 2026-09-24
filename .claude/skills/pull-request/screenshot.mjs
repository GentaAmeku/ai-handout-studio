#!/usr/bin/env node
// 起動中の dev サーバーの画面を1枚撮る。PR に貼る変更前・変更後の画像に使う(SKILL.md)。
//
//   node .claude/skills/pull-request/screenshot.mjs --path /decks/<id> --out <file.png>
//     [--selector "header.viewer__bar"]  その要素だけを撮る。無ければ画面全体
//     [--click "PDF"]...                 撮る前に、名前がこの文字を含むボタンを順に押す
//     [--fill "メモ=テキスト"]...          撮る前に、ラベルの欄へ文字を入れる(未保存の状態を作る)
//     [--wait-for ".export-notice__actions"]  押したあと、この要素が出るまで待つ
//     [--width 1600] [--height 900] [--origin http://127.0.0.1:5199]
//
// 画面の言語はサーバーの LANG で決まる。日本語で撮るなら LANG=ja_JP.UTF-8 で dev を起動する

import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    path: { type: "string" },
    out: { type: "string" },
    selector: { type: "string" },
    click: { type: "string", multiple: true, default: [] },
    fill: { type: "string", multiple: true, default: [] },
    "wait-for": { type: "string" },
    width: { type: "string", default: "1600" },
    height: { type: "string", default: "900" },
    origin: { type: "string", default: "http://127.0.0.1:5199" },
  },
});

if (!values.path || !values.out) {
  console.error("--path と --out を指定する");
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(values.width), height: Number(values.height) },
    // 高解像度で撮って、PR で縮めて見ても文字をつぶさない
    deviceScaleFactor: 2,
  });
  await page.goto(new URL(values.path, values.origin).href);
  await page.waitForLoadState("networkidle");
  // fill() で値を差し込むだけでは、編集画面の欄が変更として受け取らない。人と同じくキーを打って離れる
  for (const entry of values.fill) {
    const [label, ...rest] = entry.split("=");
    const field = page.getByLabel(label).first();
    await field.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(rest.join("="));
    await field.blur();
  }
  for (const name of values.click) {
    await page.getByRole("button", { name }).first().click();
  }
  if (values["wait-for"]) {
    await page.waitForSelector(values["wait-for"], { timeout: 90_000 });
  }
  // フォーカスの枠や動きが収まるのを待つ
  await page.waitForTimeout(500);
  const target = values.selector ? page.locator(values.selector).first() : page;
  await target.screenshot({ path: values.out });
  console.log(values.out);
} finally {
  await browser.close();
}
