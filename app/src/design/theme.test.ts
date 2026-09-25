// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Components,
  componentsSchema,
  type Surface,
  surfaceNames,
  TEXT_SCALE,
  type Template,
  templateSchemas,
  tokensSchema,
  withTextScale,
} from "../schema/design";
import {
  BODY_MIN_RATIO,
  bodyPairs,
  borderPairs,
  checkContrast,
  KNOWN_LOW_MIN_RATIO,
  knownLowPairs,
} from "./contrast";
import {
  appCss,
  contrastRatio,
  mergeTokens,
  minTextScale,
  type ResolvedTemplate,
  resolveBase,
  resolveTemplate,
  scaledPx,
  TEXT_SCALE_STEPS,
  templateCss,
  templateVariables,
  tokenVariables,
} from "./theme";

const designDir = fileURLToPath(new URL("../../../design", import.meta.url));
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(designDir, path), "utf8"));

const tokens = tokensSchema.parse(readJson("tokens.json"));
const components = componentsSchema.parse(readJson("components.json"));
// 区分ごとのテンプレートの名前(design/templates/<区分>/)
const templateNames = surfaceNames.flatMap((surface) =>
  readdirSync(join(designDir, "templates", surface))
    .filter((name) =>
      existsSync(join(designDir, "templates", surface, name, "template.json")),
    )
    .map((name) => [surface, name] as const),
);

const templateOf = (surface: Surface, name: string): Template =>
  templateSchemas[surface].parse(
    readJson(`templates/${surface}/${name}/template.json`),
  ) as Template;

const resolved = (surface: Surface, name: string): ResolvedTemplate => {
  const template = templateOf(surface, name);
  const result = resolveTemplate(surface, name, template, tokens, components);
  if (!result.success) throw new Error(result.message);
  return result.template;
};

const resolve = (
  surface: Surface,
  template: unknown,
  withComponents = components,
) =>
  resolveTemplate(
    surface,
    "acme",
    templateSchemas[surface].parse(template) as Template,
    tokens,
    withComponents,
  );

const baseTemplate = {
  label: "Acme",
  components: { table: { variant: "lined" } },
};

const standardLayout = {
  columns: [640, 228],
  areas: [
    ["toc", "toc"],
    ["main", "aside"],
  ],
};

describe("tokens.json と components.json", () => {
  it("正本のファイルがスキーマに合う", () => {
    // どの区分にも default のテンプレートがある
    for (const surface of surfaceNames) {
      expect(templateNames).toContainEqual([surface, "default"]);
    }
  });

  it("知らないキーと色の形を拒む", () => {
    const input = readJson("tokens.json") as {
      color: Record<string, string>;
    };
    expect(
      tokensSchema.safeParse({
        ...input,
        color: { ...input.color, primary: "blue" },
      }).success,
    ).toBe(false);
    expect(tokensSchema.safeParse({ ...input, extra: {} }).success).toBe(false);
  });

  it("既定の変種が無い部品と、変数のそろわない変種を拒む", () => {
    const variant = (vars: Record<string, string>) => ({ label: "x", vars });
    expect(
      componentsSchema.safeParse({
        table: { label: "表", default: "none", variants: {} },
      }).success,
    ).toBe(false);
    expect(
      componentsSchema.safeParse({
        table: {
          label: "表",
          default: "a",
          variants: {
            a: variant({ "table-border-width": "1px" }),
            b: variant({ "table-radius": "0" }),
          },
        },
      }).success,
    ).toBe(false);
  });

  it("形の軸が変種の変数をちょうど1回ずつ受け持たないと拒む", () => {
    const choice = (vars: Record<string, string>) => ({ label: "x", vars });
    const table = (shape: Record<string, unknown>) => ({
      table: {
        label: "表",
        default: "a",
        variants: {
          a: choice({ "table-border-width": "1px", "table-radius": "0px" }),
        },
        shape,
      },
    });
    const axis = (vars: Record<string, string>) => ({
      label: "軸",
      options: { on: choice(vars) },
    });
    expect(
      componentsSchema.safeParse(
        table({
          outer: axis({ "table-border-width": "1px" }),
          corner: axis({ "table-radius": "0px" }),
        }),
      ).success,
    ).toBe(true);
    // 受け持つ軸が無い変数
    expect(
      componentsSchema.safeParse(
        table({ outer: axis({ "table-border-width": "1px" }) }),
      ).success,
    ).toBe(false);
    // 2つの軸が同じ変数を受け持つ
    expect(
      componentsSchema.safeParse(
        table({
          outer: axis({ "table-border-width": "1px" }),
          corner: axis({ "table-radius": "0px", "table-border-width": "0px" }),
        }),
      ).success,
    ).toBe(false);
    // 変種に無い変数
    expect(
      componentsSchema.safeParse(
        table({
          outer: axis({ "table-border-width": "1px" }),
          corner: axis({ "table-radius": "0px", "table-gap": "0px" }),
        }),
      ).success,
    ).toBe(false);
  });
});

