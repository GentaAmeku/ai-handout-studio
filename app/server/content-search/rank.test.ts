import { describe, expect, it } from "vitest";
import type { ContentPlace } from "../../src/api/types.ts";
import {
  type ContentSource,
  displayText,
  indexSource,
  rankContent,
} from "./rank.ts";

// 中身の当たりの並べ方(docs/plans/content-search.md §4)。
// 語を全部含む資料を先に、残りは点の順で最上位の4割以上、合わせて10件

const sheet = (
  id: string,
  title: string,
  questions: readonly string[],
): ContentSource => ({
  kind: "sheet",
  id,
  title,
  titleFields: [title, id],
  chunks: [
    { place: { type: "overview" }, text: title },
    ...questions.map((text, index) => ({
      place: { type: "question", number: index + 1 } as ContentPlace,
      text,
    })),
  ],
});

const sources = [
  sheet("sheet_001", "Docker のメモリ割り当て", ["いま 12GB を割り当てている"]),
  sheet("sheet_002", "Mac の空き容量を戻す", [
    "スワップで、メモリ 16GB に対していま 14.5GB 使っている",
  ]),
  sheet("sheet_003", "テーマの用途", ["自分用のメモとしても使う"]),
  sheet("sheet_004", "設定の棚卸し", [
    "毎回読み込む設定を測って減らした",
    "外した行の置き場所",
  ]),
  sheet("sheet_005", "晩ごはんの献立", ["カレーとサラダ"]),
].map(indexSource);

const ids = (hits: readonly { id: string }[]) => hits.map((hit) => hit.id);

describe("rankContent", () => {
  it("語を全部含む資料を先に出し、片が少し重なるだけの資料は4割で切る", () => {
    const hits = rankContent(sources, "メモリ", { excludeTitleHits: false });
    expect(ids(hits)).toEqual(["sheet_001", "sheet_002"]);
  });

  it("窓では題名で当たった資料を外す(題名の区分に出ている)", () => {
    const hits = rankContent(sources, "メモリ", { excludeTitleHits: true });
    expect(ids(hits)).toEqual(["sheet_002"]);
  });

  it("2行目は語を含む区切りで、場所と当たった字を持つ", () => {
    const [hit] = rankContent(sources, "メモリ", { excludeTitleHits: true });
    expect(hit?.place).toEqual({ type: "question", number: 1 });
    expect(hit?.snippet.filter((segment) => segment.hit)).toEqual([
      { text: "メモリ", hit: true },
    ]);
  });

  it("言い方が違っても、重なりの多い資料が上に来る", () => {
    const hits = rankContent(sources, "毎回読み込まれる指示を減らす", {
      excludeTitleHits: true,
    });
    expect(hits[0]?.id).toBe("sheet_004");
    expect(hits[0]?.place).toEqual({ type: "question", number: 1 });
  });

  it("1字だけ・どこにも重ならない語では何も出さない", () => {
    expect(rankContent(sources, "メ", { excludeTitleHits: false })).toEqual([]);
    expect(
      rankContent(sources, "量子計算", { excludeTitleHits: false }),
    ).toEqual([]);
  });

  it("件数の上限で切る", () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      indexSource(sheet(`sheet_1${index}`, `記録 ${index}`, ["検索の記録"])),
    );
    expect(
      rankContent(many, "検索", { excludeTitleHits: false, limit: 10 }),
    ).toHaveLength(10);
  });
});

describe("displayText", () => {
  it("札の見出しと1行目の題名を、2行目の頭から外す", () => {
    expect(
      displayText(
        {
          place: { type: "section", heading: "並べ方" },
          text: "並べ方\n\n語を全部含む資料を先に",
        },
        "検索の設計",
      ),
    ).toBe("語を全部含む資料を先に");
    expect(
      displayText(
        { place: { type: "overview" }, text: "検索の決めごと\n\n窓の見せ方" },
        "検索の決めごと",
      ),
    ).toBe("窓の見せ方");
  });

  it("外すと空になるときと、頭が違うときは元のまま", () => {
    expect(
      displayText({ place: { type: "overview" }, text: "検索" }, "検索"),
    ).toBe("検索");
    expect(
      displayText(
        { place: { type: "question", number: 1 }, text: "どこに出しますか" },
        "検索の決めごと",
      ),
    ).toBe("どこに出しますか");
  });
});

describe("rankContent(ベクトル検索あり、180)", () => {
  const near = (entries: [string, number, number][]) =>
    new Map(entries.map(([key, score, chunk]) => [key, { score, chunk }]));

  it("語を全部含む資料を先に、残りは重なりとベクトルの順位を足した順。4割の切りは使わない", () => {
    const hits = rankContent(sources, "メモリ", {
      excludeTitleHits: false,
      semantic: near([
        ["sheet:sheet_005", 0.9, 1],
        ["sheet:sheet_003", 0.2, 1],
        ["sheet:sheet_001", 0.5, 1],
        ["sheet:sheet_002", 0.4, 1],
        ["sheet:sheet_004", 0.1, 1],
      ]),
    });
    // 語を含む2件のあとに、重なりは無いがベクトルの近い献立(sheet_005)が来る
    expect(ids(hits).slice(0, 3)).toEqual([
      "sheet_001",
      "sheet_002",
      "sheet_005",
    ]);
  });

  it("語を含まない資料の2行目は、ベクトルがいちばん近い区切り", () => {
    const hits = rankContent(sources, "夕食", {
      excludeTitleHits: false,
      semantic: near([["sheet:sheet_005", 0.9, 1]]),
    });
    expect(hits[0]).toMatchObject({
      id: "sheet_005",
      place: { type: "question", number: 1 },
    });
  });
});
