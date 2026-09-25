// @vitest-environment node
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documentLayoutVariables } from "../src/design/layout";
import { draftVariables, resolveDraft } from "../src/pages/design/draft";
import {
  drawnSheetBase,
  type Surface,
  type Template,
} from "../src/schema/design";
import { buildDesignCss, cssOutputs, readDesign } from "./design";
import { migrateToTemplates } from "./design-migrate";
import { sampleOutputs } from "./design-samples";
import { SHEET_LAYOUTS } from "./sheet-sample";
import { DEFAULT_SELECTION } from "./test-fixtures.ts";

const designDir = fileURLToPath(new URL("../../design", import.meta.url));
const context = { dir: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-design-"));
  await cp(designDir, context.dir, { recursive: true });
  // design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
  await writeFile(
    join(context.dir, "selection.json"),
    `${JSON.stringify(DEFAULT_SELECTION, null, 2)}\n`,
  );
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
});

const writeTemplate = async (surface: string, name: string, value: unknown) => {
  await mkdir(join(context.dir, "templates", surface, name), {
    recursive: true,
  });
  await writeFile(
    join(context.dir, "templates", surface, name, "template.json"),
    JSON.stringify(value),
  );
};

describe("design:build の生成物", () => {
  // git に入れた dist と見本が、いまの JSON と CSS から作ったものと同じか。
  // 違ったら pnpm design:build を忘れている
  it("dist と samples は最新", async () => {
    const design = await readDesign(designDir);
    if (!design.success) throw new Error(design.message);
    const outputs = new Map([
      ...(await cssOutputs(designDir, design.design)),
      ...(await sampleOutputs(designDir)),
    ]);
    const onDisk = await Promise.all(
      [...outputs.keys()].map(
        async (path) =>
          [path, await readFile(join(designDir, path), "utf8")] as const,
      ),
    );
    expect(new Map(onDisk)).toEqual(outputs);
  });

  it("スライドの見本は全ブロック種を描く", async () => {
    const html =
      (await sampleOutputs(designDir)).get("samples/slide.html") ?? "";
    const types = [
      ...new Set(
        [...html.matchAll(/data-block-type="([a-z-]+)"/g)].map(
          (match) => match[1] ?? "",
        ),
      ),
    ].sort();
    expect(types).toEqual(
      [
        "bullets",
        "card-grid",
        "footer",
        "heading",
        "image",
        "kpi-row",
        "process",
        "table",
        "text",
        "two-col",
      ].sort(),
    );
    expect(html).toContain('href="../dist/slide/tokens.css"');
    // 変数は CSS に任せ、スライドの要素には当てない
    expect(html).not.toMatch(/class="ds-slide[^"]*"[^>]*style="[^"]*--color-/);
  });

  it("区分ごと・テンプレートごとに <名前>.css を作り、消えたテンプレートの CSS を残さない", async () => {
    const template = JSON.parse(
      await readFile(
        join(context.dir, "templates", "document", "default", "template.json"),
        "utf8",
      ),
    );
    await writeTemplate("document", "acme", {
      ...template,
      label: "アクメ",
      tokens: { color: { primary: "#0f766e" } },
    });
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    const css = (path: string) =>
      readFile(join(context.dir, "dist", path), "utf8");
    expect(await css("document/acme.css")).toContain(
      "--color-primary: #0f766e;",
    );
    // 骨格はテンプレートが持つ
    expect(await css("document/acme.css")).toContain("--doc-measure: 640px;");
    expect(await css("slide/default.css")).not.toContain("--doc-");
    // ほかの区分には出ない
    expect(await readdir(join(context.dir, "dist", "slide"))).not.toContain(
      "acme.css",
    );
    const registry = JSON.parse(await css("templates.json"));
    expect(Object.keys(registry.slide)).toEqual(
      expect.arrayContaining(["default", "linen"]),
    );
    expect(registry.slide.acme).toBeUndefined();
    expect(registry.selection).toEqual({
      slide: "default",
      sheet: "default",
      document: "default",
    });

    await rm(join(context.dir, "templates", "document", "acme"), {
      recursive: true,
    });
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    expect(await readdir(join(context.dir, "dist", "document"))).not.toContain(
      "acme.css",
    );
  });

  it("専用の CSS を <名前>.css に入れ、スライドはテンプレートの名前、質問票と文書は :root に閉じ込める", async () => {
    const own = (surface: string, name: string, css: string) =>
      writeFile(
        join(context.dir, "templates", surface, name, "template.css"),
        css,
      );
    await own(
      "slide",
      "linen",
      ".ds-heading__text {\n  color: var(--color-primary);\n}\n",
    );
    await own(
      "document",
      "default",
      "/* 題名 */\nh1 {\n  letter-spacing: 0.1em;\n}\n",
    );
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    const css = (path: string) =>
      readFile(join(context.dir, "dist", path), "utf8");
    const linen = await css("slide/linen.css");
    expect(linen).toContain(
      '.ds-slide[data-template="linen"] {\n  .ds-heading__text {\n    color: var(--color-primary);\n  }\n}',
    );
    // 変数の後ろに置く
    expect(linen.indexOf("--color-primary:")).toBeLessThan(
      linen.indexOf("data-template"),
    );
    expect(await css("slide/default.css")).not.toContain(
      'data-template="linen"',
    );
    expect(await css("document/default.css")).toContain(
      ":root {\n  /* 題名 */\n  h1 {\n    letter-spacing: 0.1em;\n  }\n}",
    );
    // 既定の写しにも入る(外の写しが読む)
    expect(await css("document/tokens.css")).toBe(
      await css("document/default.css"),
    );
    // 画面が読むのはスライドの専用の CSS だけ
    const app = await css("slide-templates.css");
    expect(app).toContain('.ds-slide[data-template="linen"] {');
    expect(app).not.toContain("letter-spacing: 0.1em");
    expect(app).not.toContain("--color-primary:");
  });

  it("専用の CSS に色の直書き・@import・外の url・</ があれば理由を返し、dist に触れない", async () => {
    const before = await readFile(
      join(context.dir, "dist", "slide", "default.css"),
      "utf8",
    );
    const cases = [
      [".ds-slide { color: #ff0000; }", "#ff0000"],
      ['@import "x.css";', "@import"],
      [".ds-slide { background: url(https://example.com/a.png); }", "url"],
      ['/* </style> */ .a::after { content: "</"; }', "</"],
    ] as const;
    for (const [css, word] of cases) {
      await writeFile(
        join(context.dir, "templates", "slide", "default", "template.css"),
        css,
      );
      const result = await buildDesignCss(context.dir);
      expect(result.success).toBe(false);
      expect(!result.success && result.message).toContain(word);
    }
    // コメントの中の色は構わない
    await writeFile(
      join(context.dir, "templates", "slide", "default", "template.css"),
      "/* #ffffff の代わりに変数 */\n.ds-slide { color: var(--color-text); }\n",
    );
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    expect(before).toContain("--color-primary");
  });

  it("区分ごとの既定を <区分>/tokens.css に写し、アプリの app.css はテンプレートに従わない", async () => {
    const template = JSON.parse(
      await readFile(
        join(context.dir, "templates", "sheet", "default", "template.json"),
        "utf8",
      ),
    );
    await writeTemplate("sheet", "acme", {
      ...template,
      tokens: { color: { primary: "#0f766e" } },
    });
    await writeFile(
      join(context.dir, "selection.json"),
      JSON.stringify({ slide: "default", sheet: "acme", document: "default" }),
    );
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    const css = (path: string) =>
      readFile(join(context.dir, "dist", path), "utf8");
    expect(await css("sheet/tokens.css")).toBe(await css("sheet/acme.css"));
    expect(await css("slide/tokens.css")).toBe(await css("slide/default.css"));
    expect(await css("document/tokens.css")).not.toContain("#0f766e");
    expect(await css("app.css")).not.toContain("#0f766e");
  });

  it("selection.json がその区分に無いテンプレートを指すと理由を返す", async () => {
    await writeFile(
      join(context.dir, "selection.json"),
      JSON.stringify({
        slide: "default",
        sheet: "linen",
        document: "default",
      }),
    );
    const result = await buildDesignCss(context.dir);
    expect(result.success).toBe(false);
    expect(!result.success && result.message).toContain("linen");
  });

  it("壊れたテンプレートと tokens という名前は理由を返し、dist に触れない", async () => {
    const before = await readdir(join(context.dir, "dist"));
    await writeTemplate("sheet", "broken", {
      label: "壊れた",
      components: { table: { variant: "zebra" } },
    });
    const broken = await buildDesignCss(context.dir);
    expect(broken.success).toBe(false);
    expect(!broken.success && broken.message).toContain("sheet/broken");
    await rm(join(context.dir, "templates", "sheet", "broken"), {
      recursive: true,
    });
    await writeTemplate("slide", "tokens", { label: "x", components: {} });
    const reserved = await buildDesignCss(context.dir);
    expect(reserved.success).toBe(false);
    expect(!reserved.success && reserved.message).toContain("tokens");
    expect(await readdir(join(context.dir, "dist"))).toEqual(before);
  });
});

describe("文字の大きさの倍率", () => {
  const readTemplate = async (surface: Surface, name: string) =>
    JSON.parse(
      await readFile(
        join(context.dir, "templates", surface, name, "template.json"),
        "utf8",
      ),
    ) as Template;

  // 生成 CSS の :root の宣言を名前 → 値へ
  const declared = (css: string): Record<string, string> =>
    Object.fromEntries(
      [...css.matchAll(/^ {2}(--[a-z0-9-]+): (.+);$/gm)].map((match) => [
        match[1] ?? "",
        match[2] ?? "",
      ]),
    );

  const fontSizes = (variables: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(variables).filter(([name]) => name.startsWith("--fs-")),
    );

  it("画面の見本と build の出力(区分の CSS・スライドの templates.json)が同じ値になる", async () => {
    const scaled: [Surface, string, Template][] = [
      [
        "slide",
        "big",
        { ...(await readTemplate("slide", "linen")), textScale: 1.15 },
      ],
      [
        "document",
        "small",
        { ...(await readTemplate("document", "reading")), textScale: 0.85 },
      ],
      [
        "sheet",
        "big",
        { ...(await readTemplate("sheet", "default")), textScale: 1.3 },
      ],
    ];
    await Promise.all(
      scaled.map(([surface, name, template]) =>
        writeTemplate(surface, name, template),
      ),
    );
    const design = await readDesign(context.dir);
    if (!design.success) throw new Error(design.message);
    const outputs = await cssOutputs(context.dir, design.design);
    const preview = (surface: Surface, name: string, template: Template) => {
      const resolved = resolveDraft(surface, name, template, design.design);
      if (!resolved) throw new Error(`${surface}/${name} を解けない`);
      return draftVariables(resolved);
    };
    const registry = JSON.parse(outputs.get("dist/templates.json") ?? "{}");

    for (const [surface, name, template] of scaled) {
      const variables = preview(surface, name, template);
      const css = declared(outputs.get(`dist/${surface}/${name}.css`) ?? "");
      expect(fontSizes(css)).toEqual(fontSizes(variables));
      expect(css["--text-scale"]).toBe(String(template.textScale));
      // 倍率を持たない元のテンプレートより、字だけが替わる
      const plain = preview(surface, name, { ...template, textScale: 1 });
      expect(variables["--fs-body"]).not.toBe(plain["--fs-body"]);
      expect(variables["--space-md"]).toBe(plain["--space-md"]);
      expect(variables["--lh-body"]).toBe(plain["--lh-body"]);
    }
    // スライドは画面が templates.json の変数をそのまま当てる
    const [, slideName, slideTemplate] = scaled[0] ?? [];
    expect(registry.slide[slideName ?? ""].variables).toEqual(
      preview("slide", slideName ?? "", slideTemplate as Template),
    );
    // linen の本文 18px の 115% は 20.7px
    expect(registry.slide.big.variables["--fs-body"]).toBe("20.7px");
  });

  it("倍率を持つテンプレートが無ければ、生成物は倍率の変数を持たない", async () => {
    const design = await readDesign(context.dir);
    if (!design.success) throw new Error(design.message);
    const outputs = await cssOutputs(context.dir, design.design);
    expect(
      [...outputs]
        .filter(([path]) => path.endsWith(".css") || path.endsWith(".json"))
        .filter(([, content]) => content.includes("--text-scale:"))
        .map(([path]) => path),
    ).toEqual([]);
  });
});

describe("文書と質問票の部品(段 D)", () => {
  const dist = (path: string) =>
    readFile(join(designDir, "dist", path), "utf8");

  it("文書と質問票の CSS は ds- の class だけを使い、旧い gad- を残さない", async () => {
    const css = [
      await dist("document.css"),
      await dist("interaction.css"),
    ].join("\n");
    expect(css).not.toMatch(/gad-/);
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const classes = new Set(
      [...rules.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((match) => match[1]),
    );
    expect([...classes].filter((name) => !name?.startsWith("ds-"))).toEqual([]);
  });

  it("文書と質問票の文字の青は primaryStrong。primary は白の上で 4.5 に届かない", async () => {
    const css = [
      await dist("document.css"),
      await dist("interaction.css"),
    ].join("\n");
    // 動き(@keyframes)の一瞬の色は除く
    const rules = css.replace(/@keyframes[^{]*\{[^}]*\{[^}]*\}\s*\}/g, "");
    expect(rules).not.toMatch(/(?<![-\w])color:\s*var\(--color-primary\)/);
  });

  it.each([
    ["document", ["document.css"]],
    ["sheet", ["document.css", "interaction.css"]],
  ])(
    "部品と骨格の変数は、%s の default のテンプレートの CSS がすべて持つ",
    async (surface, files) => {
      const tokens = await dist(`${surface}/default.css`);
      const defined = new Set(
        [...tokens.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]),
      );
      const css = (await Promise.all(files.map(dist))).join("\n");
      // 部品の中で種類ごとに決める変数と、画面の寸法は CSS の中で定義している
      const local = new Set(
        [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]),
      );
      const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map(
        (match) => match[1],
      );
      // 字の大きさの倍率は、倍率を持つテンプレートだけが書く。無ければ 1 として読む。
      // 3列の型の狭い画面の並び(--doc-*-narrow*)と、題名の塊を本文の列へ置く型のページの升目(--doc-page-*)は、
      // その骨格のテンプレートだけが持つ。無ければ document.css が今までの値で読む
      const standard = new Set(
        documentLayoutVariables({
          columns: [640, 228],
          areas: [["main", "aside"]],
        }).map(([name]) => name),
      );
      const optional = new Set<string | undefined>([
        "--text-scale",
        ...documentLayoutVariables({
          columns: [232, 720, 216],
          areas: [["toc", "main", "aside"]],
          head: "main",
        })
          .map(([name]) => name)
          .filter((name) => !standard.has(name)),
      ]);
      expect(
        [...new Set(used)].filter(
          (name) =>
            !defined.has(name) && !local.has(name) && !optional.has(name),
        ),
      ).toEqual([]);
    },
  );

  it("gad-compat.css は旧い変数を、default のテンプレートにある変数へ写す", async () => {
    const compat = await dist("gad-compat.css");
    const tokens = await dist("sheet/default.css");
    const mapped = [...compat.matchAll(/^\s*--gad-([a-z0-9-]+):/gm)];
    // ga-design の tokens.css と tokens-figure.css にあった 70 個
    expect(mapped).toHaveLength(70);
    const targets = [...compat.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(
      (match) => match[1],
    );
    expect(targets.filter((name) => !tokens.includes(`${name}:`))).toEqual([]);
  });

  it("図の生成器を dist へ写し、検査に通る見本だけ HTML にする", async () => {
    const files = await readdir(join(designDir, "dist", "figure", "examples"));
    expect(files.filter((file) => file.endsWith(".html")).sort()).toEqual([
      "deliver.html",
      "tokens.html",
      "triage.html",
    ]);
    const html = await dist("figure/examples/triage.html");
    // SVG は色・角丸・破線を持たない。CSS と部品の変数が決める
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
    expect(svg).not.toMatch(/\s(?:fill|stroke|rx|stroke-dasharray)=/);
    expect(svg).toContain('class="ds-node ds-node--outside"');
  });

  it("文書と質問票の見本は生成 CSS を読み、表・カード・注意・図を持つ", async () => {
    const outputs = await sampleOutputs(designDir);
    const document = outputs.get("samples/document.html") ?? "";
    for (const part of ["ds-table", "ds-card", "ds-notice", "ds-figure"]) {
      expect(document).toContain(part);
    }
    expect(document).not.toContain("<script");
    for (const layout of SHEET_LAYOUTS) {
      const sheet = outputs.get(`samples/sheet.${layout}.html`) ?? "";
      // overview は focus と同じに描く
      expect(sheet).toContain(`data-layout="${drawnSheetBase(layout)}"`);
      expect(sheet).toContain('href="../dist/interaction.css"');
      expect(sheet).not.toContain("<script");
      for (const part of ["ds-question-card", "ds-answer-section"]) {
        expect(sheet).toContain(part);
      }
    }
  });

  it("質問票の骨格ごとに、一覧・画面下の帯・入力部品の有無が違う", async () => {
    const outputs = await sampleOutputs(designDir);
    const sheet = (layout: string) =>
      outputs.get(`samples/sheet.${layout}.html`) ?? "";
    const count = (html: string, part: string) => html.split(part).length - 1;
    // focus: 1問・一覧を開いて始まり、閉じるボタンが出る
    expect(count(sheet("focus"), 'class="ds-question-card"')).toBe(1);
    expect(sheet("focus")).toMatch(/class="ds-question-sidebar">/);
    expect(sheet("focus")).not.toContain("ds-sidebar-collapsed");
    expect(sheet("focus")).toContain(
      'aria-expanded="true">質問一覧を閉じる</button>',
    );
    // overview: focus と同じ画面
    const board = (html: string) =>
      html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(board(sheet("overview"))).toBe(board(sheet("focus")));
    // all: 全問・一覧なし・画面下の帯あり
    expect(count(sheet("all"), 'class="ds-question-card"')).toBe(4);
    expect(sheet("all")).not.toContain("ds-question-sidebar");
    expect(sheet("all")).toContain("ds-page-navigation");
    // print: 全問・ボタンも入力部品も出さない
    expect(count(sheet("print"), 'class="ds-question-card"')).toBe(4);
    for (const part of [
      "<button",
      "<input",
      "<textarea",
      "ds-page-navigation",
    ]) {
      expect(sheet("print")).not.toContain(part);
    }
    expect(sheet("print")).toContain("ds-answer-lines");
  });
});