describe("テンプレート", () => {
  it.each(templateNames)(
    "%s/%s はスキーマに合い、部品を解決できる",
    (surface, name) => {
      expect(() => resolved(surface, name)).not.toThrow();
    },
  );

  it("tokens は差分だけを書ける。書かない値は tokens.json から来る", () => {
    const result = resolve("slide", {
      ...baseTemplate,
      tokens: { color: { primary: "#112233" } },
    });
    expect(result.success && result.template.tokens.color.primary).toBe(
      "#112233",
    );
    expect(result.success && result.template.tokens.color.text).toBe(
      tokens.color.text,
    );
  });

  it("指定の無い部品は既定の変種になる", () => {
    const result = resolve("slide", { ...baseTemplate, components: {} });
    expect(
      result.success && result.template.components.map((c) => c.variant),
    ).toEqual(Object.values(components).map((c) => c.default));
  });

  it("components.json に無い変種を拒み、区分と名前を添える", () => {
    const result = resolve("sheet", {
      ...baseTemplate,
      components: { table: { variant: "zigzag" } },
      layout: {
        base: "focus",
        width: 1280,
        list: { width: 228, side: "left" },
        content: null,
      },
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.message).toContain("sheet/acme");
  });

  it("checks は任意で、知らないキーを拒む", () => {
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        checks: { strictContrast: true },
      }).success,
    ).toBe(true);
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        checks: { minFontSize: 18 },
      }).success,
    ).toBe(true);
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        checks: { zzz: true },
      }).success,
    ).toBe(false);
  });

  it("区分の形でない値を拒む", () => {
    // 表示名は要る
    expect(templateSchemas.slide.safeParse({ components: {} }).success).toBe(
      false,
    );
    // 段 I より前の3層の形(surfaces)は受け付けない
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        surfaces: { slide: {}, sheet: {}, document: {} },
      }).success,
    ).toBe(false);
    // スライドは骨格を持たず、文書と質問票は持つ
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        layout: standardLayout,
      }).success,
    ).toBe(false);
    expect(templateSchemas.document.safeParse(baseTemplate).success).toBe(
      false,
    );
    expect(
      templateSchemas.document.safeParse({
        ...baseTemplate,
        layout: standardLayout,
      }).success,
    ).toBe(true);
    expect(
      templateSchemas.slide.safeParse({
        ...baseTemplate,
        tokens: { color: { x: "#fff" } },
      }).success,
    ).toBe(false);
  });
});

describe("部品のパラメータ", () => {
  it("書かなかったパラメータは既定の選択肢になり、変数が入る", () => {
    const result = resolve("slide", baseTemplate);
    if (!result.success) throw new Error(result.message);
    const table = result.template.components.find((c) => c.name === "table");
    expect(table?.params).toEqual({ density: "normal" });
    expect(new Map(table?.vars).get("--table-cell-pad-y")).toBe(
      "var(--space-sm)",
    );
  });

  it("選んだ選択肢の変数に替わり、変種の変数はそのまま", () => {
    const result = resolve("slide", {
      ...baseTemplate,
      components: {
        table: { variant: "striped", params: { density: "compact" } },
      },
    });
    if (!result.success) throw new Error(result.message);
    const vars = new Map(templateVariables(result.template));
    expect(vars.get("--table-cell-pad-y")).toBe("var(--space-xs)");
    expect(vars.get("--table-stripe-bg")).toBe("var(--color-surface)");
    expect(templateCss(result.template)).toContain(
      "/* 部品: table(striped, density=compact) */",
    );
  });

  it("components.json に無いパラメータと選択肢を拒む", () => {
    const withParams = (params: Record<string, string>) => ({
      ...baseTemplate,
      components: { table: { variant: "lined", params } },
    });
    expect(resolve("slide", withParams({ density: "huge" })).success).toBe(
      false,
    );
    expect(resolve("slide", withParams({ zebra: "on" })).success).toBe(false);
  });

  it("選択肢の変数がそろわない、または変種と重なるパラメータを拒む", () => {
    const option = (vars: Record<string, string>) => ({ label: "x", vars });
    const table = (options: Record<string, ReturnType<typeof option>>) => ({
      table: {
        label: "表",
        default: "a",
        variants: { a: option({ "table-border-width": "1px" }) },
        params: { density: { label: "密度", default: "n", options } },
      },
    });
    expect(
      componentsSchema.safeParse(
        table({
          n: option({ "table-cell-pad-y": "1px" }),
          c: option({ "table-cell-pad-x": "1px" }),
        }),
      ).success,
    ).toBe(false);
    expect(
      componentsSchema.safeParse(
        table({ n: option({ "table-border-width": "2px" }) }),
      ).success,
    ).toBe(false);
    expect(
      componentsSchema.safeParse(
        table({ n: option({ "table-cell-pad-y": "1px" }) }),
      ).success,
    ).toBe(true);
  });
});

