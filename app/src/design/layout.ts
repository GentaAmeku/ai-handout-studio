import type {
  DocumentLayout,
  LayoutSurface,
  SheetLayout,
} from "../schema/design.ts";
import type { CssVariable } from "./theme.ts";

// テンプレートの骨格を CSS 変数へ解く。build(区分の CSS)とデザインページの見本が同じ関数を使う

const px = (value: number): string => `${value}px`;

// 文書の脇(用語表・目次を置く列)の既定の幅。1列の型でも紙の幅の計算(document.css)に使う
const DOC_ASIDE_WIDTH = 228;

// 本文(main)を置いた列。スキーマが1つの列に限っている
export const mainColumn = (layout: DocumentLayout): number =>
  Math.max(
    0,
    layout.areas
      .flatMap((row) => row.flatMap((area, x) => (area === "main" ? [x] : [])))
      .at(0) ?? 0,
  );

// 脇(用語表)のためだけにある列。ほかの行が本文と同じ領域か空なら、脇の無い資料では畳める
const foldableColumn = (
  layout: DocumentLayout,
  main: number,
): number | undefined => {
  const index = layout.columns.findIndex(
    (_, x) =>
      x !== main &&
      layout.areas.some((row) => row[x] === "aside") &&
      layout.areas.every(
        (row) => row[x] === "aside" || row[x] === "." || row[x] === row[main],
      ),
  );
  return index === -1 ? undefined : index;
};

const areasValue = (areas: DocumentLayout["areas"]): string =>
  areas.map((row) => `"${row.join(" ")}"`).join(" ");

// 本文・脇・目次の並び。document.css は .ds-cols を grid にし、この値を読む。
// 脇を持たない資料のぶん(--doc-*-no-aside)も一緒に渡す
export const documentLayoutVariables = (
  layout: DocumentLayout,
): CssVariable[] => {
  const main = mainColumn(layout);
  const side =
    layout.columns.find((_, index) => index !== main) ?? DOC_ASIDE_WIDTH;
  const used = new Set(layout.areas.flat());
  const columns = layout.columns
    .map((_, index) =>
      // 本文の列は固定幅にせず、頁の幅いっぱいまで広げる
      index === main ? "minmax(0, 1fr)" : "var(--doc-aside-width)",
    )
    .join(" ");
  const folded = foldableColumn(layout, main);
  return [
    ["--doc-measure", px(layout.columns[main] ?? 0)],
    ["--doc-aside-width", px(side)],
    ["--doc-aside-display", used.has("aside") ? "block" : "none"],
    ["--doc-toc-display", used.has("toc") ? "block" : "none"],
    ["--doc-columns", columns],
    // 脇の列を畳んだら、本文は紙の幅いっぱい(題名・要約と同じ幅)まで広がる
    [
      "--doc-columns-no-aside",
      folded === undefined ? columns : "minmax(0, 1fr)",
    ],
    [
      "--doc-rows",
      layout.areas
        .map((_, index) => (index === layout.areas.length - 1 ? "1fr" : "auto"))
        .join(" "),
    ],
    ["--doc-areas", areasValue(layout.areas)],
    [
      "--doc-areas-no-aside",
      areasValue(
        folded === undefined
          ? layout.areas
          : layout.areas.map((row) => row.filter((_, x) => x !== folded)),
      ),
    ],
  ];
};

// 質問票のダイアログの幅(--doc-measure)。型では変えない
const SHEET_MEASURE = 640;

// 質問票の型。interaction.css は一覧の列(--doc-aside-width)と --board-* を読む。
// 文書と同じ --doc-* も、段 H より前の tokens.css と同じ値で残す。
// 移動の帯は下に固定したので、帯の位置の変数は出さない
export const sheetLayoutVariables = (layout: SheetLayout): CssVariable[] => {
  const left = layout.list.side === "left";
  return [
    ...documentLayoutVariables({
      columns: [SHEET_MEASURE, layout.list.width],
      areas: [
        ["toc", "toc"],
        ["main", "aside"],
      ],
    }),
    ["--board-width", px(layout.width)],
    [
      "--board-columns",
      left
        ? "var(--doc-aside-width) minmax(0, 1fr)"
        : "minmax(0, 1fr) var(--doc-aside-width)",
    ],
    ["--board-list-order", left ? "0" : "1"],
    [
      "--board-content-width",
      layout.content === null ? "none" : px(layout.content),
    ],
  ];
};

// 区分と骨格の組はスキーマで確かめてから渡す(文書の区分に質問票の骨格を渡さない)
export const layoutVariables = (
  surface: LayoutSurface,
  layout: DocumentLayout | SheetLayout,
): CssVariable[] =>
  surface === "document"
    ? documentLayoutVariables(layout as DocumentLayout)
    : sheetLayoutVariables(layout as SheetLayout);
