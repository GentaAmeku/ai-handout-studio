import type { HandoutKind } from "../../api/types";

// 質問票と HTML 資料の資料一覧と1件の経路
export const sectionListPath = {
  sheet: "/sheets",
  document: "/documents",
} as const satisfies Record<HandoutKind, string>;

export const sectionDetailPath = {
  sheet: "/sheets/$id",
  document: "/documents/$id",
} as const satisfies Record<HandoutKind, string>;