// 段 I より前の design/ の形。themes/ と layouts/ と、layouts を持つ selection.json
const legacyDefault = {
  tokens: {
    color: {
      bg: "#ffffff",
      text: "#1e293b",
      muted: "#64748b",
      primary: "#3b82f6",
      surface: "#f8fafc",
      tint: "#dbeafe",
    },
  },
  components: {
    table: { variant: "lined" },
    card: { variant: "outlined" },
    notice: { variant: "bar" },
    figure: { variant: "rounded" },
  },
  surfaces: {
    slide: { tokens: {}, components: {} },
    sheet: { tokens: {}, components: {} },
    document: { tokens: {}, components: {} },
  },
};

const legacyAcme = {
  tokens: { color: { primary: "#0f766e" } },
  components: { table: { variant: "lined" } },
  surfaces: {
    slide: { tokens: { size: { h1: 40 } } },
    sheet: {
      tokens: { color: { tint: "#ccfbf1" } },
      components: {
        table: { variant: "striped", params: { density: "compact" } },
      },
    },
    document: {},
  },
};

const standard = {
  label: "標準(目次は上、脇は右)",
  columns: [640, 228],
  areas: [
    ["toc", "toc"],
    ["main", "aside"],
  ],
};

const focus = {
  label: "1問ずつ",
  base: "focus",
  width: 1280,
  list: { width: 228, side: "left" },
  content: null,
  navigation: "bottom",
};

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

