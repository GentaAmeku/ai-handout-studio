import { z } from "zod";
import { slideSchema } from "./deck.ts";

// テンプレートの正本(design/)の形。テンプレートは区分ごとに、tokens の差分・部品の変種・骨格を持つ

export const themeNamePattern = /^[a-z][a-z0-9-]*$/;

export const themeName = z
  .string()
  .regex(themeNamePattern, "英小文字・数字・ハイフンの名前で指定する");

// 色は #RRGGBB か rgb()。明暗差の計算は #RRGGBB だけを見る
const color = z
  .string()
  .regex(
    /^(?:#[0-9a-fA-F]{6}|rgb\([0-9 ./]+\))$/,
    "色は #RRGGBB か rgb() で指定する",
  );
const px = z.number().nonnegative();

const colorTokens = z.strictObject({
  bg: color,
  text: color,
  muted: color,
  primary: color,
  // 差し色。意匠が primary と合わせて3色までまわす
  accent2: color,
  accent3: color,
  surface: color,
  tint: color,
  border: color,
  lavender: color,
  onPrimary: color,
  primaryStrong: color,
  chip: color,
  danger: color,
  dangerTint: color,
  success: color,
  successTint: color,
  warning: color,
  warningTint: color,
  backdrop: color,
  // 見出しの字。既定は text と同じ
  heading: color.optional(),
  // リンクの4色
  link: color.optional(),
  linkVisited: color.optional(),
  linkHover: color.optional(),
  linkActive: color.optional(),
  // フォーカスの2色。輪と、その外の輪・文字系の地
  focus: color.optional(),
  focusRing: color.optional(),
  // 強い罫(表の見出しの下の線)・引用の左の線
  rule: color.optional(),
  quote: color.optional(),
  // 枠線のボタンの hover の地・塗りのボタンを押した地
  primaryHoverTint: color.optional(),
  primaryPressed: color.optional(),
  // 注意の帯の飾り。枠は warning のまま
  warningAccent: color.optional(),
});

const fontStack = z.array(z.string().min(1)).min(1);

// sans は本文。display は見出し(既定は sans と同じ)。mono は文書と質問票のコード
const fontTokens = z.strictObject({
  sans: fontStack,
  display: fontStack,
  mono: fontStack,
});

const sizeTokens = z.strictObject({
  kicker: px,
  h1: px,
  h2: px,
  body: px,
  cover: px,
  cardTitle: px,
  kpi: px,
  small: px,
  pageTitle: px,
  ui: px,
  // 記入欄のラベル・文書の h3
  label: px.optional(),
  h3: px.optional(),
});

const lineHeightTokens = z.strictObject({
  body: z.number().positive(),
  heading: z.number().positive(),
  // 表示用の大きな字・詰めた段。既定は任意
  display: z.number().positive().optional(),
  dense: z.number().positive().optional(),
  // 文書の h2・h3。既定は任意
  subheading: z.number().positive().optional(),
});

// 字間。0・normal・em / px / rem の値
const letterSpacing = z
  .string()
  .regex(
    /^0$|^normal$|^-?(?:[0-9]*\.)?[0-9]+(?:em|px|rem)$/,
    "字間は 0・normal・em/px/rem の値で指定する",
  );

// どれも任意。既定は design/tokens.json が今の見た目と同じ値で埋める
const letterSpacingTokens = z.strictObject({
  body: letterSpacing.optional(),
  heading: letterSpacing.optional(),
  display: letterSpacing.optional(),
});

const fontWeight = z.number().int().min(1).max(1000);

const fontWeightTokens = z.strictObject({
  body: fontWeight.optional(),
  heading: fontWeight.optional(),
});

const spaceTokens = z.strictObject({
  slide: px,
  xs: px,
  sm: px,
  md: px,
  gap: px,
  card: px,
});

const radiusTokens = z.strictObject({ base: px, sm: px, card: px });

const shadowTokens = z.strictObject({
  card: z.string().min(1),
  dialog: z.string().min(1),
  canvas: z.string().min(1),
});

export const tokensSchema = z.strictObject({
  color: colorTokens,
  font: fontTokens,
  size: sizeTokens,
  lineHeight: lineHeightTokens,
  space: spaceTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  // 新しい区分は、丸ごと省いても既定の空で埋める
  letterSpacing: letterSpacingTokens.default({}),
  fontWeight: fontWeightTokens.default({}),
});

export type Tokens = z.infer<typeof tokensSchema>;

// テンプレートは tokens.json への差分だけを書く
export const themeTokensSchema = z.strictObject({
  color: colorTokens.partial().optional(),
  font: fontTokens.partial().optional(),
  size: sizeTokens.partial().optional(),
  lineHeight: lineHeightTokens.partial().optional(),
  space: spaceTokens.partial().optional(),
  radius: radiusTokens.partial().optional(),
  shadow: shadowTokens.partial().optional(),
  letterSpacing: letterSpacingTokens.partial().optional(),
  fontWeight: fontWeightTokens.partial().optional(),
});

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

const varName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "変数名は英小文字・数字・ハイフンにする");

