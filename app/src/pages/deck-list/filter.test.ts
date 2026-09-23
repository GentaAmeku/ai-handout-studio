import { describe, expect, it } from "vitest";
import type { DeckSummary } from "../../api/types";
import { collectTags, filterDecks } from "./filter";

const ready = (deckId: string, title: string, tags: string[]): DeckSummary => ({
  state: "ready",
  deckId,
  title,
  status: "draft",
  tags,
  slideCount: 1,
  updatedAt: "2026-09-16T00:00:00Z",
  cover: null,
});

const decks: DeckSummary[] = [
  ready("deck_20260916_001", "ご提案書・お見積り", ["提案"]),
  ready("deck_20260916_002", "勉強会資料 AI入門", ["学習", "AI"]),
  {
    state: "invalid",
    deckId: "deck_20260916_003",
    message: "壊れている",
    updatedAt: "2026-09-16T00:00:00Z",
  },
];

const ids = (list: DeckSummary[]) => list.map((deck) => deck.deckId);

describe("collectTags", () => {
  it("読めた資料のタグを重複なく並べる", () => {
    expect(collectTags([...decks, ready("deck_x", "x", ["提案"])])).toEqual(
      ["AI", "学習", "提案"].sort((a, b) => a.localeCompare(b, "ja")),
    );
  });
});

describe("filterDecks", () => {
  it("条件が無ければすべて返す", () => {
    expect(ids(filterDecks(decks, {}))).toHaveLength(3);
  });

  it("タグの付いた資料だけを返す(読めない資料はタグを持たない)", () => {
    expect(ids(filterDecks(decks, { tag: "提案" }))).toEqual([
      "deck_20260916_001",
    ]);
    expect(ids(filterDecks(decks, { tag: "無いタグ" }))).toEqual([]);
  });
});