// テンプレートを消し、段 I より前の形だけを置く
const writeLegacy = async ({
  themes,
  layouts = {},
  selection,
}: {
  themes: Record<string, unknown>;
  layouts?: Record<string, unknown>;
  selection: unknown;
}) => {
  await rm(join(context.dir, "templates"), { recursive: true, force: true });
  await Promise.all([
    ...Object.entries(themes).map(([name, theme]) =>
      writeJson(join(context.dir, "themes", `${name}.json`), theme),
    ),
    ...Object.entries({
      "document/standard": standard,
      "sheet/focus": focus,
      ...layouts,
    }).map(([name, layout]) =>
      writeJson(join(context.dir, "layouts", `${name}.json`), layout),
    ),
    writeJson(join(context.dir, "selection.json"), selection),
  ]);
};

const readTemplateFile = async (surface: string, name: string) =>
  JSON.parse(
    await readFile(
      join(context.dir, "templates", surface, name, "template.json"),
      "utf8",
    ),
  );

const LEGACY_SELECTION = {
  slide: "default",
  sheet: "acme",
  document: "default",
  layouts: { document: "standard", sheet: "focus" },
};

// 質問票だけ別のテーマを選んでいた旧い selection.json
const LEGACY_SELECTION_WITH = (sheet: string) => ({
  slide: "default",
  sheet,
  document: "default",
  layouts: { document: "standard", sheet: "focus" },
});

