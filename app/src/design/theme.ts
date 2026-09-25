import {
  type Components,
  type Surface,
  TEXT_SCALE,
  type Template,
  type ThemeComponents,
  type ThemeTokens,
  type Tokens,
} from "../schema/design.ts";
import { layoutVariables } from "./layout.ts";

// テンプレートを CSS 変数へ解く。build(生成 CSS)と画面(スライドと編集中の見本)が同じ関数を使う。
// 解く順は tokens.json → テンプレートの差分。区分をまたぐ共通の値は無い

export type CssVariable = readonly [name: string, value: string];

export type ResolvedComponent = {
  name: string;
  variant: string;
  // パラメータ名 → 選んだ選択肢。書かなかったものは既定で埋める
  params: Record<string, string>;
  vars: CssVariable[];
};

// 解いた値(tokens と部品)。テンプレートにも、アプリの画面の既定にも使う。
// tokens.size は字の大きさの倍率(textScale)を掛けた後の値。textScale は --text-scale にだけ使う
export type ResolvedSurface = {
  tokens: Tokens;
  components: ResolvedComponent[];
  textScale?: number;
};

export type ResolvedTemplate = ResolvedSurface & {
  surface: Surface;
  name: string;
  label: string;
  // 骨格の変数(layout.ts)。スライドは空
  layout: CssVariable[];
};

export type ResolveResult =
  | { success: true; template: ResolvedTemplate }
  | { success: false; message: string };

const kebab = (key: string): string =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export const mergeTokens = (base: Tokens, diff: ThemeTokens = {}): Tokens => ({
  color: { ...base.color, ...diff.color },
  font: { ...base.font, ...diff.font },
  size: { ...base.size, ...diff.size },
  lineHeight: { ...base.lineHeight, ...diff.lineHeight },
  space: { ...base.space, ...diff.space },
  radius: { ...base.radius, ...diff.radius },
  shadow: { ...base.shadow, ...diff.shadow },
  letterSpacing: { ...base.letterSpacing, ...diff.letterSpacing },
  fontWeight: { ...base.fontWeight, ...diff.fontWeight },
});

// 字の大きさを倍率で替えた値。端数は 0.1px で丸める。倍率は百分率の整数にしてから掛け、
// 0.05 刻みの小数の誤差で丸めがずれないようにする
export const scaledPx = (value: number, scale: number): number =>
  Math.round((value * Math.round(scale * 100)) / 10) / 10;

// すべての字の大きさ(size.*)に同じ倍率を掛ける。行の高さ・余白・角丸は替えない。
// 倍率を掛けるのはここだけで、テンプレートを解く resolveTemplate がトークンを重ねたあとに呼ぶ
export const scaleSizes = (tokens: Tokens, scale = 1): Tokens =>
  scale === 1
    ? tokens
    : {
        ...tokens,
        size: Object.fromEntries(
          Object.entries(tokens.size).map(([key, value]) => [
            key,
            value === undefined ? undefined : scaledPx(value, scale),
          ]),
        ) as Tokens["size"],
      };

// 倍率の刻み(80%〜130%)。スライダーと同じ並び
export const TEXT_SCALE_STEPS: readonly number[] = Array.from(
  {
    length: Math.round((TEXT_SCALE.max - TEXT_SCALE.min) / TEXT_SCALE.step) + 1,
  },
  (_, index) =>
    Math.round(TEXT_SCALE.min * 100 + index * TEXT_SCALE.step * 100) / 100,
);

// スライダーの下限。検査の最小の字(checks.minFontSize)を持つテンプレートは、いちばん小さい字が
// それを割らない倍率まで。今の大きさ(100%)ですでに割る・ちょうどのときは 100% より下げない。
// tokens は倍率を掛ける前の値(トークンを重ねたところ)
export const minTextScale = (tokens: Tokens, minFontSize?: number): number => {
  if (minFontSize === undefined) return TEXT_SCALE.min;
  const smallest = Math.min(
    ...Object.values(tokens.size).filter(
      (value): value is number => value !== undefined,
    ),
  );
  return (
    TEXT_SCALE_STEPS.filter((scale) => scale <= 1).find(
      (scale) => scaledPx(smallest, scale) >= minFontSize,
    ) ?? 1
  );
};

// 部品の選択を重ねる。変種は上が決め、パラメータは書いたものだけ替える(段 I より前のテーマの移行が使う)
export const mergeComponents = (
  common: ThemeComponents,
  surface: ThemeComponents = {},
): ThemeComponents =>
  Object.fromEntries(
    [...new Set([...Object.keys(common), ...Object.keys(surface)])].flatMap(
      (component) => {
        const base = common[component];
        const override = surface[component];
        const variant = override?.variant ?? base?.variant;
        if (!variant) return [];
        const params = { ...base?.params, ...override?.params };
        return [
          [
            component,
            Object.keys(params).length > 0 ? { variant, params } : { variant },
          ],
        ];
      },
    ),
  );

