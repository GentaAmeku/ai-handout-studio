import type { CSSProperties } from "react";
import { z } from "zod";
import templatesJson from "../../../design/dist/templates.json";
import { DEFAULT_TEMPLATE, selectionSchema, themeName } from "../schema/design";

// 画面から見えるスライドのテンプレート。pnpm design:build が作る design/dist/templates.json を読む。
// 区分ごとの既定と、スライドのテンプレートの表示名・変数を持つ。
// 形の古いファイル(build の途中)は空として読み、既定のテンプレートに倒す
const registrySchema = z.strictObject({
  selection: selectionSchema,
  slide: z.record(
    themeName,
    z.strictObject({
      label: z.string(),
      variables: z.record(z.string(), z.string()),
    }),
  ),
});

const parsed = registrySchema.safeParse(templatesJson);

const registry: z.infer<typeof registrySchema> = parsed.success
  ? parsed.data
  : {
      selection: {
        slide: DEFAULT_TEMPLATE,
        sheet: DEFAULT_TEMPLATE,
        document: DEFAULT_TEMPLATE,
      },
      slide: {},
    };

// 見つからない名前は飛ばし、スライドの既定のテンプレート、最後は default に倒す
export const resolveTemplateName = (
  ...candidates: (string | undefined)[]
): string =>
  [...candidates, registry.selection.slide].find(
    (name) => name !== undefined && name in registry.slide,
  ) ?? DEFAULT_TEMPLATE;

export const templateLabel = (name: string): string =>
  registry.slide[name]?.label ?? name;

// アプリの :root は画面の変数(dist/app.css)なので、スライドには必ずテンプレートの変数を当てる
export const templateStyle = (name: string): CSSProperties =>
  (registry.slide[name]?.variables ?? {}) as CSSProperties;
