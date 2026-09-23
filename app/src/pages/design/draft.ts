import type { DesignTemplatesDetail } from "../../api/types";
import {
  type ResolvedTemplate,
  resolveTemplate,
  templateVariables,
} from "../../design/theme";
import {
  isTemplateName as isTemplateNameValue,
  type Surface,
  type Template,
} from "../../schema/design";

// デザインページの編集中のテンプレート。テンプレートを解いて見本へ当てる変数を作る関数。
// 値を変える操作は画面から外した。値は AI にファイルを直してもらう

export type DesignBase = Pick<DesignTemplatesDetail, "tokens" | "components">;

export const resolveDraft = (
  surface: Surface,
  name: string,
  template: Template,
  base: DesignBase,
): ResolvedTemplate | undefined => {
  const result = resolveTemplate(
    surface,
    name,
    template,
    base.tokens,
    base.components,
  );
  return result.success ? result.template : undefined;
};

// 見本に当てる変数(スライドは inline style、質問票と文書は iframe の :root)
export const draftVariables = (
  resolved: ResolvedTemplate,
): Record<string, string> => Object.fromEntries(templateVariables(resolved));

// 値としての同じさ。キーの順と、空の区分({})の有無は問わない
const canonical = (value: unknown): unknown =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .map(([key, item]) => [key, canonical(item)] as const)
          .filter(
            ([, item]) =>
              item !== undefined &&
              !(
                typeof item === "object" &&
                item !== null &&
                !Array.isArray(item) &&
                Object.keys(item).length === 0
              ),
          )
          .sort(([a], [b]) => a.localeCompare(b)),
      )
    : value;

export const sameTemplate = (a: Template, b: Template): boolean =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// 新しいテンプレートの名前。deck.json の template と同じ規則(tokens は使えない)
export const isTemplateName = (name: string): boolean =>
  isTemplateNameValue(name);