const toVariables = (vars: Record<string, string>): CssVariable[] =>
  Object.entries(vars).map(([key, value]) => [`--${key}`, value] as const);

// 選択が components.json に無い部品・変種・パラメータを指していないか
const unknownChoice = (
  choices: ThemeComponents,
  components: Components,
): string | undefined =>
  Object.entries(choices).flatMap(([component, choice]) => {
    const entry = components[component];
    if (!entry?.variants[choice.variant]) {
      return [`部品 ${component} の変種 ${choice.variant}`];
    }
    return Object.entries(choice.params ?? {})
      .filter(([param, option]) => !entry.params?.[param]?.options[option])
      .map(
        ([param, option]) =>
          `部品 ${component} のパラメータ ${param}=${option}`,
      );
  })[0];

const resolveComponents = (
  choices: ThemeComponents,
  components: Components,
): ResolvedComponent[] =>
  Object.entries(components).map(([component, entry]) => {
    const choice = choices[component];
    const variant = choice?.variant ?? entry.default;
    const params = Object.fromEntries(
      Object.entries(entry.params ?? {}).map(([param, definition]) => [
        param,
        choice?.params?.[param] ?? definition.default,
      ]),
    );
    return {
      name: component,
      variant,
      params,
      vars: [
        ...toVariables(entry.variants[variant]?.vars ?? {}),
        ...Object.entries(params).flatMap(([param, option]) =>
          toVariables(entry.params?.[param]?.options[option]?.vars ?? {}),
        ),
      ],
    };
  });

// テーマを当てない値。アプリの画面(dist/app.css)が使う
export const resolveBase = (
  tokens: Tokens,
  components: Components,
): ResolvedSurface => ({
  tokens,
  components: resolveComponents({}, components),
});

export const resolveTemplate = (
  surface: Surface,
  name: string,
  template: Template,
  tokens: Tokens,
  components: Components,
): ResolveResult => {
  const unknown = unknownChoice(template.components, components);
  if (unknown) {
    return {
      success: false,
      message: `テンプレート ${surface}/${name}: ${unknown} は components.json に無い`,
    };
  }
  return {
    success: true,
    template: {
      surface,
      name,
      label: template.label,
      tokens: scaleSizes(
        mergeTokens(tokens, template.tokens),
        template.textScale,
      ),
      components: resolveComponents(template.components, components),
      ...(template.textScale !== undefined && template.textScale !== 1
        ? { textScale: template.textScale }
        : {}),
      layout:
        surface !== "slide" && template.layout
          ? layoutVariables(surface, template.layout)
          : [],
    },
  };
};

const fontStack = (families: readonly string[]): string =>
  families
    .map((family) =>
      /^[a-z-]+$|^var\(--[a-z-]+\)$/.test(family)
        ? family
        : `"${family.replace(/"/g, "")}"`,
    )
    .join(", ");

const groupVariables = <T extends Record<string, string | number | undefined>>(
  prefix: string,
  group: T,
  format: (value: NonNullable<T[keyof T]>) => string,
): CssVariable[] =>
  Object.entries(group)
    .filter(
      (entry): entry is [string, NonNullable<T[keyof T]>] =>
        entry[1] !== undefined,
    )
    .map(([key, value]) => [
      key === "base" ? `--${prefix}` : `--${prefix}-${kebab(key)}`,
      format(value),
    ]);

const pxValue = (value: number): string => `${value}px`;

// 字の大きさの倍率そのもの。--fs-* はすでに掛けた値なので、--fs-* を読む所は使わない。
// 変数を持たない字(印刷の本文の 11pt)は calc(11pt * var(--text-scale, 1)) で読む。
// 図(document.css の .ds-figure-frame svg)は箱の寸法が字の大きさに合わせてあるので、SVG ごと zoom で掛ける。
// 1 のときは書かない(今の生成物を変えない)
const scaleVariables = (textScale = 1): CssVariable[] =>
  textScale === 1 ? [] : [["--text-scale", String(textScale)]];

export const tokenVariables = (
  tokens: Tokens,
  textScale?: number,
): CssVariable[] => [
  ...groupVariables("color", tokens.color, String),
  ...Object.entries(tokens.font).map(
    ([key, families]) => [`--font-${kebab(key)}`, fontStack(families)] as const,
  ),
  ...groupVariables("fs", tokens.size, pxValue),
  ...scaleVariables(textScale),
  ...groupVariables("lh", tokens.lineHeight, String),
  ...groupVariables("ls", tokens.letterSpacing, String),
  ...groupVariables("fw", tokens.fontWeight, String),
  ...groupVariables("space", tokens.space, pxValue),
  ...groupVariables("radius", tokens.radius, pxValue),
  ...groupVariables("shadow", tokens.shadow, String),
];

