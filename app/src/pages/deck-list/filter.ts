import type { DeckSummary } from "../../api/types";

// 題名での検索はサイト内検索へ移し、ここはタグの絞り込みだけを持つ
export type DeckFilter = { tag?: string };

const tagsOf = (deck: DeckSummary): readonly string[] =>
  deck.state === "ready" ? deck.tags : [];

export const collectTags = (decks: readonly DeckSummary[]): string[] =>
  [...new Set(decks.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b, "ja"));

// 一覧の1件の形(お気に入りの印など)はそのまま返す
export const filterDecks = <T extends DeckSummary>(
  decks: readonly T[],
  { tag }: DeckFilter,
): T[] => decks.filter((deck) => !tag || tagsOf(deck).includes(tag));
