/*
 * ai-handout-studio — 図の生成器
 *
 * 入力は figure/schema.json に従う小さな JSON。座標も色も書かない。
 * ここが持つのは「検査」「版付け」「SVG の組み立て」の3つ。
 * 色・箱の形(角・角丸・両端が丸い・楕円)・線の太さと線種・矢印の塗りと大きさは
 * .ds-node / .ds-link / .ds-arrow と部品の変数(--figure-*)に任せ、SVG には一切書かない。
 * テーマ(design/themes/)の components.figure がそれを決める。
 * 箱の形は rect の rx を CSS で与えて作るので、段(step)と外(outside)は rect のまま出す。
 * 楕円(rx・ry が箱の半分で頭打ち)でも、上限 10 字幅(約 144px)のラベルは
 * 文字の帯(中心から上下 8px)での内幅 約 166px に収まる。
 *
 * 使う側は deliver.mjs から呼ぶ。検査を通らない入力を render に渡してはいけない。
 */

import { existsSync, readFileSync } from "node:fs";

const schemaUrl = new URL("./schema.json", import.meta.url);
export const SCHEMA = JSON.parse(readFileSync(schemaUrl, "utf8"));

/* ---------- 寸法。ここが正準。箱の角丸と破線の刻みは document.css と部品の変数が持つ ---------- */

export const SPEC = Object.freeze({
  boxW: 176, // 箱の幅。3つ横に並べても .ds-figure-frame の内寸 590px に収まる
  boxH: 48,
  gapV: 44, // 縦の間隔。矢印がここを通る
  gapH: 20, // 横の間隔
  padX: 12, // 箱の内側、左右の余白
  hexPoint: 14, // 六角形の左右の尖り
  cylinderRy: 6, // 円筒の楕円の高さ
  arrow: 8, // 矢印の頭の長さ
  fontPx: 14, // .ds-figure-frame svg の font-size（--fs-ui）。字の大きさの倍率は document.css が SVG ごと zoom で掛ける
  tracking: 0.03, // .ds-figure-frame svg の letter-spacing
  maxNodes: 9,
  maxSiblings: 3,
  capWide: 10, // step / outside / store のラベル上限（字幅）
  capHex: 8, // branch のラベル上限（字幅）
});

export const KINDS = Object.freeze({
  step: { ja: "段", shape: "角丸長方形", cap: SPEC.capWide },
  branch: { ja: "分かれ目", shape: "六角形", cap: SPEC.capHex },
  outside: { ja: "外", shape: "破線の枠", cap: SPEC.capWide },
  store: { ja: "保管", shape: "円筒", cap: SPEC.capWide },
});

/*
 * 送り幅の表。0x20〜0x7e の 95 文字を 1/1000em で凍らせたもの（2026-09-18）。
 * 本文の書体 Noto Sans JP 400 と、フォントを読めない場(質問票は CSP で外の書体を止める)で
 * Mac が代わりに使う Hiragino Sans の、Chrome の canvas.measureText の実測値の大きいほう。
 *
 * 表に無い文字は全角（1000）として数える。半角カナ(U+FF61〜FF9F)だけは 500。
 * ラテン文字の合成済み字(é など)は全角として多めに数える。
 * 多めに見積もるぶんには箱からはみ出さないので、そちら側に倒してある。
 * 書体を変えたら測り直す。
 */
const ADVANCE = [
  333, 323, 474, 657, 650, 921, 797, 278, 356, 356, 467, 656, 278, 358, 278,
  474, 657, 657, 657, 657, 661, 657, 657, 657, 657, 657, 278, 278, 555, 656,
  555, 571, 946, 750, 712, 756, 758, 643, 602, 754, 778, 293, 535, 707, 602,
  945, 774, 795, 662, 795, 726, 669, 649, 773, 717, 1006, 722, 688, 669, 346,
  474, 346, 555, 559, 606, 575, 646, 578, 646, 588, 417, 641, 617, 275, 275,
  575, 284, 931, 618, 625, 647, 646, 430, 537, 392, 618, 544, 802, 536, 554,
  498, 347, 375, 347, 555,
];

const advanceEm = (cp) => {
  if (cp >= 0x20 && cp <= 0x7e) return ADVANCE[cp - 0x20] / 1000;
  if (cp >= 0xff61 && cp <= 0xff9f) return 0.5; // 半角カナ
  return 1;
};

