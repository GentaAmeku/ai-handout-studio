import type { LayoutOf, LayoutSurface } from "../schema/design.ts";

// 用意した骨格。段 H の design/layouts/ の型をここへ移した。
// 旧い型の移行(同じ値の型はテンプレートにしない)と、テンプレートの編集で骨格を選ぶときに使う
export const LAYOUT_PRESETS: {
  [S in LayoutSurface]: Record<string, { label: string; layout: LayoutOf[S] }>;
} = {
  document: {
    standard: {
      label: "標準(目次は上、脇は右)",
      layout: {
        columns: [640, 228],
        areas: [
          ["toc", "toc"],
          ["main", "aside"],
        ],
      },
    },
    single: {
      label: "1列",
      layout: { columns: [720], areas: [["toc"], ["main"]] },
    },
    "side-toc": {
      label: "目次を左に",
      layout: {
        columns: [220, 640],
        areas: [
          ["toc", "main"],
          ["aside", "main"],
        ],
      },
    },
  },
  sheet: Object.fromEntries(
    (
      [
        ["focus", "1問ずつ"],
        ["overview", "一覧を開いたまま"],
        ["all", "全問を並べる"],
        ["print", "紙に書き込む"],
      ] as const
    ).map(([base, label]) => [
      base,
      {
        label,
        layout: {
          base,
          width: 1280,
          list: { width: 228, side: "left" },
          content: null,
        },
      },
    ]),
  ),
};

// 既定の骨格。段 H より前の骨格と同じ値
export const DEFAULT_LAYOUTS: LayoutOf = {
  document: LAYOUT_PRESETS.document.standard?.layout as LayoutOf["document"],
  sheet: LAYOUT_PRESETS.sheet.focus?.layout as LayoutOf["sheet"],
};
