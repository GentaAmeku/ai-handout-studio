// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type DocumentLayout,
  documentLayoutSchema,
  type SheetLayout,
  selectionSchema,
  sheetLayoutSchema,
} from "../schema/design";
import {
  documentLayoutVariables,
  layoutVariables,
  sheetLayoutVariables,
} from "./layout";
import { LAYOUT_PRESETS } from "./layout-presets";

const designDir = fileURLToPath(new URL("../../../design", import.meta.url));

const standard: DocumentLayout = {
  columns: [640, 228],
  areas: [
    ["toc", "toc"],
    ["main", "aside"],
  ],
};

const focus: SheetLayout = {
  base: "focus",
  width: 1280,
  list: { width: 228, side: "left" },
  content: null,
};

const grid = (layout: DocumentLayout) =>
  Object.fromEntries(documentLayoutVariables(layout));

describe("テンプレートの骨格", () => {
  it("用意した骨格と、テンプレートの骨格はどれもスキーマに合う", () => {
    expect(Object.keys(LAYOUT_PRESETS.sheet).sort()).toEqual([
      "all",
      "focus",
      "overview",
      "print",
    ]);
    for (const preset of Object.values(LAYOUT_PRESETS.document)) {
      expect(documentLayoutSchema.safeParse(preset.layout).success).toBe(true);
    }
    for (const preset of Object.values(LAYOUT_PRESETS.sheet)) {
      expect(sheetLayoutSchema.safeParse(preset.layout).success).toBe(true);
    }
    const read = (surface: string) =>
      readdirSync(join(designDir, "templates", surface))
        .filter((name) =>
          existsSync(
            join(designDir, "templates", surface, name, "template.json"),
          ),
        )
        .map(
          (name) =>
            JSON.parse(
              readFileSync(
                join(designDir, "templates", surface, name, "template.json"),
                "utf8",
              ),
            ).layout,
        );
    expect(read("document").length).toBeGreaterThan(0);
    for (const layout of read("document")) {
      expect(documentLayoutSchema.safeParse(layout).success).toBe(true);
    }
    for (const layout of read("sheet")) {
      expect(sheetLayoutSchema.safeParse(layout).success).toBe(true);
      // 移動の帯の位置は外した。同梱のテンプレートにはもう書かない
      expect(layout).not.toHaveProperty("navigation");
    }
  });

  it("移動の帯の位置(navigation)を持つ前の形の骨格も読め、読むときに捨てる", () => {
    for (const navigation of ["bottom", "top"]) {
      const parsed = sheetLayoutSchema.safeParse({ ...focus, navigation });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(focus);
    }
    // ほかの知らない値は今までどおり落とす
    expect(sheetLayoutSchema.safeParse({ ...focus, extra: 1 }).success).toBe(
      false,
    );
  });

  it("文書の型は本文を1つの列に置き、領域を長方形にまとめる", () => {
    const issue = (layout: DocumentLayout) =>
      documentLayoutSchema.safeParse(layout).error?.issues[0]?.message;
    expect(issue(standard)).toBeUndefined();
    expect(issue({ ...standard, areas: [["toc", "aside"]] })).toBe(
      "本文(main)を置く",
    );
    expect(
      issue({
        ...standard,
        areas: [
          ["main", "toc"],
          ["aside", "main"],
        ],
      }),
    ).toBe("領域 main を長方形にまとめる");
    expect(
      issue({
        ...standard,
        areas: [
          ["main", "main"],
          ["toc", "aside"],
        ],
      }),
    ).toBe("本文(main)は1つの列に置く");
    expect(issue({ ...standard, areas: [["main"], ["toc"]] })).toBe(
      "行ごとの升目の数を列の数にそろえる",
    );
    expect(
      documentLayoutSchema.safeParse({ ...standard, columns: [60] }).success,
    ).toBe(false);
  });

  it("列は3つまで。題名の塊の置き場所(head)は page か main", () => {
    const three: DocumentLayout = {
      columns: [232, 720, 216],
      areas: [["toc", "main", "aside"]],
      head: "main",
    };
    expect(documentLayoutSchema.safeParse(three).success).toBe(true);
    expect(
      documentLayoutSchema.safeParse({ ...three, head: "page" }).success,
    ).toBe(true);
    expect(
      documentLayoutSchema.safeParse({ ...three, head: "side" }).success,
    ).toBe(false);
    expect(
      documentLayoutSchema.safeParse({
        columns: [200, 640, 200, 200],
        areas: [["toc", "main", "aside", "."]],
      }).success,
    ).toBe(false);
    // 3列でも本文は1つの列に置く
    expect(
      documentLayoutSchema.safeParse({
        columns: [232, 720, 216],
        areas: [
          ["toc", "main", "main"],
          ["toc", "main", "aside"],
        ],
      }).error?.issues[0]?.message,
    ).toBe("領域 main を長方形にまとめる");
    expect(
      documentLayoutSchema.safeParse({
        columns: [232, 720, 216],
        areas: [["main", "main", "toc"]],
      }).error?.issues[0]?.message,
    ).toBe("本文(main)は1つの列に置く");
  });

  it("区分ごとの既定の選択は、骨格(layouts)を持たない", () => {
    expect(
      selectionSchema.safeParse({
        slide: "default",
        sheet: "default",
        document: "default",
        layouts: { document: "standard", sheet: "focus" },
      }).success,
    ).toBe(false);
  });
});

