#!/usr/bin/env node
// 図の JSON を検査し、SVG を作って、出力先の拡張子に合わせて書き出す。
// 使い方: node diagram.mjs <spec.json> -o <out.png|out.svg|out.html> [-o ...] [--theme plain|grid] [--no-heading]
// 依存は Node の標準機能だけ。PNG だけ playwright-cli(ブラウザで SVG を撮る)を使う。
// playwright-cli を npx で動かすときは、呼ぶコマンドを環境変数 PLAYWRIGHT_CLI に空白区切りで書く(例: npx -y @playwright/cli@latest)。
// 終了コード: 1 は図の検査に通らない、2 は使い方か入力ファイルの誤り、3 は PNG を書き出せなかった(ほかの形式は書き出す)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSpec } from "./lib/check.mjs";
import { DiagramError, colorModeOf, esc, header, legend, legendEntries, svgDocument } from "./lib/draw.mjs";
import { METRICS, THEMES } from "./lib/style.mjs";
import { langOf } from "./lib/text.mjs";
import * as compare from "./types/compare.mjs";
import * as flow from "./types/flow.mjs";
import * as structure from "./types/structure.mjs";

const TYPES = { flow, structure, compare };
const M = METRICS.margin;
const GUIDE = fileURLToPath(new URL("../SKILL.md", import.meta.url));

export { DiagramError };

// 図の JSON から SVG の文字列を作る。検査に通らなければ DiagramError(problems に指摘の配列)を投げる。
// heading: false なら図の中に題と説明を描かない(載せる側が図の下に出すとき)。読み上げ用の <title> は残す
export function render(spec, { theme = "plain", heading = true } = {}) {
  const problems = [];
  checkSpec(spec, problems);
  if (problems.length) throw new DiagramError(problems);

  const nodes = spec.type === "compare" ? [...spec.before.nodes, ...spec.after.nodes] : spec.nodes;
  const colorMode = colorModeOf(nodes);
  const lang = langOf(spec);
  const drawing = TYPES[spec.type].layout({ ...spec, colorMode, lang }, problems);
  if (drawing.width > METRICS.maxCanvasW)
    problems.push(`図の幅が ${Math.round(drawing.width)}px になりました。${METRICS.maxCanvasW}px を超えると、拡大しても全体が見渡せません。図を分けるか、箱を減らしてください`);
  if (problems.length) throw new DiagramError(problems);

  const width = Math.max(drawing.width, 560);
  const head = heading ? header(spec.title, spec.caption, width) : { svg: "", height: 0 };
  const leg = legend(legendEntries(drawing.nodes, colorMode, lang), M, 0, width - M * 2, lang);
  const legendY = head.height + drawing.height;
  const body =
    head.svg +
    `<g transform="translate(${(width - drawing.width) / 2} ${head.height})">${drawing.body}</g>` +
    `<g transform="translate(0 ${legendY})">${leg.svg}</g>`;
  return svgDocument({
    width,
    height: legendY + leg.height + (leg.height ? 16 : 0),
    body,
    theme,
    title: spec.title,
    caption: spec.caption,
  });
}

// ---------- 書き出し。形式を足すときは、ここに1つ足す ----------

const EXPORTERS = {
  ".svg": (svg, out) => writeFileSync(out, svg),
  ".html": (svg, out, spec) => writeFileSync(out, htmlPage(svg, spec)),
  ".png": (svg, out) => png(svg, out),
};

const htmlPage = (svg, spec) =>
  `<!doctype html><html lang="${langOf(spec)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.title)}</title>` +
  `<style>body{margin:0;background:${THEMES.plain.bg}}figure{margin:24px auto;max-width:max-content}svg{max-width:100%;height:auto}</style></head>` +
  `<body><figure>${svg}</figure></body></html>`;

// playwright-cli が無いときに投げる。ほかの形式の書き出しは続ける
class MissingPlaywright extends Error {}

