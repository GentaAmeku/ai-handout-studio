import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  appCss,
  documentOwnCssProblem,
  GENERATED_NOTE,
  ownCssProblem,
  type ResolvedTemplate,
  resolveBase,
  resolveTemplate,
  templateCss,
  templateOwnCss,
  templateVariables,
} from "../src/design/theme.ts";
import {
  type Components,
  componentsSchema,
  DEFAULT_TEMPLATE,
  isTemplateLabel,
  isTemplateName,
  labelOfTemplateName,
  type Selection,
  type SlideSample,
  type Surface,
  selectionSchema,
  slideSampleSchema,
  surfaceNames,
  type Template,
  type TemplateOf,
  type Tokens,
  templateSchemas,
  tokensSchema,
} from "../src/schema/design.ts";

// design/ の JSON を読み、design/dist/ の CSS を作る(pnpm design:build・ai-handout-studio design build)

// 区分ごとのテンプレート。名前 → template.json の値
export type SurfaceTemplates = {
  [S in Surface]: Record<string, TemplateOf[S]>;
};

export type Design = {
  tokens: Tokens;
  components: Components;
  templates: SurfaceTemplates;
  // 区分ごとに解いた値。並びは名前の順
  resolved: Record<Surface, ResolvedTemplate[]>;
  // 区分ごとの専用の CSS(template.css)。名前 → 中身。無いテンプレートは持たない
  styles: Record<Surface, Record<string, string>>;
  selection: Selection;
};

export type ReadDesignResult =
  | { success: true; design: Design }
  | { success: false; message: string };

export const parseFile = async <T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<
  { success: true; value: T } | { success: false; message: string }
> => {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) return { success: false, message: `${path} が無い` };
  const json = (() => {
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch (error) {
      return { ok: false as const, message: String(error) };
    }
  })();
  if (!json.ok) return { success: false, message: `${path}: ${json.message}` };
  const result = schema.safeParse(json.value);
  return result.success
    ? { success: true, value: result.data }
    : {
        success: false,
        message: `${path}\n${z.prettifyError(result.error)}`,
      };
};

export const templatesDir = (designDir: string, surface: Surface): string =>
  join(designDir, "templates", surface);

export const templateDir = (
  designDir: string,
  surface: Surface,
  name: string,
): string => join(templatesDir(designDir, surface), name);

export const templatePath = (
  designDir: string,
  surface: Surface,
  name: string,
): string => join(templateDir(designDir, surface, name), "template.json");

// そのテンプレートだけの CSS。任意
export const templateStylePath = (
  designDir: string,
  surface: Surface,
  name: string,
): string => join(templateDir(designDir, surface, name), "template.css");

export const samplePath = (
  designDir: string,
  surface: Surface,
  name: string,
): string => join(templateDir(designDir, surface, name), "sample.json");

// スライドのテンプレートに同梱する絵(assets/*.svg)。見本の image は src に assets/<ファイル> と書く
export const templateAssetsDir = (designDir: string, name: string): string =>
  join(templateDir(designDir, "slide", name), "assets");

export const TEMPLATE_ASSET_PATTERN = /^[a-z0-9][a-z0-9-]*\.svg$/;

// 同梱の絵のファイル名。assets/ が無ければ空
export const templateAssetNames = async (
  designDir: string,
  name: string,
): Promise<string[]> =>
  (
    await readdir(templateAssetsDir(designDir, name), {
      withFileTypes: true,
    }).catch(() => [])
  )
    .filter(
      (entry) => entry.isFile() && TEMPLATE_ASSET_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

const exists = (path: string): Promise<boolean> =>
  readFile(path).then(
    () => true,
    () => false,
  );

// template.json を持つフォルダの名前。形の違う名前も返し、読むときに止める
export const templateNames = async (
  designDir: string,
  surface: Surface,
): Promise<string[]> => {
  const entries = await readdir(templatesDir(designDir, surface), {
    withFileTypes: true,
  }).catch(() => []);
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) =>
        (await exists(templatePath(designDir, surface, entry.name)))
          ? [entry.name]
          : [],
      ),
  );
  return names.flat().sort();
};

