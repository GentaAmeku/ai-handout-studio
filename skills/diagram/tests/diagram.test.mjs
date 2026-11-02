// 生成器のテスト。見本の JSON から出した SVG のハッシュを、保存したハッシュ(snapshots.json)と比べる。
// 見た目を意図して変えたときは UPDATE_SNAPSHOTS=1 を付けて走らせ、保存したハッシュを書き直す。
// 走らせ方: node --test skills/diagram/tests/diagram.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { DiagramError, render } from "../scripts/diagram.mjs";
import { wrap } from "../scripts/lib/text.mjs";
import * as structure from "../scripts/types/structure.mjs";

const examples = new URL("../examples/", import.meta.url);
const names = readdirSync(examples)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));
const example = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, examples), "utf8"));

// 見本ごとの SVG のハッシュ。SVG そのものはリポジトリに置かず、見た目が変わったことだけを知らせる
const snapshotFile = new URL("snapshots.json", import.meta.url);
const snapshots = JSON.parse(readFileSync(snapshotFile, "utf8"));
const updating = process.env.UPDATE_SNAPSHOTS === "1";
if (updating) after(() => writeFileSync(snapshotFile, `${JSON.stringify(snapshots, null, 2)}\n`));

for (const name of names) {
  test(`見本「${name}」の SVG が、保存したハッシュと同じ`, () => {
    const hash = createHash("sha256").update(render(example(name))).digest("hex");
    if (updating) snapshots[name] = hash;
    assert.equal(
      hash,
      snapshots[name],
      `見本「${name}」の見た目が変わりました。PNG にして開いて確かめ、意図した変更なら UPDATE_SNAPSHOTS=1 を付けて走らせてください`,
    );
  });
}

// 別々の線の区間どうしで、内側で交わるもの(交差)と、同じ線の上を重なって走るもの(重なり)を数える
function tangles(routes) {
  const segments = routes.flatMap(({ points }, route) =>
    points.slice(1).map((p, i) => {
      const [a, b] = [points[i], p];
      const horizontal = a[1] === b[1];
      const [lo, hi] = horizontal ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      return { route, horizontal, at: horizontal ? a[1] : a[0], lo, hi };
    }),
  );
  let crossings = 0;
  let overlaps = 0;
  segments.forEach((s, i) => {
    for (const t of segments.slice(i + 1)) {
      if (s.route === t.route) continue;
      if (s.horizontal === t.horizontal) {
        if (Math.abs(s.at - t.at) < 1 && Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 1) overlaps++;
      } else if (t.at > s.lo + 0.5 && t.at < s.hi - 0.5 && s.at > t.lo + 0.5 && s.at < t.hi - 0.5) {
        crossings++;
      }
    }
  });
  return { crossings, overlaps };
}

for (const name of names.filter((n) => example(n).type === "structure")) {
  test(`構成の図「${name}」の線は、交差も重なりもしない`, () => {
    const { routes } = structure.layout(example(name), []);
    assert.ok(routes.length > 0);
    assert.deepEqual(tangles(routes), { crossings: 0, overlaps: 0 });
  });
}

test("heading: false なら、図の中に題と説明を描かない", () => {
  const spec = example("flow-lanes");
  const svg = render(spec, { heading: false });
  assert.ok(!svg.includes('class="title"'));
  assert.ok(!svg.includes('class="caption"'));
  assert.ok(svg.includes(`<title>${spec.title}</title>`), "読み上げ用の題は残す");
});

// 読めない図は作らず、直し方を返す。SKILL.md の「指摘を直す」と対応する
const problemsOf = (spec) => {
  try {
    render(spec);
  } catch (e) {
    if (e instanceof DiagramError) return e.problems;
    throw e;
  }
  return [];
};
const box = (id, label = id) => ({ id, label });
const flow = (more = {}) => ({ type: "flow", title: "題", caption: "説明", nodes: [box("a"), box("b")], edges: [{ from: "a", to: "b" }], ...more });

