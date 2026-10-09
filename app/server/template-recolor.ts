import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ContrastCheck, checkContrast } from "../src/design/contrast.ts";
import { contrastRatio, mergeTokens } from "../src/design/theme.ts";
import {
  isTemplateName,
  labelOfTemplateName,
  type Surface,
  surfaceNames,
  type Template,
  type Tokens,
  templateSchemas,
} from "../src/schema/design.ts";
import {
  readDesignBase,
  readTemplate,
  SAMPLE_LANGS,
  samplePath,
  templateAssetNames,
  templateAssetsDir,
  templateDir,
  templatePath,
  templateStylePath,
} from "./design.ts";
import { writeJsonAtomic } from "./workspace.ts";

// template recolor。主色を青の段で持つテンプレート(Cobalt)を写し、青の N 段を別の色相の N 段に替えた
// テンプレートを区分ごとに作る。フォーカス・成功や警告の色・灰の段は青の段ではないので残る。
// 色の段は NOTICE の部品集(HTML 版 v20260909 の global.css)の値。13段(50・100〜1200)を薄い順に並べる

const BLUE = [
  "#e8f1fe",
  "#d9e6ff",
  "#c5d7fb",
  "#9db7f9",
  "#7096f8",
  "#4979f5",
  "#3460fb",
  "#264af4",
  "#0031d8",
  "#0017c1",
  "#00118f",
  "#000071",
  "#000060",
] as const;

// 選べる色相。部品集の主色の候補のうち、元の青と、段の対応では作れない白黒(ニュートラル)を除いたもの
export const KEY_HUES = {
  lightblue: {
    label: "ライトブルー",
    steps: [
      "#f0f9ff",
      "#dcf0ff",
      "#c0e4ff",
      "#97d3ff",
      "#57b8ff",
      "#39abff",
      "#008bf2",
      "#0877d7",
      "#0066be",
      "#0055ad",
      "#00428c",
      "#00316a",
      "#00234b",
    ],
  },
  cyan: {
    label: "シアン",
    steps: [
      "#e9f7f9",
      "#c8f8ff",
      "#99f2ff",
      "#79e2f2",
      "#2bc8e4",
      "#01b7d6",
      "#00a3bf",
      "#008da6",
      "#008299",
      "#006f83",
      "#006173",
      "#004c59",
      "#003741",
    ],
  },
  green: {
    label: "緑",
    steps: [
      "#e6f5ec",
      "#c2e5d1",
      "#9bd4b5",
      "#71c598",
      "#51b883",
      "#2cac6e",
      "#259d63",
      "#1d8b56",
      "#197a4b",
      "#115a36",
      "#0c472a",
      "#08351f",
      "#032213",
    ],
  },
  orange: {
    label: "オレンジ",
    steps: [
      "#ffeee2",
      "#ffdfca",
      "#ffc199",
      "#ffa66d",
      "#ff8d44",
      "#ff7628",
      "#fb5b01",
      "#e25100",
      "#c74700",
      "#ac3e00",
      "#8b3200",
      "#6d2700",
      "#541e00",
    ],
  },
  purple: {
    label: "紫",
    steps: [
      "#f1eafa",
      "#ecddff",
      "#ddc2ff",
      "#cda6ff",
      "#bb87ff",
      "#a565f8",
      "#8843e1",
      "#6f23d0",
      "#5c10be",
      "#5109ad",
      "#41048e",
      "#30016c",
      "#21004b",
    ],
  },
} as const satisfies Record<
  string,
  { label: string; steps: readonly string[] & { length: 13 } }
>;

export type KeyHue = keyof typeof KEY_HUES;

export const KEY_HUE_NAMES = Object.keys(KEY_HUES) as KeyHue[];

export const isKeyHue = (name: string): name is KeyHue =>
  Object.hasOwn(KEY_HUES, name);

const STEP_NAMES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "1000",
  "1100",
  "1200",
] as const;

const stepIndex = (steps: readonly string[], hex: string): number =>
  steps.indexOf(hex.toLowerCase());

// 差し色(カード・数値・注意の帯の地)。主色と同じ色相になったときだけ、青の同じ段へ回して主色と分ける
const ACCENT_KEYS = new Set(["accent2", "accent3"]);

type ColorTokens = Partial<Tokens["color"]>;

// 替えた色が、どの色相の何段にいるか。明暗差が足りないとき、同じ色相の中で段を動かす
type Spot = { steps: readonly string[]; index: number };

export type Placed = Readonly<Record<string, Spot>>;

const colorsOf = (placed: Placed): Record<string, string> =>
  Object.fromEntries(
    Object.entries(placed).map(([key, { steps, index }]) => [
      key,
      steps[index] ?? "",
    ]),
  );

// 色の差分のうち、青の段の色を選んだ色相の同じ段に置く。青の段でない色(灰・黄・成功や警告)は置かない
export const placeColors = (color: ColorTokens, hue: KeyHue): Placed => {
  const steps: readonly string[] = KEY_HUES[hue].steps;
  return Object.fromEntries(
    Object.entries(color).flatMap(([key, value]): [string, Spot][] => {
      if (value === undefined) return [];
      const accent = ACCENT_KEYS.has(key) ? stepIndex(steps, value) : -1;
      if (accent >= 0) return [[key, { steps: BLUE, index: accent }]];
      const index = stepIndex(BLUE, value);
      return index >= 0 ? [[key, { steps, index }]] : [];
    }),
  );
};

