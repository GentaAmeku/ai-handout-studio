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

// 升目の並び。layout.ts の中で、列を畳む・3列目を本文の下へ回す・題名の塊の行を足すときに使う。
// 領域の名前は文書の領域(main・toc・aside・.)に、題名の塊の signature・head・summary・foot が加わる
type Grid = {
  readonly columns: readonly number[];
  readonly areas: readonly (readonly string[])[];
};

// 本文(main)を置いた列。スキーマが1つの列に限っている
export const mainColumn = (layout: Grid): number =>
  Math.max(
    0,
    layout.areas
      .flatMap((row) => row.flatMap((area, x) => (area === "main" ? [x] : [])))
      .at(0) ?? 0,
  );

// 脇(用語表)のためだけにある列。ほかの行が本文と同じ領域か空なら、脇の無い資料では畳める
const foldableColumn = (layout: Grid, main: number): number | undefined => {
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

const withoutColumn = (grid: Grid, index: number): Grid => ({
  columns: grid.columns.filter((_, x) => x !== index),
  areas: grid.areas.map((row) => row.filter((_, x) => x !== index)),
});

// 脇の無い資料の並び。脇のためだけの列を畳む(畳める列が無ければそのまま)
const folded = (grid: Grid): Grid => {
  const index = foldableColumn(grid, mainColumn(grid));
  return index === undefined ? grid : withoutColumn(grid, index);
};

// row の下に足す行。本文の列の升目と、それと同じ領域で左右につながる升目を name にし、ほかはそのまま伸ばす
// (伸ばした領域も、name の領域も長方形のまま)
const rowBelow = (
  row: readonly string[],
  main: number,
  name: string,
): string[] => {
  const under = row[main];
  return row.map((cell, x) =>
    row
      .slice(Math.min(x, main), Math.max(x, main) + 1)
      .every((other) => other === under)
      ? name
      : cell,
  );
};

// 幅 1080px 以下の3列の並び。本文でない右端の列(3列目。本文が3列目なら2列目)を外し、
// その列にだけあった領域を、本文の列の下へ1行ずつ足す。2列以下は変えない
const narrowed = (grid: Grid): Grid | undefined => {
  if (grid.columns.length < 3) return undefined;
  const main = mainColumn(grid);
  const moved = grid.columns
    .map((_, x) => x)
    .filter((x) => x !== main)
    .at(-1);
  if (moved === undefined) return undefined;
  const rest = withoutColumn(grid, moved);
  const kept = new Set(rest.areas.flat());
  const below = [...new Set(grid.areas.map((row) => row[moved] ?? "."))].filter(
    (area) => area !== "." && !kept.has(area),
  );
  const restMain = mainColumn(rest);
  // 足す行はどれも最後の行から作る。足した領域は外した列にだけあったので、つながる範囲は行ごとに同じ
  const last = rest.areas.at(-1) ?? [];
  return {
    columns: rest.columns,
    areas: [
      ...rest.areas,
      ...below.map((area) => rowBelow(last, restMain, area)),
    ],
  };
};

// 題名の塊を本文の列に置くときの領域。本文の最初の行の上に署名・題名・要約の行を、最後の行の下に末尾の行を足す。
// 目次や脇の列はその行にも伸びるので、ページの上から下までの領域を持つ
const HEAD_AREAS = ["signature", "head", "summary"] as const;

// 行の高さ。最後の行だけ残りを取り、ほかは中身の高さ(前からの --doc-rows と同じ決まり)
const rowSizes = (count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    index === count - 1 ? "1fr" : "auto",
  );

const withHead = (grid: Grid): { areas: Grid["areas"]; rows: string[] } => {
  const main = mainColumn(grid);
  const top = Math.max(
    0,
    grid.areas.findIndex((row) => row[main] === "main"),
  );
  const first = grid.areas[top] ?? [];
  const rows = rowSizes(grid.areas.length);
  return {
    areas: [
      ...grid.areas.slice(0, top),
      ...HEAD_AREAS.map((name) =>
        first.map((cell) => (cell === "main" ? name : cell)),
      ),
      ...grid.areas.slice(top),
      rowBelow(grid.areas.at(-1) ?? [], main, "foot"),
    ],
    rows: [
      ...rows.slice(0, top),
      ...HEAD_AREAS.map(() => "auto"),
      ...rows.slice(top),
      "auto",
    ],
  };
};

const areasValue = (areas: Grid["areas"]): string =>
  areas.map((row) => `"${row.join(" ")}"`).join(" ");

// 題名の塊を本文の列へ置く型のページの升目。.ds-page を grid にし、.ds-cols を畳んで(display: contents)
// 目次・本文・脇を署名・題名・要約・末尾と同じ升目に並べる。列の幅は .ds-cols と同じ --doc-columns* を読む
const pageVariables = (
  layout: DocumentLayout,
  narrow: Grid | undefined,
): CssVariable[] => {
  const full = withHead(layout);
  return [
    ["--doc-page-display", "grid"],
    ["--doc-cols-display", "contents"],
    ["--doc-page-rows", full.rows.join(" ")],
    ["--doc-page-areas", areasValue(full.areas)],
    ["--doc-page-areas-no-aside", areasValue(withHead(folded(layout)).areas)],
    ...(narrow === undefined
      ? []
      : ([
          ["--doc-page-rows-narrow", withHead(narrow).rows.join(" ")],
          ["--doc-page-areas-narrow", areasValue(withHead(narrow).areas)],
          [
            "--doc-page-areas-narrow-no-aside",
            areasValue(withHead(folded(narrow)).areas),
          ],
        ] satisfies CssVariable[])),
  ];
};

// 本文・脇・目次の並び。document.css は .ds-cols を grid にし、この値を読む。
// 脇を持たない資料のぶん(--doc-*-no-aside)も一緒に渡す。
// 3列の型は幅 1080px 以下の並び(--doc-*-narrow)も、題名の塊を本文の列へ置く型(head: main)は
// ページ(.ds-page)の升目(--doc-page-*)も渡す。2列以下で head が page の型は、前と同じ値だけを出す
export const documentLayoutVariables = (
  layout: DocumentLayout,
): CssVariable[] => {
  const main = mainColumn(layout);
  const side =
    layout.columns.find((_, index) => index !== main) ?? DOC_ASIDE_WIDTH;
  const used = new Set(layout.areas.flat());
  const three = layout.columns.length === 3;
  // 本文の列は固定幅にせず、頁の幅いっぱいまで広げる。
  // 2列までは本文でない列が1つなので --doc-aside-width を読む。3列は列ごとの幅を書く
  const columnsValue = (grid: Grid): string => {
    const gridMain = mainColumn(grid);
    return grid.columns
      .map((width, index) =>
        index === gridMain
          ? "minmax(0, 1fr)"
          : three
            ? px(width)
            : "var(--doc-aside-width)",
      )
      .join(" ");
  };
  const narrow = narrowed(layout);
  const page = layout.head === "main";
  return [
    ["--doc-measure", px(layout.columns[main] ?? 0)],
    ["--doc-aside-width", px(side)],
    ["--doc-aside-display", used.has("aside") ? "block" : "none"],
    ["--doc-toc-display", used.has("toc") ? "block" : "none"],
    ["--doc-columns", columnsValue(layout)],
    // 脇の列を畳んだら、本文はそのぶん広がる(1列になれば題名・要約と同じ幅)
    ["--doc-columns-no-aside", columnsValue(folded(layout))],
    ["--doc-rows", rowSizes(layout.areas.length).join(" ")],
    ["--doc-areas", areasValue(layout.areas)],
    ["--doc-areas-no-aside", areasValue(folded(layout).areas)],
    ...(narrow === undefined
      ? []
      : ([
          ["--doc-columns-narrow", columnsValue(narrow)],
          ["--doc-columns-narrow-no-aside", columnsValue(folded(narrow))],
          ["--doc-rows-narrow", rowSizes(narrow.areas.length).join(" ")],
          ["--doc-areas-narrow", areasValue(narrow.areas)],
          ["--doc-areas-narrow-no-aside", areasValue(folded(narrow).areas)],
        ] satisfies CssVariable[])),
    ...(page ? pageVariables(layout, narrow) : []),
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