describe("型の変数", () => {
  it("文書の型を grid の値にする。本文の列は固定幅にせず広げる", () => {
    expect(grid(standard)).toEqual({
      "--doc-measure": "640px",
      "--doc-aside-width": "228px",
      "--doc-aside-display": "block",
      "--doc-toc-display": "block",
      "--doc-columns": "minmax(0, 1fr) var(--doc-aside-width)",
      "--doc-columns-no-aside": "minmax(0, 1fr)",
      "--doc-rows": "auto 1fr",
      "--doc-areas": '"toc toc" "main aside"',
      "--doc-areas-no-aside": '"toc" "main"',
    });
    expect(
      grid({
        columns: [720],
        areas: [["main"]],
      }),
    ).toMatchObject({
      "--doc-measure": "720px",
      "--doc-aside-width": "228px",
      "--doc-aside-display": "none",
      "--doc-toc-display": "none",
      "--doc-columns": "minmax(0, 1fr)",
      "--doc-columns-no-aside": "minmax(0, 1fr)",
      "--doc-rows": "1fr",
      "--doc-areas": '"main"',
      "--doc-areas-no-aside": '"main"',
    });
  });

  it("脇だけの列を持つ型は、脇の無い資料で1列に畳む", () => {
    // 既定(本文が左、目次が上に伸びる)。脇の列が消え、本文は紙の幅いっぱいになる
    expect(grid(standard)).toMatchObject({
      "--doc-columns-no-aside": "minmax(0, 1fr)",
      "--doc-areas-no-aside": '"toc" "main"',
    });
    // 1列の型。畳む列が無いので、脇の有る無しで並びは変わらない
    expect(
      grid({
        columns: [660],
        areas: [["toc"], ["main"], ["aside"]],
      }),
    ).toMatchObject({
      "--doc-columns-no-aside": "minmax(0, 1fr)",
      "--doc-areas-no-aside": '"toc" "main" "aside"',
    });
    // Report。脇の列は目次も使うので畳まない(本文の幅は変わらない)
    expect(
      grid({
        columns: [220, 660],
        areas: [
          ["toc", "main"],
          ["aside", "main"],
        ],
      }),
    ).toMatchObject({
      "--doc-columns-no-aside": "var(--doc-aside-width) minmax(0, 1fr)",
      "--doc-areas-no-aside": '"toc main" "aside main"',
    });
  });

  it("2列以下で head を持たない型は、前と同じ変数だけを出す", () => {
    for (const preset of Object.values(LAYOUT_PRESETS.document)) {
      expect(
        Object.keys(grid(preset.layout)).filter(
          (name) => name.includes("narrow") || name.startsWith("--doc-page"),
        ),
      ).toEqual([]);
    }
    // head: page は書かないのと同じ
    expect(grid({ ...standard, head: "page" })).toEqual(grid(standard));
  });

  it("3列の型は、本文でない列をそれぞれの幅で出し、1080px 以下の並びも出す", () => {
    expect(
      grid({
        columns: [232, 720, 216],
        areas: [["toc", "main", "aside"]],
      }),
    ).toEqual({
      "--doc-measure": "720px",
      "--doc-aside-width": "232px",
      "--doc-aside-display": "block",
      "--doc-toc-display": "block",
      "--doc-columns": "232px minmax(0, 1fr) 216px",
      // 脇の無い資料は、右の脇の列を畳む
      "--doc-columns-no-aside": "232px minmax(0, 1fr)",
      "--doc-rows": "1fr",
      "--doc-areas": '"toc main aside"',
      "--doc-areas-no-aside": '"toc main"',
      // 3列目(脇)を本文の下へ回す。目次の列は下まで伸びる
      "--doc-columns-narrow": "232px minmax(0, 1fr)",
      "--doc-columns-narrow-no-aside": "232px minmax(0, 1fr)",
      "--doc-rows-narrow": "auto 1fr",
      "--doc-areas-narrow": '"toc main" "toc aside"',
      "--doc-areas-narrow-no-aside": '"toc main" "toc aside"',
    });
  });

  it("3列の本文が右端なら、1080px 以下では2列目を本文の下へ回す", () => {
    expect(
      grid({
        columns: [200, 220, 640],
        areas: [
          ["toc", "aside", "main"],
          ["toc", ".", "main"],
        ],
      }),
    ).toMatchObject({
      "--doc-columns": "200px 220px minmax(0, 1fr)",
      "--doc-columns-narrow": "200px minmax(0, 1fr)",
      "--doc-areas-narrow": '"toc main" "toc main" "toc aside"',
    });
  });

  it("題名の塊を本文の列へ置く型は、ページの升目を出す。目次と脇は上から下まで伸びる", () => {
    const vars = grid({
      columns: [232, 720, 216],
      areas: [["toc", "main", "aside"]],
      head: "main",
    });
    expect(vars).toMatchObject({
      "--doc-page-display": "grid",
      "--doc-cols-display": "contents",
      "--doc-page-rows": "auto auto auto 1fr auto",
      "--doc-page-areas":
        '"toc signature aside" "toc head aside" "toc summary aside" "toc main aside" "toc foot aside"',
      "--doc-page-areas-no-aside":
        '"toc signature" "toc head" "toc summary" "toc main" "toc foot"',
      "--doc-page-rows-narrow": "auto auto auto auto 1fr auto",
      "--doc-page-areas-narrow":
        '"toc signature" "toc head" "toc summary" "toc main" "toc aside" "toc foot"',
      "--doc-page-areas-narrow-no-aside":
        '"toc signature" "toc head" "toc summary" "toc main" "toc aside" "toc foot"',
    });
    // 2列の型でも使える。本文より上の行(目次)はそのまま上に残る
    expect(grid({ ...standard, head: "main" })).toMatchObject({
      "--doc-page-rows": "auto auto auto auto 1fr auto",
      "--doc-page-areas":
        '"toc toc" "signature aside" "head aside" "summary aside" "main aside" "foot aside"',
      "--doc-page-areas-no-aside":
        '"toc" "signature" "head" "summary" "main" "foot"',
    });
    // 本文の列の最後の行が脇なら、末尾はその下に置く。脇が横に広がる行は末尾も横に広げる
    expect(
      grid({
        columns: [640, 228],
        areas: [
          ["main", "toc"],
          ["aside", "aside"],
        ],
        head: "main",
      })["--doc-page-areas"],
    ).toBe(
      '"signature toc" "head toc" "summary toc" "main toc" "aside aside" "foot foot"',
    );
  });

  it("本文の列が右なら、脇の列を左に置く", () => {
    expect(
      grid({
        columns: [220, 640],
        areas: [
          ["toc", "main"],
          ["aside", "main"],
        ],
      }),
    ).toMatchObject({
      "--doc-measure": "640px",
      "--doc-aside-width": "220px",
      "--doc-columns": "var(--doc-aside-width) minmax(0, 1fr)",
      "--doc-areas": '"toc main" "aside main"',
    });
  });

  it("質問票の既定の型は、段 H より前の --doc-* をそのまま持つ", () => {
    const vars = Object.fromEntries(sheetLayoutVariables(focus));
    expect(vars).toMatchObject(grid(standard));
    expect(vars).toMatchObject({
      "--board-width": "1280px",
      "--board-columns": "var(--doc-aside-width) minmax(0, 1fr)",
      "--board-list-order": "0",
      "--board-content-width": "none",
    });
    // 移動の帯は下に固定したので、帯の位置の変数は出さない
    expect(
      Object.keys(vars).filter((name) => name.startsWith("--board-nav")),
    ).toEqual([]);
  });

  it("質問票の一覧を右にすると、並びの変数が替わる", () => {
    const vars = Object.fromEntries(
      sheetLayoutVariables({
        ...focus,
        list: { width: 300, side: "right" },
        content: 720,
      }),
    );
    expect(vars).toMatchObject({
      "--doc-aside-width": "300px",
      "--board-columns": "minmax(0, 1fr) var(--doc-aside-width)",
      "--board-list-order": "1",
      "--board-content-width": "720px",
    });
  });

  it("区分ごとに自分の骨格だけを読む", () => {
    const measure = (variables: readonly (readonly [string, string])[]) =>
      new Map(variables).get("--doc-measure");
    expect(
      measure(
        layoutVariables("document", { ...standard, columns: [700, 228] }),
      ),
    ).toBe("700px");
    // 質問票のダイアログの幅は骨格では変えない
    expect(measure(layoutVariables("sheet", focus))).toBe("640px");
  });
});