export const recolorColors = (
  color: ColorTokens,
  placed: Placed,
): ColorTokens => ({ ...color, ...colorsOf(placed) });

// 明るいほど白との明暗差が小さい
const lighter = (a: string, b: string): boolean =>
  contrastRatio(a, "#ffffff") < contrastRatio(b, "#ffffff");

// 足りない組の、置いた側の色を相手から離す向きに1段動かす。地を先に動かし、主色(字の側)はなるべく残す
const moveApart = (
  placed: Placed,
  color: Tokens["color"],
  { foreground, background }: ContrastCheck,
): [string, Spot][] =>
  [
    [background, foreground],
    [foreground, background],
  ]
    .flatMap(([own, other]) => {
      const spot = own === undefined ? undefined : placed[own];
      const otherColor = other === undefined ? undefined : color[other];
      if (!spot || otherColor === undefined || own === undefined) return [];
      const index = lighter(spot.steps[spot.index] ?? "", otherColor)
        ? spot.index - 1
        : spot.index + 1;
      return index >= 0 && index < spot.steps.length
        ? [[own, { ...spot, index }] as [string, Spot]]
        : [];
    })
    .slice(0, 1);

// 明暗差が足りなければ、規定を下回らない段まで動かす(元の段から離れるのは足りないときだけ)
export const settleContrast = (
  placed: Placed,
  resolve: (placed: Placed) => Tokens["color"],
  strictContrast: boolean | undefined,
  rounds: number = STEP_NAMES.length,
):
  | { success: true; placed: Placed }
  | { success: false; low: ContrastCheck[] } => {
  const color = resolve(placed);
  const low = checkContrast(color, { strictContrast }).filter(
    (check) => !check.ok,
  );
  if (low.length === 0) return { success: true, placed };
  const moves = low.flatMap((check) => moveApart(placed, color, check));
  if (moves.length === 0 || rounds === 0) return { success: false, low };
  return settleContrast(
    { ...placed, ...Object.fromEntries(moves) },
    resolve,
    strictContrast,
    rounds - 1,
  );
};

// 同梱の絵(SVG)の色を替える。青の段だけを替え、差し色や灰の段は残す
export const recolorSvg = (svg: string, hue: KeyHue): string =>
  svg.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const index = stepIndex(BLUE, hex);
    return index >= 0 ? (KEY_HUES[hue].steps[index] ?? hex) : hex;
  });

export const recolorDescription = (sourceLabel: string, hue: KeyHue): string =>
  `${sourceLabel} の主色の青を${KEY_HUES[hue].label}に替えたもの。フォーカス・成功や警告の色・作りは ${sourceLabel} のまま`;

export type RecolorResult =
  | {
      success: true;
      surfaces: Surface[];
      primary: { from: string; to: string } | undefined;
      // 明暗差のために同じ段から動かした色(例: lavender 100 → 50)
      moved: string[];
    }
  | { success: false; message: string };

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const formatContrast = (surface: Surface, checks: ContrastCheck[]): string =>
  checks
    .map(
      (check) =>
        `${surface}: ${check.foreground} と ${check.background} の明暗差 ${check.ratio.toFixed(2)}(${check.min} 以上が要る)`,
    )
    .join("\n");

// 段を動かした色。最初に置いた段と比べる
const movedSteps = (first: Placed, last: Placed): string[] =>
  Object.entries(last).flatMap(([key, { index }]) => {
    const start = first[key]?.index;
    return start === undefined || start === index
      ? []
      : [`${key} ${STEP_NAMES[start]} → ${STEP_NAMES[index]}`];
  });

type Planned = {
  surface: Surface;
  template: Template;
  primary: { from: string; to: string } | undefined;
  replaced: number;
  moved: string[];
};

type Planning =
  | { success: true; planned: Planned }
  | { success: false; message: string };

// 1区分の新しい template.json を組み、明暗差を確かめる。ファイルはまだ書かない
const planSurface = (
  surface: Surface,
  source: Template,
  base: Tokens,
  name: string,
  hue: KeyHue,
): Planning => {
  const color = source.tokens?.color ?? {};
  const first = placeColors(color, hue);
  const withColor = (placed: Placed): Template => ({
    ...source,
    label: labelOfTemplateName(name),
    description: recolorDescription(source.label, hue),
    tokens: { ...source.tokens, color: recolorColors(color, placed) },
  });
  const settled = settleContrast(
    first,
    (placed) => mergeTokens(base, withColor(placed).tokens).color,
    source.checks?.strictContrast,
  );
  if (!settled.success) {
    return {
      success: false,
      message: [
        `${KEY_HUES[hue].label}では明暗差が足りない`,
        formatContrast(surface, settled.low),
      ].join("\n"),
    };
  }
  const template = withColor(settled.placed);
  const parsed = templateSchemas[surface].safeParse(template);
  if (!parsed.success) {
    return { success: false, message: `${surface}: ${parsed.error.message}` };
  }
  const primary = color.primary;
  const nextPrimary = template.tokens?.color?.primary;
  return {
    success: true,
    planned: {
      surface,
      template,
      primary:
        primary && nextPrimary && primary !== nextPrimary
          ? { from: primary, to: nextPrimary }
          : undefined,
      replaced: Object.keys(first).length,
      moved: movedSteps(first, settled.placed),
    },
  };
};