describe("生成 CSS", () => {
  it("見出しの書体は既定で本文と同じで、テンプレートが名前で差し替えられる", () => {
    const base = tokensSchema.parse(
      JSON.parse(readFileSync(join(designDir, "tokens.json"), "utf8")),
    );
    const display = (tokens: typeof base) =>
      Object.fromEntries(tokenVariables(tokens))["--font-display"];
    expect(display(base)).toBe("var(--font-sans)");
    const maru = mergeTokens(base, { font: { display: ["Zen Maru Gothic"] } });
    expect(display(maru)).toBe('"Zen Maru Gothic"');
  });

  it("tokens・部品・骨格の変数を :root に書く", () => {
    const css = templateCss(resolved("document", "default"));
    expect(css).toContain("--color-primary: #3b82f6;");
    expect(css).toContain(
      '--font-sans: "Noto Sans JP Variable", "Noto Sans JP", sans-serif;',
    );
    expect(css).toContain("--font-display: var(--font-sans);");
    expect(css).toContain("--radius: 16px;");
    expect(css).toContain("--lh-body: 1.6;");
    expect(css).toContain("--table-border-width: 1px;");
    expect(css).toContain("--card-shadow: var(--shadow-card);");
    expect(css).toContain("--doc-measure: 640px;");
    expect(css).toContain(
      '--font-mono: ui-monospace, "SF Mono", "Menlo", "Consolas", "Noto Sans Mono Variable", "Noto Sans Mono", monospace;',
    );
    expect(css).toContain("--color-success-tint: #f0fdf4;");
    // 文書の既定のテンプレートは注意を「箱」にしている(design/templates/document/default)
    expect(css).toContain("--notice-bar-width: 1px;");
    expect(css).toContain("--figure-node-radius: var(--radius-sm);");
    expect(css).toContain("--figure-arrow-fill: var(--color-muted);");
    expect(css).toContain("--figure-link-dash: none;");
  });

  it("変種を替えると、その部品の変数だけが変わる", () => {
    const withFlat: Components = {
      ...components,
      table: {
        label: "表",
        default: "lined",
        variants: {
          lined: { label: "罫線", vars: { "table-border-width": "1px" } },
          flat: { label: "罫線なし", vars: { "table-border-width": "0" } },
        },
      },
    };
    const result = resolve(
      "slide",
      { ...baseTemplate, components: { table: { variant: "flat" } } },
      withFlat,
    );
    if (!result.success) throw new Error(result.message);
    expect(
      new Map(templateVariables(result.template)).get("--table-border-width"),
    ).toBe("0");
  });

  it("骨格の変数は文書と質問票のテンプレートだけが持つ", () => {
    expect(templateCss(resolved("slide", "default"))).not.toContain("--doc-");
    expect(
      new Map(templateVariables(resolved("sheet", "default"))).get(
        "--board-width",
      ),
    ).toBe("1280px");
  });

  it("アプリの画面の変数は tokens.json と部品の既定だけから作る", () => {
    const css = appCss(resolveBase(tokens, components));
    expect(css).toContain(`--color-primary: ${tokens.color.primary};`);
    expect(css).toContain("--table-border-width: 1px;");
    expect(css).not.toContain("--doc-");
  });
});