// sample.json(中身の構成)を持つフォルダの名前。テンプレート(template.json)を持つかは問わない
export const outlineNames = async (designDir: string): Promise<string[]> => {
  const entries = await readdir(templatesDir(designDir, "slide"), {
    withFileTypes: true,
  }).catch(() => []);
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) =>
        (await exists(samplePath(designDir, "slide", entry.name)))
          ? [entry.name]
          : [],
      ),
  );
  return names.flat().sort();
};

export type DesignBase = { tokens: Tokens; components: Components };

export const componentsPath = (designDir: string): string =>
  join(designDir, "components.json");

// テンプレートが差分を当てる土台。tokens.json と components.json
export const readDesignBase = async (
  designDir: string,
): Promise<
  { success: true; base: DesignBase } | { success: false; message: string }
> => {
  const tokens = await parseFile(join(designDir, "tokens.json"), tokensSchema);
  if (!tokens.success) return tokens;
  const components = await parseFile(
    componentsPath(designDir),
    componentsSchema,
  );
  if (!components.success) return components;
  return {
    success: true,
    base: { tokens: tokens.value, components: components.value },
  };
};

export const selectionPath = (designDir: string): string =>
  join(designDir, "selection.json");

export const DEFAULT_SELECTION: Selection = {
  slide: DEFAULT_TEMPLATE,
  sheet: DEFAULT_TEMPLATE,
  document: DEFAULT_TEMPLATE,
};

export const readTemplate = <S extends Surface>(
  designDir: string,
  surface: S,
  name: string,
) =>
  parseFile<TemplateOf[S]>(
    templatePath(designDir, surface, name),
    templateSchemas[surface] as unknown as z.ZodType<TemplateOf[S]>,
  );

// スライドのテンプレートの中身の見本。無ければ undefined
export const readSlideSample = async (
  designDir: string,
  name: string,
): Promise<SlideSample | undefined> => {
  if (!isTemplateName(name)) return undefined;
  const path = samplePath(designDir, "slide", name);
  if (!(await exists(path))) return undefined;
  const sample = await parseFile(path, slideSampleSchema);
  return sample.success ? sample.value : undefined;
};

// 表示名が英語でない template.json(表示名を英語に決める前に作ったテンプレート)を、
// 識別子から作った名前へ書き換える。読む検査より先に回す。直したものを <区分>/<名前> で返す
export const migrateTemplateLabels = async (
  designDir: string,
): Promise<string[]> => {
  const fixed = await Promise.all(
    surfaceNames.map(async (surface) => {
      const names = (await templateNames(designDir, surface)).filter(
        isTemplateName,
      );
      const moved = await Promise.all(
        names.map(async (name) => {
          const path = templatePath(designDir, surface, name);
          const raw = await readFile(path, "utf8").catch(() => undefined);
          const parsed = (() => {
            try {
              return raw === undefined
                ? undefined
                : (JSON.parse(raw) as unknown);
            } catch {
              return undefined;
            }
          })();
          if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed) ||
            !("label" in parsed) ||
            typeof parsed.label !== "string" ||
            isTemplateLabel(parsed.label.trim())
          ) {
            return [];
          }
          await writeFile(
            path,
            `${JSON.stringify({ ...parsed, label: labelOfTemplateName(name) }, null, 2)}\n`,
            "utf8",
          );
          return [`${surface}/${name}`];
        }),
      );
      return moved.flat();
    }),
  );
  return fixed.flat();
};

const readSurfaceTemplates = async <S extends Surface>(
  designDir: string,
  surface: S,
): Promise<
  | { success: true; value: Record<string, TemplateOf[S]> }
  | { success: false; message: string }