/* 1 字幅 = 全角1文字ぶんの送り = (1 + tracking) em。 */
const EM_PER_UNIT = 1 + SPEC.tracking;

/** ラベルの幅を字幅で返す。全角1文字がちょうど 1.0。 */
export const widthOf = (label) => {
  const em = [...label].reduce(
    (sum, c) => sum + advanceEm(c.codePointAt(0)) + SPEC.tracking,
    0,
  );
  return em / EM_PER_UNIT;
};

export const toPx = (units) => units * EM_PER_UNIT * SPEC.fontPx;

/** 上限に収まる一番長い前置き。診断で「ここまでなら入る」と示すために使う。 */
const trimTo = (label, cap) => {
  const chars = [...label];
  let kept = "";
  for (const c of chars) {
    if (widthOf(kept + c) > cap) break;
    kept += c;
  }
  return kept;
};

/*
 * 改行と制御文字。ラベルは1行に置くので、入っていると版付けが崩れる。
 * C0(0x00〜0x1f)・DEL(0x7f)・C1(0x80〜0x9f)を落とす。
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を見つけるための正規表現
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** 制御文字を \uXXXX の形に開く。診断の1行が改行で割れないようにする。 */
const openControls = (s) =>
  s.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を開くための正規表現
    /[\u0000-\u001f\u007f-\u009f]/g,
    (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`,
  );

/* ---------- 検査 ---------- */

const typeOf = (v) =>
  Array.isArray(v) ? "array" : v === null ? "null" : typeof v;

const REF = /^#\/\$defs\/([A-Za-z0-9_]+)$/;

const resolve = (ref) => {
  const m = REF.exec(ref);
  if (!m || !SCHEMA.$defs?.[m[1]])
    throw new Error(`schema.json の $ref が引けない: ${ref}`);
  return SCHEMA.$defs[m[1]];
};

const show = (v) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

/* ---------- 守り。schema.json が検査器を追い越していないか ---------- */

/*
 * schema.json を「入力の正本」と名乗らせている以上、そこに書いたことが実際に
 * 効いている必要がある。検査器は JSON Schema の一部しか実装していないので、
 * 実装した書き方の外へ出ていないかをここで見る。
 *
 * 見るのはキーワードの名前と、その値の形の両方。名前だけを見ていると、
 * additionalProperties を false から schema へ書き換えるような「厳しくした
 * つもり」で検査が黙って効かなくなる。緩む向きの間違いは、締めすぎる向きと
 * 違って見本が落ちてくれないので、ここで捕まえるしかない。
 *
 * 返り値が空なら、schema に書いたことは全部 checkSchema が実際に見ている。
 */

const TYPES = ["object", "array", "string", "number", "boolean", "null"];
const ANNOTATIONS = ["$schema", "$id", "title", "description"];

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isValue = (v) =>
  v === null || ["string", "number", "boolean"].includes(typeof v);
const isCount = (v) => Number.isInteger(v) && v >= 0;

const text = (v) => (typeof v === "string" ? null : "文字で書く");
const count = (v) =>
  isCount(v) ? null : `0 以上の整数で書く(${show(v)} がある)`;
const asSchema = (v) => (isPlain(v) ? null : "名前と schema の対応で書く");

/* キーワードごとに、実装した書き方かどうかを見る。null なら読める。 */
const FORMS = {
  ...Object.fromEntries(ANNOTATIONS.map((k) => [k, text])),
  type: (v) =>
    TYPES.includes(v)
      ? null
      : `見るのは ${TYPES.join(" / ")} だけ(${show(v)} がある)`,
  const: (v) =>
    isValue(v)
      ? null
      : "=== で比べるので、書けるのは値そのもの(文字・数・真偽・null)だけ",
  enum: (v) =>
    Array.isArray(v) && v.length > 0 && v.every(isValue)
      ? null
      : "値そのものを1つ以上並べた配列で書く",
  required: (v) =>
    Array.isArray(v) && v.every((x) => typeof x === "string")
      ? null
      : "キー名を並べた配列で書く",
  additionalProperties: (v) =>
    v === false ? null : `false だけを実装している(${show(v)} がある)`,
  items: (v) =>
    isPlain(v)
      ? null
      : "schema を1つだけ書く。並べて書く形(タプル)は実装していない",
  properties: asSchema,
  $defs: asSchema,
  minItems: count,
  maxItems: count,
  minLength: count,
  maxLength: count,
  $ref: (v) => {
    if (typeof v !== "string" || !REF.test(v))
      return '"#/$defs/名前" の形だけを引ける';
    return SCHEMA.$defs?.[REF.exec(v)[1]]
      ? null
      : `引く先が $defs に無い(${v})`;
  },
};

/** 形が読めたときだけ、その先の schema へ入る。 */
const DESCEND = {
  items: (v, at, gaps) => schemaGaps(v, at, gaps),
  properties: (v, at, gaps) =>
    Object.entries(v).forEach(([n, sub]) => {
      schemaGaps(sub, `${at}/${n}`, gaps);
    }),
  $defs: (v, at, gaps) =>
    Object.entries(v).forEach(([n, sub]) => {
      schemaGaps(sub, `${at}/${n}`, gaps);
    }),
};

export const schemaGaps = (node = SCHEMA, at = "", gaps = []) => {
  if (!isPlain(node)) {
    gaps.push(
      `${at || "/"}: schema はオブジェクトで書く(${show(node)} がある)`,
    );
    return gaps;
  }
  /* $ref に当たると隣を見ずにそちらへ移るので、隣に書いたものは効かない。 */
  if ("$ref" in node) {
    const ignored = Object.keys(node).filter(
      (k) => k !== "$ref" && !ANNOTATIONS.includes(k),
    );
    if (ignored.length > 0) {
      gaps.push(
        `${at}/$ref: $ref の隣に書いたものは見ない(${ignored.join(" / ")})`,
      );
    }
  }
  for (const [k, v] of Object.entries(node)) {
    const here = `${at}/${k}`;
    const form = FORMS[k];
    if (!form) {
      gaps.push(`${here}: 実装していないキーワード`);
      continue;
    }
    const complaint = form(v);
    if (complaint) gaps.push(`${here}: ${complaint}`);
    else DESCEND[k]?.(v, here, gaps);
  }
  return gaps;
};

const checkSchema = (value, schema, at, out) => {
  if (schema.$ref) return checkSchema(value, resolve(schema.$ref), at, out);

  if (schema.type && typeOf(value) !== schema.type) {
    out.push({
      rule: "schema/type",
      at,
      message: `${schema.type} を書くところに ${typeOf(value)} がある`,
      fix: `${schema.type} にする`,
    });
    return;
  }
  if ("const" in schema && value !== schema.const) {
    out.push({
      rule: "schema/const",
      at,
      message: `${show(value)} は使えない`,
      fix: `${show(schema.const)} にする`,
    });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    out.push({
      rule: "schema/enum",
      at,
      message: `${show(value)} は使えない`,
      fix: `使えるのは ${schema.enum.map(show).join(" / ")}`,
    });
  }
  if (typeOf(value) === "string") {
    if (schema.minLength != null && [...value].length < schema.minLength) {
      out.push({
        rule: "schema/min-length",
        at,
        message: `${[...value].length} 文字。下限は ${schema.minLength} 文字`,
        fix: `文字を入れる`,
      });
    }
    if (schema.maxLength != null && [...value].length > schema.maxLength) {
      out.push({
        rule: "schema/max-length",
        at,
        message: `${[...value].length} 文字。上限は ${schema.maxLength} 文字`,
        fix: `${[...value].length - schema.maxLength} 文字ぶん削る`,
      });
    }
  }
  if (typeOf(value) === "array") {
    if (schema.minItems != null && value.length < schema.minItems) {
      out.push({
        rule: "schema/min-items",
        at,
        message: `${value.length} 個。下限は ${schema.minItems} 個`,
        fix:
          schema.minItems - value.length === 1
            ? "あと1つ足す"
            : `あと ${schema.minItems - value.length} つ足す`,
      });
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      out.push({
        rule: "schema/max-items",
        at,
        message: `${value.length} 個。上限は ${schema.maxItems} 個`,
        fix: `${value.length - schema.maxItems} つ減らす`,
      });
    }
    if (schema.items)
      value.forEach((v, i) => {
        checkSchema(v, schema.items, `${at}/${i}`, out);
      });
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        out.push({
          rule: "schema/required",
          at,
          message: `"${key}" が無い`,
          fix: `"${key}" を足す`,
        });
      }
    }
    if (schema.additionalProperties === false) {
      const known = Object.keys(schema.properties ?? {});
      for (const key of Object.keys(value)) {
        if (!known.includes(key)) {
          out.push({
            rule: "schema/unknown",
            at: `${at}/${key}`,
            message: `"${key}" は知らないキー`,
            fix: `ここに書けるのは ${known.map((k) => `"${k}"`).join(" / ")}`,
          });
        }
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) checkSchema(value[key], sub, `${at}/${key}`, out);
    }
  }
};

/** 入力を検査する。診断が空なら通っている。 */
export const validate = (input) => {
  const out = [];
  checkSchema(input, SCHEMA, "", out);
  if (out.length) return out; // 形が壊れているうちは中身を見に行かない

  const nodes = [];
  input.flow.forEach((n, i) => {
    nodes.push({ ...n, at: `/flow/${i}`, leaf: false });
    (n.fork ?? []).forEach((c, j) => {
      nodes.push({ ...c, at: `/flow/${i}/fork/${j}`, leaf: true });
    });
  });

  const control = (text, at, what) => {
    const i = [...text].findIndex((c) => CONTROL.test(c));
    if (i < 0) return false;
    const cp = [...text][i].codePointAt(0).toString(16).padStart(4, "0");
    out.push({
      rule: "text/control",
      at,
      subject: text,
      message: `${i + 1} 文字目に制御文字 U+${cp.toUpperCase()} がある`,
      fix: `${what}は1行に収める。改行で分けたいことは figcaption の文へ回す`,
    });
    return true;
  };

  control(input.caption, "/caption", "caption");

  if (nodes.length > SPEC.maxNodes) {
    out.push({
      rule: "size/nodes",
      at: "/flow",
      message: `ノードが ${nodes.length} 個。上限は ${SPEC.maxNodes} 個`,
      fix: `${nodes.length - SPEC.maxNodes} つ減らすか、図を2枚に分ける`,
    });
  }

  for (const n of nodes) {
    const kind = n.kind ?? "step";
    if (n.label.trim() === "") {
      out.push({
        rule: "label/blank",
        at: `${n.at}/label`,
        subject: n.label,
        message: "空白だけのラベル",
        fix: "言葉を入れる。入れられないならその箱を消す",
      });
      continue;
    }
    if (control(n.label, `${n.at}/label`, "ラベル")) continue;
    if (kind === "branch" && n.leaf) {
      out.push({
        rule: "flow/leaf-branch",
        at: `${n.at}/kind`,
        subject: n.label,
        message: "枝の先は、そこからさらに分かれられない",
        fix: 'kind を "step" にするか、この枝を flow の段へ上げる',
      });
    }
    if (kind === "branch" && !n.leaf && !n.fork) {
      out.push({
        rule: "flow/lone-branch",
        at: `${n.at}/kind`,
        subject: n.label,
        message: "六角形は分かれ目の形。fork が無い",
        fix: 'fork を足すか、kind を "step" にする',
      });
    }
    const cap = KINDS[kind].cap;
    const w = widthOf(n.label);
    if (w > cap + 1e-9) {
      const kept = trimTo(n.label, cap);
      out.push({
        rule: "label/width",
        at: `${n.at}/label`,
        subject: n.label,
        message: `${w.toFixed(1)} 字幅(${toPx(w).toFixed(1)}px)。${kind}(${KINDS[kind].shape})の上限は ${cap} 字幅(${toPx(cap).toFixed(1)}px)`,
        fix: `あと ${(w - cap).toFixed(1)} 字幅(${(toPx(w) - toPx(cap)).toFixed(1)}px)短くする。${cap} 字幅なら「${kept}」まで`,
      });
    }
  }
  return out;
};

export const formatDiagnostics = (list) =>
  list
    .map((d) => {
      const head = `[${d.rule}] ${d.at || "/"}${d.subject ? ` 「${openControls(d.subject)}」` : ""} ${d.message}`;
      return `${head}\n    直し方: ${d.fix}`;
    })
    .join("\n");

/* ---------- 版付け ---------- */

const bandsOf = (input) => {
  const out = [];
  for (const n of input.flow) {
    out.push([{ label: n.label, kind: n.kind ?? "step" }]);
    if (n.fork)
      out.push(n.fork.map((c) => ({ label: c.label, kind: c.kind ?? "step" })));
  }
  return out;
};

const layout = (bands) => {
  const { boxW, boxH, gapH, gapV } = SPEC;
  const rowW = (n) => n * boxW + (n - 1) * gapH;
  const cw = Math.max(...bands.map((b) => rowW(b.length)));
  const laid = bands.map((band, r) => {
    const x0 = (cw - rowW(band.length)) / 2;
    return band.map((n, i) => ({
      ...n,
      x: x0 + i * (boxW + gapH),
      y: r * (boxH + gapV),
    }));
  });
  return { laid, cw, ch: bands.length * boxH + (bands.length - 1) * gapV };
};

/* ---------- 形 ---------- */

const { boxW: W, boxH: H, hexPoint: P, cylinderRy: RY, arrow: AH } = SPEC;

const SHAPES = {
  step: (x, y) => [
    `<rect class="ds-node" x="${x}" y="${y}" width="${W}" height="${H}"/>`,
  ],
  outside: (x, y) => [
    `<rect class="ds-node ds-node--outside" x="${x}" y="${y}" width="${W}" height="${H}"/>`,
  ],
  branch: (x, y) => {
    const p = [
      [x + P, y],
      [x + W - P, y],
      [x + W, y + H / 2],
      [x + W - P, y + H],
      [x + P, y + H],
      [x, y + H / 2],
    ];
    return [
      `<polygon class="ds-node" points="${p.map(([a, b]) => `${a},${b}`).join(" ")}"/>`,
    ];
  },
  store: (x, y) => {
    const rx = W / 2;
    return [
      `<path class="ds-node" d="M${x} ${y + RY} a${rx} ${RY} 0 0 1 ${W} 0 v${H - 2 * RY} a${rx} ${RY} 0 0 1 ${-W} 0 z"/>`,
      `<path class="ds-node" d="M${x} ${y + RY} a${rx} ${RY} 0 0 0 ${W} 0"/>`,
    ];
  },
};

/* 円筒は上の楕円ぶん重心が下がるので、文字を 3px 下げて光学的に中心へ置く。 */
const TEXT_DY = { step: 0, branch: 0, outside: 0, store: 3 };

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const arrowDown = (x, y) =>
  `<polygon class="ds-arrow" points="${x - 4},${y - AH} ${x + 4},${y - AH} ${x},${y}"/>`;
const vline = (x, y1, y2) =>
  `<line class="ds-link" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`;
const hline = (x1, x2, y) =>
  `<line class="ds-link" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;

const links = (laid) => {
  const out = [];
  for (let r = 0; r < laid.length - 1; r++) {
    const from = laid[r],
      to = laid[r + 1];
    const bus = from[0].y + H + SPEC.gapV / 2;
    const cx = (n) => n.x + W / 2;
    if (from.length === 1 && to.length === 1) {
      out.push(
        vline(cx(from[0]), from[0].y + H, to[0].y - AH),
        arrowDown(cx(from[0]), to[0].y),
      );
    } else if (from.length === 1) {
      out.push(vline(cx(from[0]), from[0].y + H, bus));
      out.push(hline(cx(to[0]), cx(to.at(-1)), bus));
      for (const n of to)
        out.push(vline(cx(n), bus, n.y - AH), arrowDown(cx(n), n.y));
    } else {
      out.push(hline(cx(from[0]), cx(from.at(-1)), bus));
      for (const n of from) out.push(vline(cx(n), n.y + H, bus));
      out.push(
        vline(cx(to[0]), bus, to[0].y - AH),
        arrowDown(cx(to[0]), to[0].y),
      );
    }
  }
  return out;
};

/** 図の関係を文にする。読み上げと、図を見られない場での代わりになる。lang は ja か en。 */
const DESCRIBE = {
  ja: {
    q: (n) => `「${n.label}」`,
    join: (list) => list.join(""),
    straight: (from, to) => `${from}から${to}へ。`,
    split: (from, to, count) => `${from}から${to}の${count}つへ分かれる。`,
    merge: (from, to) => `${from}から${to}へ合流する。`,
    single: (only) => `${only}だけの図。`,
    lead: (parts) => `上から下へ流れる図。${parts.join("")}`,
  },
  en: {
    q: (n) => `"${n.label}"`,
    join: (list) => list.join(", "),
    straight: (from, to) => `From ${from} to ${to}.`,
    split: (from, to, count) => `${from} splits into ${count}: ${to}.`,
    merge: (from, to) => `${from} merge into ${to}.`,
    single: (only) => `A diagram with only ${only}.`,
    lead: (parts) => `A flow diagram from top to bottom. ${parts.join(" ")}`,
  },
};

export const describe = (bands, lang = "ja") => {
  const t = DESCRIBE[lang] ?? DESCRIBE.ja;
  const parts = [];
  for (let r = 0; r < bands.length - 1; r++) {
    const from = bands[r],
      to = bands[r + 1];
    if (from.length === 1 && to.length === 1)
      parts.push(t.straight(t.q(from[0]), t.q(to[0])));
    else if (from.length === 1)
      parts.push(t.split(t.q(from[0]), t.join(to.map(t.q)), to.length));
    else parts.push(t.merge(t.join(from.map(t.q)), t.q(to[0])));
  }
  if (parts.length === 0) parts.push(t.single(t.q(bands[0][0])));
  return t.lead(parts);
};

export const render = (input, lang = "ja") => {
  const bands = bandsOf(input);
  const { laid, cw, ch } = layout(bands);
  const body = links(laid);
  for (const band of laid) {
    for (const n of band) {
      body.push(...SHAPES[n.kind](n.x, n.y));
      const y = n.y + H / 2 + 5 + TEXT_DY[n.kind];
      body.push(
        `<text x="${n.x + W / 2}" y="${y}" text-anchor="middle">${esc(n.label)}</text>`,
      );
    }
  }
  const aria = describe(bands, lang);
  /* 線は太さ1で中心に乗るので、四辺で半分が切れないように 1px ぶん外へ広げる。 */
  const svg = [
    `<svg width="${cw + 2}" height="${ch + 2}" viewBox="-1 -1 ${cw + 2} ${ch + 2}" role="img" aria-label="${esc(aria)}">`,
    ...body.map((s) => `  ${s}`),
    `</svg>`,
  ].join("\n");
  return {
    svg,
    aria,
    width: cw + 2,
    height: ch + 2,
    nodes: bands.flat().length,
  };
};

const STAMP =
  "<!-- ai-handout-studio 図の生成器の出力。手で直さず、入力の JSON を直して作り直す。 -->";

/** 文書へ貼り込む断片。.ds-figure ごと出すので、そのまま本文へ置ける。 */
export const snippet = (input, lang = "ja") => {
  const { svg } = render(input, lang);
  return [
    STAMP,
    `<figure class="ds-figure">`,
    `  <div class="ds-figure-frame">`,
    ...svg.split("\n").map((s) => `    ${s}`),
    `  </div>`,
    `  <figcaption>${esc(input.caption)}</figcaption>`,
    `</figure>`,
  ].join("\n");
};

/*
 * CSS の置き場。dist/figure/ と質問票の同梱先では1つ上、design/figure/ では ../dist/ に tokens がある。
 * 見つかった最初の場所から tokens と document.css を読む。
 */
const CSS_DIRS = ["../", "../dist/"];

const readCss = (tokens) => {
  const dir = CSS_DIRS.map((d) => new URL(d, import.meta.url)).find(
    (url) =>
      existsSync(new URL(tokens, url)) &&
      existsSync(new URL("document.css", url)),
  );
  if (!dir)
    throw new Error(
      `${tokens} と document.css が見つからない。pnpm design:build で作る`,
    );
  return [tokens, "document.css"]
    .map((name) => readFileSync(new URL(name, dir), "utf8").trimEnd())
    .join("\n");
};

/** 単体で開ける HTML。tokens と document.css を埋め込むので1ファイルで完結する。tokens はテーマの CSS のファイル名。 */
export const page = (input, { tokens = "tokens.default.css" } = {}) =>
  pageHtml(input, readCss(tokens));

/** 単体で開ける HTML を、渡した CSS で作る。build が生成中の CSS で見本を作るときに使う。 */
export const pageHtml = (input, css) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${esc(input.caption)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div class="ds-page">
  <div class="ds-main">
${snippet(input)
  .split("\n")
  .map((s) => `    ${s}`)
  .join("\n")}
  </div>
</div>
</body>
</html>
`;