describe.each(templateNames)("明暗差: %s/%s", (surface, name) => {
  const color = resolved(surface, name).tokens.color;
  // 任意のキーは tokens.json が既定を埋めるので、明暗差の一覧に出す色はどれも値を持つ
  const hex = (key: keyof typeof color): string => {
    const value = color[key];
    if (typeof value !== "string") throw new Error(`色 ${key} が無い`);
    return value;
  };
  // テンプレートが自分の基準(checks.strictContrast)を持てば、低くてよい組の例外を当てない
  const strictContrast =
    templateOf(surface, name).checks?.strictContrast ?? false;

  it.each(bodyPairs)("%s と %s は 4.5 以上", (fg, bg) => {
    expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(
      BODY_MIN_RATIO,
    );
  });

  it.each(knownLowPairs)("%s と %s は基準以上", (fg, bg) => {
    expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(
      strictContrast ? BODY_MIN_RATIO : KNOWN_LOW_MIN_RATIO,
    );
  });

  if (strictContrast) {
    it.each(borderPairs)("%s と %s は 3 以上(枠)", (fg, bg) => {
      expect(contrastRatio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(
        KNOWN_LOW_MIN_RATIO,
      );
    });
  }

  it("保存時の検査も同じ一覧で全部通る", () => {
    const checks = checkContrast(color, { strictContrast });
    expect(checks).toHaveLength(
      bodyPairs.length +
        knownLowPairs.length +
        (strictContrast ? borderPairs.length : 0),
    );
    expect(checks.filter((check) => !check.ok)).toEqual([]);
  });
});

describe("strictContrast の検査(基準の仕組み)", () => {
  it("真なら、低くてよい組にも 4.5 を求め、枠と地の組を 3 以上で測る", () => {
    // primary/bg は既定では知られた低い組(3 以上)。strict では 4.5 を求める
    const [firstLow] = knownLowPairs;
    if (!firstLow) throw new Error("knownLowPairs が空");
    const loose = checkContrast(tokens.color);
    const strict = checkContrast(tokens.color, { strictContrast: true });
    expect(strict).toHaveLength(loose.length + borderPairs.length);
    const [foreground, background] = firstLow;
    const looseCheck = loose.find(
      (check) =>
        check.foreground === foreground && check.background === background,
    );
    const strictCheck = strict.find(
      (check) =>
        check.foreground === foreground && check.background === background,
    );
    expect(looseCheck?.min).toBe(KNOWN_LOW_MIN_RATIO);
    expect(strictCheck?.min).toBe(BODY_MIN_RATIO);
    const [borderFg, borderBg] = borderPairs[0] ?? [];
    expect(
      strict.some(
        (check) =>
          check.foreground === borderFg && check.background === borderBg,
      ),
    ).toBe(true);
  });

  it("基準を持たないテンプレートの結果は今と同じにする", () => {
    expect(checkContrast(tokens.color)).toEqual(
      checkContrast(tokens.color, { strictContrast: false }),
    );
  });
});

describe("保存時の明暗差の検査", () => {
  it("閾値に届かない組み合わせを ok: false で返す", () => {
    const checks = checkContrast({ ...tokens.color, text: "#cccccc" });
    const failed = checks.filter((check) => !check.ok);
    expect(failed.map((check) => check.foreground)).toContain("text");
    expect(failed.every((check) => check.ratio < check.min)).toBe(true);
  });
});

describe("明暗差の計算", () => {
  it("白と黒は 21、同じ色は 1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 5);
  });
});

