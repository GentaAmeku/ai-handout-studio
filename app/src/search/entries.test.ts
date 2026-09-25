import { describe, expect, it } from "vitest";
import type { DeckSummary, HandoutSummary } from "../api/types";
import {
  deckEntries,
  handoutEntries,
  searchGroups,
  templateEntries,
} from "./entries";
import { termsOf } from "./match";

const DATE = "2026-09-22T00:00:00Z";

const decks: DeckSummary[] = [
  {
    state: "ready",
    deckId: "deck_001",
    title: "AI が作る資料",
    status: "draft",
    tags: ["登壇"],
    slideCount: 3,
    updatedAt: DATE,
    cover: null,
  },
  {
    state: "invalid",
    deckId: "deck_002",
    message: "読めない",
    updatedAt: DATE,
  },
];

const sheet = (id: string, title: string): HandoutSummary => ({
  kind: "sheet",
  id,
  title,
  template: "cobalt",
  createdAt: DATE,
  updatedAt: DATE,
});

const entries = {
  slide: deckEntries(decks),
  sheet: handoutEntries("sheet", [
    sheet("sheet_001", "資料一覧の決めごと"),
    sheet("sheet_002", "メモリの棚卸し"),
  ]),
  documentTemplate: templateEntries("document", [
    {
      name: "cobalt",
      label: "Cobalt",
      description: "公共機関の資料でよく見る組み",
    },
    { name: "report", label: "Report" },
  ]),
  slideTemplate: templateEntries("slide", [{ name: "lumen", label: "Lumen" }]),
};

const summary = (query: string) =>
  searchGroups(entries, termsOf(query)).map((group) => [
    group.kind,
    group.entries.map((entry) => entry.key),
  ]);

describe("searchGroups", () => {
  it("区分はサイドバーの順に並べ、当たらなかった区分は出さない", () => {
    expect(summary("資料")).toEqual([
      ["slide", ["deck_001"]],
      ["sheet", ["sheet_001"]],
      ["documentTemplate", ["cobalt"]],
    ]);
  });

  it("スライドはタグ、読めない資料は ID で当たる", () => {
    expect(summary("登壇")).toEqual([["slide", ["deck_001"]]]);
    expect(summary("deck_002")).toEqual([["slide", ["deck_002"]]]);
  });

  it("テンプレートは表示名・識別子・説明で当たる", () => {
    expect(summary("LUMEN")).toEqual([["slideTemplate", ["lumen"]]]);
    expect(summary("report")).toEqual([["documentTemplate", ["report"]]]);
  });

  it("語が無ければ何も出さない", () => {
    expect(summary(" ")).toEqual([]);
  });
});

describe("開く先", () => {
  it("資料一覧・テンプレートの一覧のカードと同じ経路にする", () => {
    expect(entries.slide[0]?.target).toEqual({
      to: "/decks/$deckId",
      params: { deckId: "deck_001" },
    });
    expect(entries.sheet[0]?.target).toEqual({
      to: "/sheets/$id",
      params: { id: "sheet_001" },
    });
    expect(entries.documentTemplate[0]?.target).toEqual({
      to: "/documents/templates/$name",
      params: { name: "cobalt" },
    });
  });

  it("説明の無いテンプレートは、行の右に識別子を出す", () => {
    expect(entries.documentTemplate[1]?.meta).toBe("report");
  });
});
