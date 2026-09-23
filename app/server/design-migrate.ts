import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_LAYOUTS,
  LAYOUT_PRESETS,
} from "../src/design/layout-presets.ts";
import { mergeComponents } from "../src/design/theme.ts";
import {
  type DocumentLayout,
  isTemplateName,
  type LayoutOf,
  type LayoutSurface,
  layoutSchemas,
  layoutSurfaceNames,
  type Selection,
  type Surface,
  surfaceNames,
  type Template,
  type ThemeComponents,
  type ThemeTokens,
  templateSchemas,
} from "../src/schema/design.ts";
import {
  DEFAULT_SELECTION,
  selectionPath,
  templateDir,
  templateNames,
  templatePath,
} from "./design.ts";
import { writeJsonAtomic } from "./workspace.ts";

// 段 I より前のテンプレート(design/themes/・design/layouts/・selection.json の layouts)を、
// 区分ごとのテンプレート(design/templates/<区分>/<名前>/template.json)へ移す。起動時と build の前に回す。
// どの区分の生成 CSS の変数も移行の前後で同じになるように、テーマの共通の値と面の上書きを区分ごとに解いて書く

// 段 H より前のテーマは、文書の骨格(surfaces.document.layout)を持っていた
const legacyDocumentLayoutSchema = z.object({
  measure: z.number().int().positive(),
  aside: z.boolean(),
  toc: z.enum(["top", "side", "none"]),
});

type LegacyDocumentLayout = z.infer<typeof legacyDocumentLayoutSchema>;

const tokenGroups = z.record(z.string(), z.record(z.string(), z.unknown()));

const legacyOverrideSchema = z.looseObject({
  tokens: tokenGroups.optional(),
  components: z.record(z.string(), z.unknown()).optional(),
  layout: legacyDocumentLayoutSchema.optional(),
});

const legacyThemeSchema = z.looseObject({
  tokens: tokenGroups.optional(),
  components: z.record(z.string(), z.unknown()).default({}),
  surfaces: z
    .looseObject({
      slide: legacyOverrideSchema.default({}),
      sheet: legacyOverrideSchema.default({}),
      document: legacyOverrideSchema.default({}),
    })
    .default({ slide: {}, sheet: {}, document: {} }),
});

type LegacyTheme = z.infer<typeof legacyThemeSchema>;

const legacySelectionSchema = z.looseObject({
  slide: z.string().optional(),
  sheet: z.string().optional(),
  document: z.string().optional(),
  layouts: z
    .looseObject({
      document: z.string().optional(),
      sheet: z.string().optional(),
    })
    .optional(),
});

// 段 H より前の脇の幅
const LEGACY_ASIDE_WIDTH = 228;

// 旧い骨格と同じ grid になる文書の骨格。本文・脇・目次の並びは段 H より前の docGrid と同じ
export const legacyToLayout = (
  legacy: LegacyDocumentLayout,
): DocumentLayout => {
  const side = legacy.aside || legacy.toc === "side";
  const sideAreas = [
    ...(legacy.toc === "side" ? (["toc"] as const) : []),
    ...(legacy.aside ? (["aside"] as const) : []),
  ];
  const rows: DocumentLayout["areas"] = side
    ? sideAreas.map((area) => ["main", area])
    : [["main"]];
  const top: DocumentLayout["areas"] =
    legacy.toc === "top" ? [side ? ["toc", "toc"] : ["toc"]] : [];
  return {
    columns: side ? [legacy.measure, LEGACY_ASIDE_WIDTH] : [legacy.measure],
    areas: [...top, ...rows],
  };
};

const readJson = async (path: string): Promise<unknown> => {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const jsonNames = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch(() => []))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();

const legacyThemesDir = (designDir: string) => join(designDir, "themes");
const legacyLayoutsDir = (designDir: string) => join(designDir, "layouts");

type LegacyLayout<S extends LayoutSurface> = {
  name: string;
  label: string;
  layout: LayoutOf[S];
};