describe("文字の大きさの倍率(textScale)", () => {
  const variablesOf = (surface: Surface, template: unknown) => {
    const result = resolve(surface, template);
    if (!result.success) throw new Error(result.message);
    return new Map(templateVariables(result.template));
  };
  const group = (variables: Map<string, string>, prefix: string) =>
    [...variables].filter(([name]) => name.startsWith(prefix));

  it("0.8〜1.3 の 0.05 刻みだけを受け、範囲の外と刻みの外を弾く", () => {
    const accepts = (textScale: unknown) =>
      templateSchemas.slide.safeParse({ ...baseTemplate, textScale }).success;
    expect(TEXT_SCALE_STEPS).toEqual([
      0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3,
    ]);
    expect(TEXT_SCALE_STEPS.every(accepts)).toBe(true);
    expect([0.75, 1.35, 1.12, 0, "1.1"].map(accepts)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    // 省略できる(1 と同じ)
    expect(accepts(undefined)).toBe(true);
    expect(TEXT_SCALE).toEqual({ min: 0.8, max: 1.3, step: 0.05 });
  });

  it("倍率ですべての --fs-* がそろって変わり、行の高さ・余白・角丸・色は変わらない", () => {
    const before = variablesOf("slide", baseTemplate);
    const after = variablesOf("slide", { ...baseTemplate, textScale: 1.2 });
    const sizes = group(before, "--fs-");
    expect(sizes.length).toBeGreaterThanOrEqual(10);
    expect(group(after, "--fs-")).toEqual(
      sizes.map(([name, value]) => [
        name,
        `${scaledPx(Number.parseFloat(value), 1.2)}px`,
      ]),
    );
    expect(after.get("--fs-body")).toBe(`${scaledPx(tokens.size.body, 1.2)}px`);
    for (const prefix of ["--lh-", "--space-", "--radius", "--color-"]) {
      expect(group(after, prefix)).toEqual(group(before, prefix));
    }
  });

  it("1 のとき(書かないときも)は今と同じ変数と CSS になり、--text-scale も出さない", () => {
    const current = resolved("document", "default");
    const template = templateOf("document", "default");
    const one = resolveTemplate(
      "document",
      "default",
      { ...template, textScale: 1 },
      tokens,
      components,
    );
    if (!one.success) throw new Error(one.message);
    expect(templateVariables(one.template)).toEqual(templateVariables(current));
    expect(templateCss(one.template)).toBe(templateCss(current));
    expect(templateCss(current)).not.toContain("--text-scale");
  });

  it("倍率を持つテンプレートは --text-scale を書き、印刷の本文の 11pt がそれを読む", () => {
    const result = resolve("document", {
      ...baseTemplate,
      layout: standardLayout,
      textScale: 0.9,
    });
    if (!result.success) throw new Error(result.message);
    expect(templateCss(result.template)).toContain("--text-scale: 0.9;");
    expect(readFileSync(join(designDir, "document.css"), "utf8")).toContain(
      "font-size: calc(11pt * var(--text-scale, 1));",
    );
  });

  it("端数は 0.1px で丸める", () => {
    expect(scaledPx(13, 1.1)).toBe(14.3);
    expect(scaledPx(13, 1.15)).toBe(15);
    expect(scaledPx(14, 0.85)).toBe(11.9);
    expect(scaledPx(18, 1.05)).toBe(18.9);
    expect(scaledPx(36, 0.9500000000000001)).toBe(34.2);
  });

  it("1 のときはキーごと外し、それ以外は倍率を持たせる", () => {
    const plain: Template = baseTemplate;
    const scaled = withTextScale(plain, 1.1);
    expect(scaled).toEqual({ ...baseTemplate, textScale: 1.1 });
    expect(withTextScale(scaled, 1)).toEqual(plain);
    expect("textScale" in withTextScale(scaled, 1)).toBe(false);
  });

  it("下限: 最小の字の検査が無ければ 80%、あればいちばん小さい字がそれを割らない倍率まで", () => {
    // どの字も 40px にし、1つだけ小さくした tokens
    const sizes = (size: Partial<typeof tokens.size>) => ({
      ...tokens,
      size: {
        ...(Object.fromEntries(
          Object.keys(tokens.size).map((key) => [key, 40]),
        ) as typeof tokens.size),
        ...size,
      },
    });
    expect(minTextScale(tokens)).toBe(0.8);
    // 16px の字が 14px を割らないのは 90%(85% は 13.6px)
    expect(minTextScale(sizes({ small: 16 }), 14)).toBe(0.9);
    expect(minTextScale(sizes({ small: 20 }), 14)).toBe(0.8);
    // 今の大きさでちょうど・すでに割るときは 100% より下げない
    expect(minTextScale(sizes({ small: 14 }), 14)).toBe(1);
    expect(minTextScale(sizes({ small: 12 }), 14)).toBe(1);
  });

  it("最小の字の検査を持つ Cobalt は、どの区分も 100% より下げられない", () => {
    for (const surface of surfaceNames) {
      const template = templateOf(surface, "cobalt");
      expect(template.checks?.minFontSize).toBeDefined();
      expect(
        minTextScale(
          mergeTokens(tokens, template.tokens),
          template.checks?.minFontSize,
        ),
      ).toBe(1);
    }
  });

  it("今あるテンプレートは倍率を持たない", () => {
    expect(
      templateNames.filter(
        ([surface, name]) => templateOf(surface, name).textScale !== undefined,
      ),
    ).toEqual([]);
  });
});