// 変種とパラメータの選択肢は、どちらも CSS 変数の値で表す。
// 同じ部品の変種(同じパラメータの選択肢)は、どれも同じ変数をそろえる
const choiceSchema = z.strictObject({
  label: z.string().min(1),
  vars: z.record(varName, z.string().min(1)),
});

const varKeySets = (choices: Record<string, { vars: object }>) =>
  new Set(
    Object.values(choices).map((choice) =>
      Object.keys(choice.vars).sort().join(","),
    ),
  );

// 部品の少数のパラメータ(表の密度など)。変種とは別の変数を持つ
const paramSchema = z
  .strictObject({
    label: z.string().min(1),
    default: themeName,
    options: z.record(themeName, choiceSchema),
  })
  .superRefine((param, ctx) => {
    if (!(param.default in param.options)) {
      ctx.addIssue({
        code: "custom",
        message: `既定の選択肢 ${param.default} が options に無い`,
        path: ["default"],
      });
    }
    if (varKeySets(param.options).size > 1) {
      ctx.addIssue({
        code: "custom",
        message: "選択肢ごとの変数がそろっていない",
        path: ["options"],
      });
    }
  });

// 形の軸(表の外枠・カードの枠の辺など)。選択肢の組み合わせが変種の変数を1組作る。
// デザインページの「形の編集」は、軸ごとに選んで新しい変種を足す
const shapeAxisSchema = z
  .strictObject({
    label: z.string().min(1),
    options: z.record(themeName, choiceSchema),
  })
  .superRefine((axis, ctx) => {
    if (Object.keys(axis.options).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "選択肢が無い",
        path: ["options"],
      });
    }
    if (varKeySets(axis.options).size > 1) {
      ctx.addIssue({
        code: "custom",
        message: "選択肢ごとの変数がそろっていない",
        path: ["options"],
      });
    }
  });

export type ShapeAxis = z.infer<typeof shapeAxisSchema>;

const axisKeys = (axis: ShapeAxis): string[] =>
  Object.keys(Object.values(axis.options)[0]?.vars ?? {});

const componentSchema = z
  .strictObject({
    label: z.string().min(1),
    default: themeName,
    variants: z.record(themeName, choiceSchema),
    shape: z.record(themeName, shapeAxisSchema).optional(),
    params: z.record(themeName, paramSchema).optional(),
  })
  .superRefine((component, ctx) => {
    if (!(component.default in component.variants)) {
      ctx.addIssue({
        code: "custom",
        message: `既定の変種 ${component.default} が variants に無い`,
        path: ["default"],
      });
    }
    if (varKeySets(component.variants).size > 1) {
      ctx.addIssue({
        code: "custom",
        message: "変種ごとの変数がそろっていない",
        path: ["variants"],
      });
    }
    const variantVars = new Set(
      Object.values(component.variants).flatMap((variant) =>
        Object.keys(variant.vars),
      ),
    );
    const overlap = Object.entries(component.params ?? {}).find(([, param]) =>
      Object.values(param.options).some((option) =>
        Object.keys(option.vars).some((key) => variantVars.has(key)),
      ),
    );
    if (overlap) {
      ctx.addIssue({
        code: "custom",
        message: `パラメータ ${overlap[0]} の変数が変種の変数と重なっている`,
        path: ["params", overlap[0]],
      });
    }
    // 形の軸は、変種の変数をちょうど1回ずつ受け持つ
    if (component.shape) {
      const covered = Object.values(component.shape).flatMap(axisKeys);
      const twice = covered.find(
        (key, index) => covered.indexOf(key) !== index,
      );
      if (twice) {
        ctx.addIssue({
          code: "custom",
          message: `変数 ${twice} を2つの形の軸が受け持っている`,
          path: ["shape"],
        });
      }
      const missing = [...variantVars].find((key) => !covered.includes(key));
      const extra = covered.find((key) => !variantVars.has(key));
      if (missing || extra) {
        ctx.addIssue({
          code: "custom",
          message: missing
            ? `変種の変数 ${missing} を受け持つ形の軸が無い`
            : `形の軸の変数 ${extra} が変種に無い`,
          path: ["shape"],
        });
      }
    }
  });