// 段 H の型。label を外して今の骨格の形で確かめる。形の違うものは読み飛ばす
const readLegacyLayouts = async <S extends LayoutSurface>(
  designDir: string,
  surface: S,
): Promise<LegacyLayout<S>[]> => {
  const dir = join(legacyLayoutsDir(designDir), surface);
  const entries = await Promise.all(
    (await jsonNames(dir)).filter(isTemplateName).map(async (name) => {
      const raw = await readJson(join(dir, `${name}.json`));
      if (typeof raw !== "object" || raw === null) return [];
      const { label, ...rest } = raw as { label?: unknown };
      const layout = layoutSchemas[surface].safeParse(rest);
      return layout.success
        ? [
            {
              name,
              label:
                typeof label === "string" && label.trim().length > 0
                  ? label.trim().slice(0, 40)
                  : name,
              layout: layout.data as LayoutOf[S],
            },
          ]
        : [];
    }),
  );
  return entries.flat();
};

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const isPreset = (surface: LayoutSurface, layout: unknown): boolean =>
  Object.values(LAYOUT_PRESETS[surface]).some((preset) =>
    sameValue(preset.layout, layout),
  );

// テーマの共通の値に面の上書きを重ねた差分
const mergeLegacyTokens = (
  theme: LegacyTheme,
  surface: Surface,
): ThemeTokens | undefined => {
  const common = theme.tokens ?? {};
  const override = theme.surfaces[surface].tokens ?? {};
  const groups = [
    ...new Set([...Object.keys(common), ...Object.keys(override)]),
  ];
  const merged = Object.fromEntries(
    groups
      .map(
        (group) => [group, { ...common[group], ...override[group] }] as const,
      )
      .filter(([, values]) => Object.keys(values).length > 0),
  );
  return Object.keys(merged).length > 0 ? (merged as ThemeTokens) : undefined;
};

type Planned = {
  surface: Surface;
  // 元のテーマか型の名前
  from: string;
  fromTheme: boolean;
  template: Template;
};

export type TemplateMigration =
  | { migrated: false }
  | { migrated: true; templates: string[] }
  | { migrated: false; error: string };

// 移す先の名前。同じ名前のテンプレートが既にあれば、後ろに -migrated を付ける
const freeName = (taken: ReadonlySet<string>, name: string): string =>
  taken.has(name) ? freeName(taken, `${name}-migrated`) : name;

const hasLegacyFiles = async (designDir: string): Promise<boolean> =>
  (await readdir(legacyThemesDir(designDir)).catch(() => undefined)) !==
    undefined ||
  (await readdir(legacyLayoutsDir(designDir)).catch(() => undefined)) !==
    undefined;