// 区分ごとに組む。どれかが通らなければ何も書かない
const plan = async (
  designDir: string,
  from: string,
  name: string,
  hue: KeyHue,
): Promise<
  { success: true; planned: Planned[] } | { success: false; message: string }
> => {
  const base = await readDesignBase(designDir);
  if (!base.success) return base;
  const present = await Promise.all(
    surfaceNames.map(async (surface) =>
      (await exists(templatePath(designDir, surface, from))) ? [surface] : [],
    ),
  );
  const surfaces = present.flat();
  if (surfaces.length === 0) {
    return { success: false, message: `テンプレートが見つからない: ${from}` };
  }
  const read = await Promise.all(
    surfaces.map(async (surface) => ({
      surface,
      result: await readTemplate(designDir, surface, from),
    })),
  );
  const failed = read.find(({ result }) => !result.success);
  if (failed && !failed.result.success) return failed.result;
  const planned = read.flatMap(({ surface, result }): Planning[] =>
    result.success
      ? [planSurface(surface, result.value, base.base.tokens, name, hue)]
      : [],
  );
  const problems = planned.flatMap((entry) =>
    entry.success ? [] : [entry.message],
  );
  if (problems.length > 0) {
    return { success: false, message: problems.join("\n") };
  }
  const ready = planned.flatMap((entry) =>
    entry.success ? [entry.planned] : [],
  );
  if (ready.every((entry) => entry.replaced === 0)) {
    return {
      success: false,
      message: `${from} は主色を青の段で持たないので替えられない(cobalt から作る)`,
    };
  }
  return { success: true, planned: ready };
};

// 見本・専用の CSS・同梱の絵を写す。絵だけは色を替えて書く
const copyExtras = async (
  designDir: string,
  surface: Surface,
  from: string,
  name: string,
  hue: KeyHue,
): Promise<void> => {
  await Promise.all(
    (["ja", ...SAMPLE_LANGS] as const).map(async (lang) => {
      const source = samplePath(designDir, surface, from, lang);
      if (await exists(source)) {
        await copyFile(source, samplePath(designDir, surface, name, lang));
      }
    }),
  );
  const style = templateStylePath(designDir, surface, from);
  if (await exists(style)) {
    await copyFile(style, templateStylePath(designDir, surface, name));
  }
  const assets =
    surface === "slide" ? await templateAssetNames(designDir, from) : [];
  if (assets.length === 0) return;
  await mkdir(templateAssetsDir(designDir, name), { recursive: true });
  await Promise.all(
    assets.map(async (file) =>
      writeFile(
        join(templateAssetsDir(designDir, name), file),
        recolorSvg(
          await readFile(
            join(templateAssetsDir(designDir, from), file),
            "utf8",
          ),
          hue,
        ),
      ),
    ),
  );
};

export const recolorTemplate = async ({
  designDir,
  from,
  name,
  hue,
}: {
  designDir: string;
  from: string;
  name: string;
  hue: KeyHue;
}): Promise<RecolorResult> => {
  if (!isTemplateName(name)) {
    return {
      success: false,
      message: `名前は英小文字で始め、英小文字・数字・ハイフンにする: ${name}`,
    };
  }
  if (!isTemplateName(from)) {
    return { success: false, message: `元の名前が正しくない: ${from}` };
  }
  // 中身の構成(sample.json だけのフォルダ)も同じ場所にあるので、template.json の有無でなくフォルダで見る
  const taken = (
    await Promise.all(
      surfaceNames.map(async (surface) =>
        (await exists(templateDir(designDir, surface, name))) ? [surface] : [],
      ),
    )
  ).flat();
  if (taken.length > 0) {
    return {
      success: false,
      message: `同じ名前のテンプレートか構成が既にある: ${taken.map((surface) => `${surface}/${name}`).join("・")}`,
    };
  }
  const planned = await plan(designDir, from, name, hue);
  if (!planned.success) return planned;
  await Promise.all(
    planned.planned.map(async ({ surface, template }) => {
      await mkdir(templateDir(designDir, surface, name), { recursive: true });
      await writeJsonAtomic(templatePath(designDir, surface, name), template);
      await copyExtras(designDir, surface, from, name, hue);
    }),
  );
  return {
    success: true,
    surfaces: planned.planned.map(({ surface }) => surface),
    primary: planned.planned.find((entry) => entry.primary)?.primary,
    // 区分ごとに同じ段を動かすことが多いので、まとめて1度だけ出す
    moved: [...new Set(planned.planned.flatMap(({ moved }) => moved))],
  };
};