> => {
  const names = await templateNames(designDir, surface);
  const badName = names.find((name) => !isTemplateName(name));
  if (badName) {
    return {
      success: false,
      message: `テンプレートの名前 ${surface}/${badName} は英小文字・数字・ハイフンにする(tokens は使えない)`,
    };
  }
  const files = await Promise.all(
    names.map((name) => readTemplate(designDir, surface, name)),
  );
  const failed = files.find((file) => !file.success);
  if (failed && !failed.success) return failed;
  return {
    success: true,
    value: Object.fromEntries(
      files.flatMap((file, index) =>
        file.success ? [[names[index] ?? "", file.value]] : [],
      ),
    ),
  };
};

// design/templates/<区分>/ のテンプレートをすべて読む
export const readTemplates = async (
  designDir: string,
): Promise<
  | { success: true; value: SurfaceTemplates }
  | { success: false; message: string }
> => {
  const slide = await readSurfaceTemplates(designDir, "slide");
  if (!slide.success) return slide;
  const sheet = await readSurfaceTemplates(designDir, "sheet");
  if (!sheet.success) return sheet;
  const document = await readSurfaceTemplates(designDir, "document");
  if (!document.success) return document;
  return {
    success: true,
    value: {
      slide: slide.value,
      sheet: sheet.value,
      document: document.value,
    },
  };
};

// 選択が templates/<区分>/ にあるものを指しているか
export const missingInSelection = (
  selection: Selection,
  templates: SurfaceTemplates,
): string | undefined => {
  const surface = surfaceNames.find(
    (name) => !(selection[name] in templates[name]),
  );
  return surface
    ? `区分 ${surface} のテンプレート ${selection[surface]} が templates/${surface}/ に無い`
    : undefined;
};

// 区分ごとの専用の CSS を読み、書けないもの(ownCssProblem・文書は documentOwnCssProblem も)があれば理由を返す
const readStyles = async (
  designDir: string,
  templates: SurfaceTemplates,
): Promise<
  | { success: true; value: Record<Surface, Record<string, string>> }
  | { success: false; message: string }
> => {
  const entries = await Promise.all(
    surfaceNames.flatMap((surface) =>
      Object.keys(templates[surface]).map(async (name) => {
        const path = templateStylePath(designDir, surface, name);
        const css = await readFile(path, "utf8").catch(() => undefined);
        return { surface, name, path, css };
      }),
    ),
  );
  const problems = entries.flatMap(({ surface, path, css }) => {
    const problem =
      css === undefined
        ? undefined
        : (ownCssProblem(css) ??
          (surface === "document" ? documentOwnCssProblem(css) : undefined));
    return problem ? [`${path}: ${problem}`] : [];
  });
  if (problems.length > 0)
    return { success: false, message: problems.join("\n") };
  return {
    success: true,
    value: Object.fromEntries(
      surfaceNames.map((surface) => [
        surface,
        Object.fromEntries(
          entries.flatMap(({ surface: own, name, css }) =>
            own === surface && css !== undefined && css.trim().length > 0
              ? [[name, css]]
              : [],
          ),
        ),
      ]),
    ) as Record<Surface, Record<string, string>>,
  };
};

// 区分ごとの既定のテンプレート。ファイルが無ければどの区分も default
export const readSelection = async (
  designDir: string,
): Promise<
  { success: true; value: Selection } | { success: false; message: string }
> => {
  const path = selectionPath(designDir);
  return (await exists(path))
    ? parseFile(path, selectionSchema)
    : { success: true, value: DEFAULT_SELECTION };
};