describe("段 I より前のテーマと型の移行", () => {
  it("テーマを区分ごとのテンプレートにし、共通の値と面の上書きを区分ごとに解く", async () => {
    await writeLegacy({
      themes: { default: legacyDefault, acme: legacyAcme },
      selection: LEGACY_SELECTION,
    });
    const result = await migrateToTemplates(context.dir);
    expect(result.migrated).toBe(true);
    expect("templates" in result && [...result.templates].sort()).toEqual([
      "document/acme",
      "document/default",
      "sheet/acme",
      "sheet/default",
      "slide/acme",
      "slide/default",
    ]);
    expect(await readTemplateFile("sheet", "acme")).toEqual({
      label: "acme",
      tokens: { color: { primary: "#0f766e", tint: "#ccfbf1" } },
      components: {
        table: { variant: "striped", params: { density: "compact" } },
      },
      // 段 H の型の移動の帯の位置は、読むときに捨てる
      layout: {
        base: "focus",
        width: 1280,
        list: { width: 228, side: "left" },
        content: null,
      },
    });
    expect(await readTemplateFile("slide", "acme")).toEqual({
      label: "acme",
      tokens: { color: { primary: "#0f766e" }, size: { h1: 40 } },
      components: { table: { variant: "lined" } },
    });
    expect((await readTemplateFile("document", "default")).label).toBe(
      "AI Handout Studio Design",
    );
    expect(
      JSON.parse(await readFile(join(context.dir, "selection.json"), "utf8")),
    ).toEqual({ slide: "default", sheet: "acme", document: "default" });
    expect(await readdir(context.dir)).not.toContain("themes");
    expect(await readdir(context.dir)).not.toContain("layouts");
    expect(await migrateToTemplates(context.dir)).toEqual({ migrated: false });

    expect((await buildDesignCss(context.dir)).success).toBe(true);
    const css = (path: string) =>
      readFile(join(context.dir, "dist", path), "utf8");
    expect(await css("sheet/tokens.css")).toBe(await css("sheet/acme.css"));
    expect(await css("sheet/acme.css")).toContain("--color-tint: #ccfbf1;");
    expect(await css("slide/acme.css")).not.toContain("#ccfbf1");
    expect(await css("slide/acme.css")).toContain("--fs-h1: 40px;");
    expect(await css("document/acme.css")).toContain("--doc-measure: 640px;");
  });

  it("選ばれていない型のうち用意した骨格と違うものは、その区分のテンプレートにする", async () => {
    await writeLegacy({
      themes: { default: legacyDefault },
      layouts: {
        "document/single": {
          label: "1列",
          columns: [720],
          areas: [["toc"], ["main"]],
        },
        "document/wide": {
          label: "幅広",
          columns: [760, 240],
          areas: [["main", "aside"]],
        },
        "sheet/big": { ...focus, label: "大きな画面", width: 1600 },
      },
      selection: {
        ...LEGACY_SELECTION,
        sheet: "default",
        layouts: { document: "wide", sheet: "focus" },
      },
    });
    const result = await migrateToTemplates(context.dir);
    expect(result).toMatchObject({ migrated: true });
    // 選んでいた型は、どのテンプレートの骨格にもなる
    expect((await readTemplateFile("document", "default")).layout).toEqual({
      columns: [760, 240],
      areas: [["main", "aside"]],
    });
    // 用意した骨格(standard・single)は、テンプレートにしない
    expect(await readdir(join(context.dir, "templates", "document"))).toEqual([
      "default",
    ]);
    expect(await readTemplateFile("sheet", "big")).toMatchObject({
      label: "大きな画面",
      layout: { width: 1600 },
    });
  });

  it("段 H より前の文書の骨格は、文書の区分で使っていたテーマの骨格にする", async () => {
    await writeLegacy({
      themes: {
        default: {
          ...legacyDefault,
          surfaces: {
            ...legacyDefault.surfaces,
            document: {
              ...legacyDefault.surfaces.document,
              layout: { measure: 720, aside: false, toc: "side" },
            },
          },
        },
      },
      selection: { slide: "default", sheet: "default", document: "default" },
    });
    expect((await migrateToTemplates(context.dir)).migrated).toBe(true);
    expect((await readTemplateFile("document", "default")).layout).toEqual({
      columns: [720, 228],
      areas: [["main", "toc"]],
    });
    expect((await buildDesignCss(context.dir)).success).toBe(true);
    const css = await readFile(
      join(context.dir, "dist", "document", "tokens.css"),
      "utf8",
    );
    // 段 H より前の docGrid と同じ値
    expect(css).toContain("--doc-measure: 720px;");
    expect(css).toContain("--doc-aside-display: none;");
    expect(css).toContain('--doc-areas: "main toc";');
    expect(css).toContain("--doc-rows: 1fr;");
  });

  it("テンプレートが既にあり、手元のテーマだけが残っていれば、それだけを移して選択はそのまま引き継ぐ", async () => {
    await writeJson(join(context.dir, "themes", "test-theme.json"), {
      ...legacyDefault,
      tokens: { color: { primary: "#0f766e" } },
    });
    await writeJson(
      join(context.dir, "selection.json"),
      LEGACY_SELECTION_WITH("test-theme"),
    );
    const result = await migrateToTemplates(context.dir);
    expect("templates" in result && [...result.templates].sort()).toEqual([
      "document/test-theme",
      "sheet/test-theme",
      "slide/test-theme",
    ]);
    expect(
      JSON.parse(await readFile(join(context.dir, "selection.json"), "utf8")),
    ).toEqual({ slide: "default", sheet: "test-theme", document: "default" });
    expect((await buildDesignCss(context.dir)).success).toBe(true);
  });

  it("同じ名前のテンプレートが既にあれば、別の名前に移して選択もそちらへ向ける", async () => {
    await rm(join(context.dir, "templates", "sheet"), { recursive: true });
    await writeJson(join(context.dir, "themes", "default.json"), {
      ...legacyDefault,
      tokens: { color: { primary: "#0f766e" } },
    });
    await writeJson(join(context.dir, "selection.json"), {
      slide: "default",
      sheet: "default",
      document: "default",
      layouts: { document: "standard", sheet: "focus" },
    });
    expect((await migrateToTemplates(context.dir)).migrated).toBe(true);
    expect(
      JSON.parse(await readFile(join(context.dir, "selection.json"), "utf8")),
    ).toEqual({
      slide: "default-migrated",
      sheet: "default",
      document: "default-migrated",
    });
    expect(
      (await readTemplateFile("slide", "default-migrated")).tokens.color,
    ).toEqual({ primary: "#0f766e" });
    // 選んでいた型の無い区分は、既定の骨格になる
    expect((await readTemplateFile("sheet", "default")).layout.base).toBe(
      "focus",
    );
  });
});