for (const [what, spec, expected] of [
  ["種類が無い", { ...flow(), type: "sequence" }, "type は flow / structure / compare のどれか"],
  ["題が無い", flow({ title: "" }), "title(何の図か)が要ります"],
  ["説明が無い", flow({ caption: "" }), "caption(何を示す図か、1〜2文)が要ります"],
  ["箱が13個ある", flow({ nodes: Array.from({ length: 13 }, (_, i) => box(`n${i}`)), edges: [] }), "箱が13個あります"],
  ["矢印の先が無い", flow({ edges: [{ from: "a", to: "z" }] }), "矢印の先「z」がありません"],
  ["ラベルが3行になる", flow({ nodes: [box("a", "とても長いラベルを書いてしまったので箱の中に収まらず三行目まで続いてしまう"), box("b")] }), "が長すぎます"],
  ["role を書き間違えた", flow({ nodes: [{ id: "a", label: "a", role: "sreen" }, box("b")] }), "role「sreen」は"],
  ["change を書き間違えた", flow({ nodes: [{ id: "a", label: "a", change: "added" }, box("b")] }), "change「added」は"],
  ["つながりの change を書き間違えた", flow({ edges: [{ from: "a", to: "b", change: "add" }] }), "change「add」は"],
  ["自分への矢印を書いた", flow({ edges: [{ from: "a", to: "a" }] }), "自分への矢印は描けません"],
  ["知らない項目を書いた", flow({ directon: "down" }), "「directon」は書けません"],
  ["箱に知らない項目を書いた", flow({ nodes: [{ id: "a", label: "a", rol: "user" }, box("b")] }), "「rol」は書けません"],
  ["ラベルが文字でない", flow({ nodes: [{ id: "a", label: 3 }, box("b")] }), "id と label(文字)が要ります"],
  ["nodes が配列でない", flow({ nodes: "a" }), "nodes(箱の配列)が要ります"],
  ["図が JSON のオブジェクトでない", null, "オブジェクトで書いてください"],
  ["type が組み込みの名前", { ...flow(), type: "toString" }, "type は flow / structure / compare のどれか"],
  ["レーンに無い箱を入れた", flow({ lanes: [{ label: "L", nodes: ["a", "b", "z"] }] }), "レーン「L」の箱「z」がありません"],
  ["レーンに label が無い", flow({ lanes: [{ nodes: ["a", "b"] }] }), "レーンには label が要ります"],
  ["レーンに箱が無い", flow({ lanes: [{ label: "L" }] }), "レーン「L」に箱がありません"],
  ["比較の前と後で種類が違う", { type: "compare", title: "題", caption: "説明", before: { type: "flow", nodes: [box("a")] }, after: { type: "structure", nodes: [box("a")] } }, "同じ種類の図にしてください"],
  ["比較の片側に誤りがある", { type: "compare", title: "題", caption: "説明", before: { type: "flow", nodes: [box("a")] }, after: { type: "flow", nodes: [box("a")], edges: [{ from: "a", to: "z" }] } }, "after: 矢印の先「z」がありません"],
  ["囲みに無い箱を入れた", { type: "structure", title: "題", caption: "説明", nodes: [box("a")], boundaries: [{ label: "囲み", nodes: ["z"] }] }, "囲み「囲み」の箱「z」がありません"],
]) {
  test(`検査: ${what}なら、直し方を返して止める`, () => {
    const problems = problemsOf(spec);
    assert.ok(problems.some((p) => p.includes(expected)), problems.join("\n"));
  });
}

test("長い題は、図の幅で折り返す", () => {
  const svg = render(flow({ title: "とても長い題を付けたので図の幅に収まらずに二行目まで続いてしまう題の例です" }));
  assert.ok(svg.split('class="title"').length - 1 >= 2);
});