export const componentsSchema = z.record(themeName, componentSchema);

export type Components = z.infer<typeof componentsSchema>;

// 資料の区分(設計の「区分」。コードでは面 surface と呼ぶ)。スライド・質問票・文書(HTML 資料)の3つ
export const surfaceNames = ["slide", "sheet", "document"] as const;

export const surfaceName = z.enum(surfaceNames);

export type Surface = z.infer<typeof surfaceName>;

// 骨格(画面の組み方)を値で持つ区分。スライドの骨格はまだ値にしていない
export const layoutSurfaceNames = ["document", "sheet"] as const;

export const layoutSurfaceName = z.enum(layoutSurfaceNames);

export type LayoutSurface = z.infer<typeof layoutSurfaceName>;

// 文書の領域。"." は空きの升目
export const documentAreaNames = ["main", "toc", "aside", "."] as const;

export type DocumentArea = (typeof documentAreaNames)[number];

const columnWidth = z.number().int().min(120).max(1600);

// 升目の中で、同じ領域が長方形にまとまっているか(CSS grid の grid-template-areas の決まり)
const areaIsRectangle = (
  rows: readonly (readonly string[])[],
  area: string,
) => {
  const cells = rows.flatMap((row, y) =>
    row.flatMap((name, x) => (name === area ? [{ x, y }] : [])),
  );
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return cells.length === (right - left + 1) * (bottom - top + 1);
};

// 題名の塊(署名・題名・リード・要約)と末尾を置く場所。page は列の上下に全幅、main は本文の列の上下
export const documentHeadNames = ["page", "main"] as const;

export type DocumentHead = (typeof documentHeadNames)[number];

// 文書の骨格。列の幅(左から。3つまで)と、升目ごとの領域と、題名の塊の置き場所(既定 page)。
// 本文(main)の列が --doc-measure、本文でない最初の列が --doc-aside-width になる(layout.ts)
export const documentLayoutSchema = z
  .strictObject({
    columns: z.array(columnWidth).min(1).max(3),
    areas: z
      .array(z.array(z.enum(documentAreaNames)).min(1).max(3))
      .min(1)
      .max(4),
    head: z.enum(documentHeadNames).optional(),
  })
  .superRefine((layout, ctx) => {
    if (layout.areas.some((row) => row.length !== layout.columns.length)) {
      ctx.addIssue({
        code: "custom",
        message: "行ごとの升目の数を列の数にそろえる",
        path: ["areas"],
      });
      return;
    }
    const used = [...new Set(layout.areas.flat())].filter(
      (area) => area !== ".",
    );
    if (!used.includes("main")) {
      ctx.addIssue({
        code: "custom",
        message: "本文(main)を置く",
        path: ["areas"],
      });
      return;
    }
    const broken = used.find((area) => !areaIsRectangle(layout.areas, area));
    if (broken) {
      ctx.addIssue({
        code: "custom",
        message: `領域 ${broken} を長方形にまとめる`,
        path: ["areas"],
      });
      return;
    }
    const mainColumns = new Set(
      layout.areas.flatMap((row) =>
        row.flatMap((area, x) => (area === "main" ? [x] : [])),
      ),
    );
    if (mainColumns.size !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "本文(main)は1つの列に置く",
        path: ["areas"],
      });
    }
  });

export type DocumentLayout = z.infer<typeof documentLayoutSchema>;

// 質問票の骨格の元。DOM は質問票の client.js が組むので、今の4つのどれかを元にする。
// 画面で選べるのは focus(1問ずつ)と all(全問)だけ。overview は focus と同じに描き、
// print とともにスキルの --layout と保存した質問票のために残す
export const sheetBaseNames = ["focus", "overview", "all", "print"] as const;

export type SheetBase = (typeof sheetBaseNames)[number];

// 描き分ける骨格。overview は focus と同じに描く
export type DrawnSheetBase = Exclude<SheetBase, "overview">;

export const drawnSheetBase = (base: SheetBase): DrawnSheetBase =>
  base === "overview" ? "focus" : base;

// 古い template.json は移動の帯の位置(navigation)を持つ。帯は下に固定したので、読むときに捨てる
const withoutNavigation = (value: unknown): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "navigation"),
      )
    : value;

// 質問票の骨格。元の骨格と、画面の幅・一覧の列・本文の幅
export const sheetLayoutSchema = z.preprocess(
  withoutNavigation,
  z.strictObject({
    base: z.enum(sheetBaseNames),
    width: z.number().int().min(640).max(2400),
    list: z.strictObject({
      width: columnWidth,
      side: z.enum(["left", "right"]),
    }),
    // 問いと回答の最大幅。null は列の幅いっぱい
    content: columnWidth.nullable(),
  }),
);

