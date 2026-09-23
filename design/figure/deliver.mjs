#!/usr/bin/env node
/*
 * ai-handout-studio — 図を出す
 *
 *   node figure/deliver.mjs <入力.json> [--as snippet|page] [--out <書き出し先>]
 *
 * 検査を通らなければ何も書かず、診断を出して 1 で終わる。
 * 「書けた」と言えるのは 0 で終わったときだけ。
 *
 *   0  出せた
 *   1  入力が検査に落ちた
 *   2  使い方が違う / ファイルを読めない・書けない
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  formatDiagnostics,
  page,
  render,
  snippet,
  validate,
} from "./render.mjs";

const USAGE = `使い方: node figure/deliver.mjs <入力.json> [--as snippet|page] [--out <書き出し先>]

  --as snippet   文書へ貼り込む <figure class="ds-figure"> の断片(既定)
  --as page      単体で開ける HTML。既定のテーマの tokens と document.css を埋め込む
  --out <path>   書き出し先。省くと標準出力へ出す

入力の形は figure/schema.json にある。`;

const die = (code, text) => {
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
};

const parse = (argv) => {
  const opts = { as: "snippet", out: null, input: null };
  /* 値を取る指定は、次の語が無いまま終わっていないかをその場で見る。 */
  const value = (flag, next) => {
    if (next === undefined || next.startsWith("-"))
      die(2, `${flag} に値が無い\n\n${USAGE}`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") die(0, USAGE);
    else if (a === "--as") opts.as = value(a, argv[++i]);
    else if (a === "--out") opts.out = value(a, argv[++i]);
    else if (a.startsWith("-")) die(2, `知らない指定: ${a}\n\n${USAGE}`);
    else if (opts.input === null) opts.input = a;
    else die(2, `入力は1つだけ: ${opts.input} と ${a}\n\n${USAGE}`);
  }
  if (!opts.input) die(2, USAGE);
  if (!["snippet", "page"].includes(opts.as))
    die(2, `--as は snippet か page: ${opts.as}`);
  return opts;
};

const opts = parse(process.argv.slice(2));

let input;
try {
  input = JSON.parse(readFileSync(opts.input, "utf8"));
} catch (e) {
  die(2, `入力が読めない: ${opts.input}\n  ${e.message}`);
}

const diagnostics = validate(input);
if (diagnostics.length) {
  die(
    1,
    `${opts.input} は検査に落ちた(${diagnostics.length} 件)\n\n${formatDiagnostics(diagnostics)}`,
  );
}

const out = opts.as === "page" ? page(input) : `${snippet(input)}\n`;

if (opts.out) {
  try {
    writeFileSync(opts.out, out);
  } catch (e) {
    die(2, `書き出せない: ${opts.out}\n  ${e.message}`);
  }
  const { nodes, width, height } = render(input);
  console.log(
    `${opts.out} へ書いた(${opts.as} / ノード ${nodes} / ${width}×${height}px)`,
  );
} else {
  process.stdout.write(out);
}