// コマンドを一時ディレクトリで動かす。args は作業場所を受け取って引数を返す
function cli(args, { input = fileURLToPath(new URL("flow-lanes.json", examples)), env = process.env } = {}) {
  const work = mkdtempSync(join(tmpdir(), "diagram-test-"));
  try {
    const script = fileURLToPath(new URL("../scripts/diagram.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, typeof input === "function" ? input(work) : input, ...args(work)], { env, encoding: "utf8" });
    return { ...result, files: readdirSync(work) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test("playwright-cli が無ければ、PNG だけを飛ばしてほかの形式は書き出し、終了コード3で知らせる", () => {
  const { status, stderr, files } = cli((w) => ["-o", join(w, "out.png"), "-o", join(w, "out.svg")], { env: { PATH: "" } });
  assert.equal(status, 3, stderr);
  assert.match(stderr, /相手に聞いてから決めてください。手順は .*SKILL\.md の「書き出す」/);
  assert.deepEqual(files, ["out.svg"]);
});

test("PLAYWRIGHT_CLI があれば、そのコマンドで撮る(npx で動かすとき)", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-fake-"));
  try {
    const log = join(dir, "calls.txt");
    const fake = join(dir, "fake-cli.mjs");
    writeFileSync(fake, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);
    const { status, stderr } = cli((w) => ["-o", join(w, "out.png")], { env: { PATH: "", PLAYWRIGHT_CLI: `${process.execPath} ${fake} --via-npx` } });
    assert.equal(status, 0, stderr);
    const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(
      calls.map(([prefix, session, command]) => [prefix, session.startsWith("-s=diagram-"), command]),
      [["--via-npx", true, "open"], ["--via-npx", true, "run-code"], ["--via-npx", true, "close"]],
    );
    // コードは引数でそのまま渡す(--filename に頼らない)
    assert.match(calls[1][3], /^async \(page\) => \{[\s\S]*screenshot/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const hasPlaywright = spawnSync("playwright-cli", ["--version"], { stdio: "ignore" }).status === 0;

test("playwright-cli で PNG を書き出す(入っているときだけ走らせる)", { skip: !hasPlaywright && "playwright-cli が無い" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-png-test-"));
  try {
    const out = join(dir, "out.png");
    const script = fileURLToPath(new URL("../scripts/diagram.mjs", import.meta.url));
    const { status, stderr } = spawnSync(process.execPath, [script, fileURLToPath(new URL("compare.json", examples)), "-o", out], { encoding: "utf8" });
    assert.equal(status, 0, stderr);
    // PNG の先頭の8バイトと、2倍で撮った幅
    const png = readFileSync(out);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const [, width] = render(example("compare")).match(/viewBox="0 0 (\d+)/).map(Number);
    assert.equal(png.readUInt32BE(16), width * 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("知らない引数なら、使い方を返して終了コード2で止める", () => {
  const { status, stderr } = cli((w) => ["-o", join(w, "out.svg"), "--heading"]);
  assert.equal(status, 2);
  assert.match(stderr, /使い方/);
});

test("書き出せない拡張子が1つでもあれば、何も書き出さずに終了コード2で止める", () => {
  const { status, files } = cli((w) => ["-o", join(w, "a.svg"), "-o", join(w, "a.pdf")]);
  assert.equal(status, 2);
  assert.deepEqual(files, []);
});

test("図の JSON を読めなければ、終了コード2で止める", () => {
  const broken = (w) => {
    writeFileSync(join(w, "broken.json"), "{ type: flow");
    return join(w, "broken.json");
  };
  const { status, stderr } = cli((w) => ["-o", join(w, "a.svg")], { input: broken });
  assert.equal(status, 2);
  assert.match(stderr, /図の JSON を読めませんでした/);
});

test("字の単位で割るときも、句読点を行頭に置かない", () => {
  const lines = wrap("あああああああああ。", 15, 148);
  assert.ok(lines.every((line) => !line.startsWith("。")), JSON.stringify(lines));
});

test("レーンのある横向きの図が 2,400px を超えるなら、縦のスイムレーンに切り替える", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
  const spec = flow({
    nodes: ids.map((id) => box(id, `ここで次の手順へ進める ${id}`)),
    edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
    lanes: [
      { label: "システム", nodes: ids.slice(0, 10) },
      { label: "担当者", nodes: ids.slice(10) },
    ],
  });
  const [, width, height] = render(spec).match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  assert.ok(width <= 2400 && height > width, `${width}x${height}`);
});

test("つながりのラベルが箱の中の字に重なるなら、短くするよう返して止める", () => {
  const spec = flow({
    nodes: [box("a"), { id: "d", label: "通る？", role: "decision" }, box("b"), box("x")],
    edges: [
      { from: "a", to: "d" },
      { from: "d", to: "b", label: "この条件のときだけ次へ進め、そうでなければ最初の手順に戻って確かめ直す" },
      { from: "d", to: "x", label: "いいえ" },
    ],
  });
  assert.match(problemsOf(spec).join("\n"), /つながり「d → b」のラベル「.*」が、箱の中の字に重なります/);
});

test("段階の途中では折り返さない。入らない段階は次の境目まで1行を延ばす", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `n${i}`);
  const spec = flow({
    nodes: ids.map((id) => box(id, `手順 ${id}`)),
    edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
    phases: [
      { label: "準備", nodes: ids.slice(0, 3) },
      { label: "本番", nodes: ids.slice(3) },
    ],
  });
  const svg = render(spec);
  // 段階の見出しは、行ごとに描く。どちらの段階も1行に収まっていれば1回ずつ
  for (const label of ["準備", "本番"]) assert.equal(svg.split(`>${label}<`).length - 1, 1, label);
});

test("--no-heading なら、図の中に題と説明を描かない", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-heading-"));
  try {
    const out = join(dir, "out.svg");
    const script = fileURLToPath(new URL("../scripts/diagram.mjs", import.meta.url));
    const { status, stderr } = spawnSync(process.execPath, [script, fileURLToPath(new URL("flow-lanes.json", examples)), "-o", out, "--no-heading"], { encoding: "utf8" });
    assert.equal(status, 0, stderr);
    assert.ok(!readFileSync(out, "utf8").includes('class="title"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("題と説明に日本語が無ければ、凡例と変更の印を英語で書く", () => {
  const svg = render(example("structure-en"));
  for (const word of ["Legend", "New", "Changed", "Unchanged"]) assert.ok(svg.includes(`>${word}<`), word);
  assert.ok(!/[぀-ヿ㐀-鿿]/u.test(svg), "日本語が残っている");
});

test("題か説明に日本語があれば、凡例と変更の印を日本語で書く", () => {
  const svg = render(example("structure"));
  for (const word of ["凡例", "新規", "変更"]) assert.ok(svg.includes(`>${word}<`), word);
});

test("英語の比較の図は、見出しも英語で書く", () => {
  const side = (id) => ({ type: "flow", nodes: [{ id, label: id }] });
  const svg = render({ type: "compare", title: "Title", caption: "Caption", before: side("a"), after: side("b") });
  assert.ok(svg.includes(">Before<") && svg.includes(">After<"));
});

// 図解スキルは単体で入れられる。フォルダの外を読むと、写した先で動かなくなる
test("スキルのフォルダだけを写しても動く", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-portable-"));
  try {
    const skill = join(dir, "diagram");
    cpSync(fileURLToPath(new URL("../", import.meta.url)), skill, { recursive: true });
    const { status, stderr } = spawnSync(process.execPath, [join(skill, "scripts/diagram.mjs"), join(skill, "examples/structure.json"), "-o", join(dir, "out.svg")], { cwd: dir, encoding: "utf8" });
    assert.equal(status, 0, stderr);
    assert.ok(readFileSync(join(dir, "out.svg"), "utf8").startsWith("<svg"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