export type SheetLayout = z.infer<typeof sheetLayoutSchema>;

export type LayoutOf = { document: DocumentLayout; sheet: SheetLayout };

export const layoutSchemas = {
  document: documentLayoutSchema,
  sheet: sheetLayoutSchema,
} as const;

const themeComponentsSchema = z.record(
  themeName,
  z.strictObject({
    variant: themeName,
    // 省略した値は components.json の既定の選択肢
    params: z.record(themeName, themeName).optional(),
  }),
);

export type ThemeComponents = z.infer<typeof themeComponentsSchema>;

// 既定のテンプレートの写しは dist/<区分>/tokens.css に置くので、この名前は使わない
const RESERVED_TEMPLATE_NAMES = ["tokens"];

export const isTemplateName = (name: string): boolean =>
  themeNamePattern.test(name) && !RESERVED_TEMPLATE_NAMES.includes(name);

export const templateName = themeName.refine(
  (name) => !RESERVED_TEMPLATE_NAMES.includes(name),
  "tokens はテンプレートの名前に使えない",
);

// テンプレートが自分の読みやすさの検査の基準を持つときの形(すべて任意)。
// strictContrast: 真なら、字の明暗差を大きさと区分に関係なく 4.5 で測る(既定は今の基準のまま)
// minFontSize: 見本の字がこれより小さければ落とす(px)。無しなら測らない
export const templateChecksSchema = z.strictObject({
  strictContrast: z.boolean().optional(),
  minFontSize: px.optional(),
});

export type TemplateChecks = z.infer<typeof templateChecksSchema>;

// 字の大きさの倍率。すべての字の大きさ(size.*)に同じ倍率を掛けてから --fs-* を作る。
// 省略は 1(今の大きさ)。1 のときは template.json に書かない
export const TEXT_SCALE = { min: 0.8, max: 1.3, step: 0.05 } as const;

export const textScaleSchema = z
  .number()
  .min(TEXT_SCALE.min)
  .max(TEXT_SCALE.max)
  .multipleOf(TEXT_SCALE.step);

// 倍率を替えたテンプレート。1 のときはキーごと外す
export const withTextScale = <T extends { textScale?: number }>(
  template: T,
  scale: number | undefined,
): T => {
  const { textScale: _previous, ...rest } = template;
  return (
    scale === undefined || scale === 1 ? rest : { ...rest, textScale: scale }
  ) as T;
};

// テンプレート(design/templates/<区分>/<名前>/template.json)。区分ごとの見た目一式。
// 値は tokens.json への差分、部品は components.json の変種の選択。区分をまたぐ共通の値は持たない
const templateFields = {
  label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
  tokens: themeTokensSchema.optional(),
  components: themeComponentsSchema,
  textScale: textScaleSchema.optional(),
  checks: templateChecksSchema.optional(),
};

export const slideTemplateSchema = z.strictObject(templateFields);

export const documentTemplateSchema = z.strictObject({
  ...templateFields,
  layout: documentLayoutSchema,
});

export const sheetTemplateSchema = z.strictObject({
  ...templateFields,
  layout: sheetLayoutSchema,
});

export type SlideTemplate = z.infer<typeof slideTemplateSchema>;
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export type SheetTemplate = z.infer<typeof sheetTemplateSchema>;

export type TemplateOf = {
  slide: SlideTemplate;
  sheet: SheetTemplate;
  document: DocumentTemplate;
};

// どの区分のテンプレートも読める形。layout はスライドに無い
export type Template = SlideTemplate & {
  layout?: DocumentLayout | SheetLayout;
};

export const templateSchemas = {
  slide: slideTemplateSchema,
  sheet: sheetTemplateSchema,
  document: documentTemplateSchema,
} as const;

// スライドの中身の構成(templates/slide/<名前>/sample.json)。テンプレート(template.json)とは別で、
// 新規作成はこのページの構成から始まる。label は構成の名前(無ければフォルダ名)
export const slideSampleSchema = z.strictObject({
  label: z.string().min(1).optional(),
  meta: z
    .strictObject({
      audience: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  slides: z.array(slideSchema).min(1),
});

export type SlideSample = z.infer<typeof slideSampleSchema>;

export const DEFAULT_TEMPLATE = "default";

// 区分ごとの既定のテンプレート(design/selection.json)。
// 新しく作る資料と、テンプレートを指定しない書き出しに使う。資料の deck.json の template はこれより優先する
export const selectionSchema = z.strictObject({
  slide: templateName,
  sheet: templateName,
  document: templateName,
});

export type Selection = z.infer<typeof selectionSchema>;
