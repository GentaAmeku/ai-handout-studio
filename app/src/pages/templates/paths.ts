import type { Surface } from "../../schema/design";

// 区分ごとのテンプレートの一覧と編集の経路
export const templateListPath = {
  slide: "/slides/templates",
  sheet: "/sheets/templates",
  document: "/documents/templates",
} as const satisfies Record<Surface, string>;

export const templateEditPath = {
  slide: "/slides/templates/$name",
  sheet: "/sheets/templates/$name",
  document: "/documents/templates/$name",
} as const satisfies Record<Surface, string>;