export const migrateToTemplates = async (
  designDir: string,
): Promise<TemplateMigration> => {
  const rawSelection = await readJson(selectionPath(designDir));
  const legacySelection = legacySelectionSchema.safeParse(rawSelection ?? {});
  const oldSelection = legacySelection.success ? legacySelection.data : {};
  if (
    !(await hasLegacyFiles(designDir)) &&
    oldSelection.layouts === undefined
  ) {
    return { migrated: false };
  }

  const themeNames = (await jsonNames(legacyThemesDir(designDir))).filter(
    isTemplateName,
  );
  const themes = (
    await Promise.all(
      themeNames.map(async (name) => {
        const parsed = legacyThemeSchema.safeParse(
          await readJson(join(legacyThemesDir(designDir), `${name}.json`)),
        );
        return parsed.success ? [{ name, theme: parsed.data }] : [];
      }),
    )
  ).flat();
  if (themes.length !== themeNames.length) {
    return {
      migrated: false,
      error:
        "design/themes/ に読めないテーマがあるので、テンプレートへ移せない",
    };
  }
  const themeFor = (surface: Surface) => {
    const chosen = oldSelection[surface];
    return (
      themes.find((entry) => entry.name === chosen) ??
      themes.find((entry) => entry.name === DEFAULT_SELECTION[surface]) ??
      themes[0]
    );
  };

  // 区分ごとに選ばれていた骨格。どのテーマの CSS にも、この骨格の変数が載っていた
  const legacyLayouts = {
    document: await readLegacyLayouts(designDir, "document"),
    sheet: await readLegacyLayouts(designDir, "sheet"),
  };
  const stageHLayout = themeFor("document")?.theme.surfaces.document.layout;
  const selectedLayout = <S extends LayoutSurface>(surface: S): LayoutOf[S] => {
    if (surface === "document" && stageHLayout) {
      return legacyToLayout(stageHLayout) as LayoutOf[S];
    }
    const name =
      oldSelection.layouts?.[surface] ??
      (surface === "document" ? "standard" : "focus");
    const found = (legacyLayouts[surface] as LegacyLayout<S>[]).find(
      (entry) => entry.name === name,
    );
    return found?.layout ?? (DEFAULT_LAYOUTS[surface] as LayoutOf[S]);
  };

  const templateFrom = (
    surface: Surface,
    theme: LegacyTheme,
    label: string,
    layout?: LayoutOf[LayoutSurface],
  ): Template => {
    const tokens = mergeLegacyTokens(theme, surface);
    return {
      label,
      ...(tokens ? { tokens } : {}),
      components: mergeComponents(
        theme.components as ThemeComponents,
        (theme.surfaces[surface].components ?? {}) as ThemeComponents,
      ),
      ...(surface === "slide"
        ? {}
        : { layout: layout ?? selectedLayout(surface) }),
    };
  };

  // テーマは区分ごとに1つずつのテンプレートになる
  const fromThemes: Planned[] = themes.flatMap(({ name, theme }) =>
    surfaceNames.map((surface) => ({
      surface,
      from: name,
      fromTheme: true,
      template: templateFrom(
        surface,
        theme,
        name === "default" ? "AI Handout Studio Design" : name,
      ),
    })),
  );
  // 選ばれていない型のうち用意した骨格と違うものは、その区分で選ばれていたテーマの値でテンプレートにする
  const fromLayouts: Planned[] = layoutSurfaceNames.flatMap((surface) => {
    const base = themeFor(surface);
    if (!base) return [];
    const selected = selectedLayout(surface);
    return legacyLayouts[surface]
      .filter(
        (entry) =>
          !sameValue(entry.layout, selected) &&
          !isPreset(surface, entry.layout),
      )
      .map((entry) => ({
        surface,
        from: entry.name,
        fromTheme: false,
        template: templateFrom(surface, base.theme, entry.label, entry.layout),
      }));
  });

  const existing = Object.fromEntries(
    await Promise.all(
      surfaceNames.map(
        async (surface) =>
          [surface, new Set(await templateNames(designDir, surface))] as const,
      ),
    ),
  ) as Record<Surface, Set<string>>;
  const planned = [...fromThemes, ...fromLayouts].reduce<{
    taken: Record<Surface, Set<string>>;
    list: (Planned & { name: string })[];
  }>(
    (state, entry) => {
      const name = freeName(state.taken[entry.surface], entry.from);
      return {
        taken: {
          ...state.taken,
          [entry.surface]: new Set([...state.taken[entry.surface], name]),
        },
        list: [...state.list, { ...entry, name }],
      };
    },
    { taken: existing, list: [] },
  );

  const invalid = planned.list.find(
    (entry) =>
      !templateSchemas[entry.surface].safeParse(entry.template).success,
  );
  if (invalid) {
    return {
      migrated: false,
      error: `${invalid.from} を区分 ${invalid.surface} のテンプレートへ移せない(形が合わない)`,
    };
  }

  await Promise.all(
    planned.list.map(async (entry) => {
      await mkdir(templateDir(designDir, entry.surface, entry.name), {
        recursive: true,
      });
      await writeJsonAtomic(
        templatePath(designDir, entry.surface, entry.name),
        entry.template,
      );
    }),
  );

  // 選んでいたテーマを、移した先のテンプレートの名前へ引き直す。移すテーマに無い名前は
  // (既にテンプレートとしてあるなら)そのまま使い、見つからなければ default、それも無ければ最初のテンプレート
  const selection = Object.fromEntries(
    await Promise.all(
      surfaceNames.map(async (surface) => {
        const names = await templateNames(designDir, surface);
        const moved = planned.list.find(
          (entry) =>
            entry.surface === surface &&
            entry.fromTheme &&
            entry.from === oldSelection[surface],
        )?.name;
        const wanted = moved ?? oldSelection[surface];
        const name =
          wanted && names.includes(wanted)
            ? wanted
            : names.includes(DEFAULT_SELECTION[surface])
              ? DEFAULT_SELECTION[surface]
              : (names[0] ?? DEFAULT_SELECTION[surface]);
        return [surface, name] as const;
      }),
    ),
  ) as Selection;
  await writeJsonAtomic(selectionPath(designDir), selection);

  await rm(legacyThemesDir(designDir), { recursive: true, force: true });
  await rm(legacyLayoutsDir(designDir), { recursive: true, force: true });
  return {
    migrated: true,
    templates: planned.list.map((entry) => `${entry.surface}/${entry.name}`),
  };
};