export const readDesign = async (
  designDir: string,
): Promise<ReadDesignResult> => {
  const base = await readDesignBase(designDir);
  if (!base.success) return base;
  const { tokens, components } = base.base;
  const templates = await readTemplates(designDir);
  if (!templates.success) return templates;
  const resolved = surfaceNames.flatMap((surface) =>
    Object.entries(templates.value[surface] as Record<string, Template>).map(
      ([name, template]) =>
        resolveTemplate(surface, name, template, tokens, components),
    ),
  );
  const failed = resolved.find((result) => !result.success);
  if (failed && !failed.success) return failed;
  const selection = await readSelection(designDir);
  if (!selection.success) return selection;
  const missing = missingInSelection(selection.value, templates.value);
  if (missing) {
    return { success: false, message: `design/selection.json: ${missing}` };
  }
  const styles = await readStyles(designDir, templates.value);
  if (!styles.success) return styles;
  const all = resolved.flatMap((result) =>
    result.success ? [result.template] : [],
  );
  return {
    success: true,
    design: {
      tokens,
      components,
      templates: templates.value,
      resolved: Object.fromEntries(
        surfaceNames.map((surface) => [
          surface,
          all.filter((template) => template.surface === surface),
        ]),
      ) as Record<Surface, ResolvedTemplate[]>,
      selection: selection.value,
      styles: styles.value,
    },
  };
};

// --gad-*(質問票の旧い変数)を新しい変数へ写す対応表。移行期のみ
const gadCompatSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9-]*$/),
  z.string().min(1),
);

const gadCompatCss = async (designDir: string): Promise<string> => {
  const map = await parseFile(
    join(designDir, "gad-compat.json"),
    gadCompatSchema,
  );
  if (!map.success) throw new Error(map.message);
  return [
    `/* ${GENERATED_NOTE}(元: design/gad-compat.json。移行期のみ) */`,
    ":root {",
    ...Object.entries(map.value).map(
      ([name, value]) => `  --gad-${name}: ${value};`,
    ),
    "}",
    "",
  ].join("\n");
};

// 図の生成器。質問票が写して import する。見本の HTML は design-samples.ts が作る
export const FIGURE_FILES = [
  "figure/render.mjs",
  "figure/render.d.mts",
  "figure/deliver.mjs",
  "figure/schema.json",
] as const;

export const figureExamples = async (designDir: string): Promise<string[]> =>
  (await readdir(join(designDir, "figure", "examples")))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => `figure/examples/${file}`);

const copyAsIs = async (
  designDir: string,
  paths: readonly string[],
): Promise<(readonly [string, string])[]> =>
  Promise.all(
    paths.map(
      async (path) =>
        [
          `dist/${path}`,
          await readFile(join(designDir, path), "utf8"),
        ] as const,
    ),
  );

const generatedCss = async (designDir: string, name: string) =>
  [
    `dist/${name}`,
    `/* ${GENERATED_NOTE}(元: design/${name}) */\n${await readFile(join(designDir, name), "utf8")}`,
  ] as const;

// 区分ごとの CSS。テンプレートごとの <名前>.css(変数+専用の CSS)と、既定のテンプレートの写し(tokens.css)。
// 写しは、テンプレートを指定しない書き出しと外の写し(質問票・文書のスキル)が読む
const surfaceCss = (design: Design): (readonly [string, string])[] =>
  surfaceNames.flatMap((surface) => {
    const css = (template: ResolvedTemplate) =>
      templateCss(template, design.styles[surface][template.name]);
    return [
      ...design.resolved[surface].map(
        (template) =>
          [`dist/${surface}/${template.name}.css`, css(template)] as const,
      ),
      ...design.resolved[surface]
        .filter((template) => template.name === design.selection[surface])
        .map(
          (template) => [`dist/${surface}/tokens.css`, css(template)] as const,
        ),
    ];
  });

// 画面が読むスライドの専用の CSS。変数はスライドの inline style が持つので、閉じ込めた規則だけを1枚にまとめる
const slideTemplatesCss = (design: Design): string =>
  [
    `/* ${GENERATED_NOTE}(スライドのテンプレートの専用の CSS。元: design/templates/slide/<名前>/template.css) */`,
    ...design.resolved.slide.flatMap((template) => {
      const own = design.styles.slide[template.name];
      return own ? [templateOwnCss("slide", template.name, own)] : [];
    }),
  ].join("\n");