// SVG を2倍の大きさでブラウザに描かせて撮る。ベクターなので、2倍でもにじまない
// コードは run-code の引数で渡す(リポジトリの playwright-cli の手順と同じ形)。図は HTML のファイルにして開くので、コードは短いまま
function png(svg, out, scale = 2) {
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const scaled = svg.replace(/ width="\d+" height="\d+"/, ` width="${w * scale}" height="${h * scale}"`);
  const work = mkdtempSync(join(tmpdir(), "diagram-png-"));
  const session = `diagram-${process.pid}`;
  const html = join(work, "diagram.html");
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${scaled}</body></html>`);
  const code = `async (page) => {
  await page.setViewportSize({ width: ${w * scale + 16}, height: ${h * scale + 16} });
  await page.goto(${JSON.stringify(pathToFileURL(html).href)});
  await page.evaluate(() => document.fonts.ready);
  await page.locator("svg").first().screenshot({ path: ${JSON.stringify(resolve(out))} });
  return "ok";
}`;
  const [command, ...prefix] = (process.env.PLAYWRIGHT_CLI || "playwright-cli").trim().split(/\s+/);
  const run = (args) => execFileSync(command, [...prefix, `-s=${session}`, ...args], { cwd: work, stdio: "pipe" });
  try {
    run(["open", "about:blank"]);
    run(["run-code", code]);
  } catch (e) {
    throw e.code === "ENOENT" ? new MissingPlaywright() : e;
  } finally {
    try {
      run(["close"]);
    } catch {}
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- コマンド ----------

const USAGE = "使い方: node diagram.mjs <spec.json> -o <out.png|out.svg|out.html> [-o ...] [--theme plain|grid] [--no-heading]";

const fail = (code, message) => {
  console.error(message);
  process.exitCode = code;
};

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: { out: { type: "string", short: "o", multiple: true }, theme: { type: "string" }, "no-heading": { type: "boolean" } },
    });
  } catch (e) {
    return fail(2, `${e.message}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  const outs = values.out ?? [];
  if (positionals.length !== 1 || !outs.length) return fail(2, USAGE);
  const theme = values.theme ?? "plain";
  if (!Object.hasOwn(THEMES, theme)) return fail(2, `--theme は ${Object.keys(THEMES).join(" / ")} のどれかにしてください`);
  // 書き出す前に全部の出力先を確かめる(途中まで書いてから止まらないように)
  const unknown = outs.filter((out) => !Object.hasOwn(EXPORTERS, extname(out)));
  if (unknown.length) return fail(2, `${unknown.join("・")} には書き出せません(${Object.keys(EXPORTERS).join(" / ")})`);

  let spec;
  try {
    spec = JSON.parse(readFileSync(positionals[0], "utf8"));
  } catch (e) {
    return fail(2, `図の JSON を読めませんでした: ${e.message}`);
  }
  let svg;
  try {
    svg = render(spec, { theme, heading: !values["no-heading"] });
  } catch (e) {
    if (!(e instanceof DiagramError)) throw e;
    return fail(1, `図を作れませんでした。直してから、もう一度実行してください。\n${e.message}`);
  }
  // PNG を書き出せなくても、ほかの形式は書き出す
  for (const out of outs) {
    try {
      EXPORTERS[extname(out)](svg, out, spec);
      console.log(resolve(out));
    } catch (e) {
      if (extname(out) !== ".png") throw e;
      fail(
        3,
        e instanceof MissingPlaywright
          ? `playwright-cli が無いので、${out} は書き出していません(ほかの形式は書き出しました)。入れるかは、相手に聞いてから決めてください。手順は ${GUIDE} の「書き出す」にあります`
          : `${out} を書き出せませんでした(${String(e.message).split("\n")[0]})。ブラウザが入っていないなら、${GUIDE} の「書き出す」に従ってください`,
      );
    }
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));