export const templateVariables = (
  template: ResolvedTemplate,
): CssVariable[] => [
  ...tokenVariables(template.tokens, template.textScale),
  ...template.components.flatMap((component) => component.vars),
  ...template.layout,
];

const declarations = (variables: readonly CssVariable[]): string =>
  variables.map(([name, value]) => `  ${name}: ${value};`).join("\n");

export const GENERATED_NOTE =
  "生成物。design/ の JSON から pnpm design:build で作る。手で直さない";

const componentLabel = (component: ResolvedComponent): string =>
  `${component.name}(${[
    component.variant,
    ...Object.entries(component.params).map(
      ([param, option]) => `${param}=${option}`,
    ),
  ].join(", ")})`;

const rootCss = (
  title: string,
  resolved: ResolvedSurface,
  layout: readonly CssVariable[],
): string =>
  [
    `/* ${GENERATED_NOTE}(${title}) */`,
    ":root {",
    declarations(tokenVariables(resolved.tokens, resolved.textScale)),
    "",
    ...resolved.components.flatMap((component) => [
      `  /* 部品: ${componentLabel(component)} */`,
      declarations(component.vars),
    ]),
    ...(layout.length > 0 ? ["", "  /* 骨格 */", declarations(layout)] : []),
    "}",
    "",
  ].join("\n");

// 専用の CSS(template.css)を閉じ込める根。スライドは1画面に複数のテンプレートが並ぶので
// テンプレートの名前で閉じ込め、質問票と文書は1ファイルに1テンプレートなので :root に入れる。
// 入れ子にするので、読み込み順によらず部品の既定の規則(.ds-*)より強い
export const templateScope = (surface: Surface, name: string): string =>
  surface === "slide" ? `.ds-slide[data-template="${name}"]` : ":root";

export const templateOwnCss = (
  surface: Surface,
  name: string,
  own: string,
): string =>
  own.trim().length === 0
    ? ""
    : [
        `/* 専用の CSS(元: design/templates/${surface}/${name}/template.css) */`,
        `${templateScope(surface, name)} {`,
        ...own
          .trim()
          .split("\n")
          .map((line) => (line.length > 0 ? `  ${line}` : line)),
        "}",
        "",
      ].join("\n");

export const templateCss = (template: ResolvedTemplate, own = ""): string =>
  [
    rootCss(
      `テンプレート: ${template.name}、区分: ${template.surface}`,
      template,
      template.layout,
    ),
    templateOwnCss(template.surface, template.name, own),
  ]
    .filter((part) => part.length > 0)
    .join("\n");

// 専用の CSS に書けないもの。値は変数から引き、外のファイルは読まない。
// 質問票のスキルは CSS を <style> に埋めるので、</ も拒む
export const ownCssProblem = (own: string): string | undefined => {
  const code = own.replace(/\/\*[\s\S]*?\*\//g, "");
  const hex = code.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
  if (hex) return `色 ${hex} を直接書いている。var(--color-*) から引く`;
  if (/@import\b/.test(code)) return "@import は使えない";
  if (/url\(\s*["']?(https?:)?\/\//i.test(code))
    return "外のファイル(url(http…))は読めない";
  if (code.includes("</")) return "</ は書けない";
  return undefined;
};

// 文書の専用の CSS に書けないもの。目次は章の ol の中に節の ol が入れ子で入り、共通の document.css が
// 節を隠す(.ds-toc ol ol)。専用の CSS は :root の中に入って共通より強いので、.ds-toc ol に display を
// 書くと節の ol にも効き、隠したはずの節が目次に出る
const cssRules = (code: string): { selectors: string[]; body: string }[] =>
  [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selectors = "", body = ""]) => ({
      selectors: selectors.split(",").map((selector) => selector.trim()),
      body,
    }),
  );

export const documentOwnCssProblem = (own: string): string | undefined => {
  const code = own.replace(/\/\*[\s\S]*?\*\//g, "");
  const hit = cssRules(code).some(
    ({ selectors, body }) =>
      /(^|[;\s])display\s*:/.test(body) &&
      selectors.some((selector) => /\.ds-toc\s+ol$/.test(selector)),
  );
  return hit
    ? "目次の .ds-toc ol に display を書くと節の入れ子にも効き、節が目次に出る。章の並びは .ds-toc > ol、節は .ds-toc ol ol と書く"
    : undefined;
};

// アプリの画面の変数。テーマから切り離し、tokens.json と部品の既定だけで作る
export const appCss = (base: ResolvedSurface): string =>
  rootCss("アプリの画面。tokens.json の既定の値", base, []);

// 文字と地の明暗差(WCAG 2.x の相対輝度)
const channel = (value: number): number => {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) =>
    channel(Number.parseInt(hex.slice(start, start + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (foreground: string, background: string) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};