// 区分ごとのテンプレートの一覧。外の写しが名前と表示名を出し、質問票は骨格の元(base)を読む
const surfaceIndex = (design: Design): (readonly [string, string])[] =>
  surfaceNames.map((surface) => [
    `dist/${surface}/templates.json`,
    `${JSON.stringify(
      {
        default: design.selection[surface],
        templates: Object.fromEntries(
          Object.entries(design.templates[surface] as Record<string, Template>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, template]) => [
              name,
              {
                label: template.label,
                ...(template.description
                  ? { description: template.description }
                  : {}),
                ...(template.layout && "base" in template.layout
                  ? { base: template.layout.base }
                  : {}),
              },
            ]),
        ),
      },
      null,
      2,
    )}\n`,
  ]);

// dist に置くファイル。キーは design/ からの相対パス
export const cssOutputs = async (
  designDir: string,
  design: Design,
): Promise<Map<string, string>> =>
  new Map([
    ...surfaceCss(design),
    ...surfaceIndex(design),
    ["dist/app.css", appCss(resolveBase(design.tokens, design.components))],
    ["dist/slide-templates.css", `${slideTemplatesCss(design).trimEnd()}\n`],
    await generatedCss(designDir, "slide.css"),
    await generatedCss(designDir, "document.css"),
    await generatedCss(designDir, "interaction.css"),
    ["dist/gad-compat.css", await gadCompatCss(designDir)],
    ...(await copyAsIs(designDir, [
      ...FIGURE_FILES,
      ...(await figureExamples(designDir)),
    ])),
    // 画面がスライドへテンプレートを当てるときに読む。区分ごとの既定と、スライドのテンプレートの変数
    [
      "dist/templates.json",
      `${JSON.stringify(
        {
          selection: design.selection,
          slide: Object.fromEntries(
            design.resolved.slide.map((template) => [
              template.name,
              {
                label: template.label,
                variables: Object.fromEntries(templateVariables(template)),
              },
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    ],
  ]);

export const writeOutputs = async (
  designDir: string,
  outputs: ReadonlyMap<string, string>,
): Promise<string[]> =>
  Promise.all(
    [...outputs].map(async ([path, content]) => {
      const target = join(designDir, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
      return path;
    }),
  );

// 消えたテンプレートの CSS を残さない。段 I より前の tokens.<名前>.css と themes.json も消す
const pruneOutputs = async (
  designDir: string,
  outputs: ReadonlyMap<string, string>,
): Promise<void> => {
  const stale = async (folder: string, pattern: RegExp) =>
    (await readdir(join(designDir, "dist", folder)).catch(() => []))
      .filter((file) => pattern.test(file))
      .map((file) => `dist/${folder}${file}`)
      .filter((path) => !outputs.has(path));
  const paths = (
    await Promise.all([
      stale("", /^(tokens\..+\.css|themes\.json)$/),
      ...surfaceNames.map((surface) => stale(`${surface}/`, /\.(css|json)$/)),
    ])
  ).flat();
  await Promise.all(paths.map((path) => rm(join(designDir, path))));
};

export type BuildResult =
  | { success: true; files: string[] }
  | { success: false; message: string };

// CSS だけを作り直す。見本(samples/)は design-samples.ts が作る
export const buildDesignCss = async (
  designDir: string,
): Promise<BuildResult> => {
  await migrateTemplateLabels(designDir);
  const design = await readDesign(designDir);
  if (!design.success) return design;
  const outputs = await cssOutputs(designDir, design.design);
  await pruneOutputs(designDir, outputs);
  return { success: true, files: await writeOutputs(designDir, outputs) };
};
