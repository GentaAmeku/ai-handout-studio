import type {
  DeckSummary,
  DesignTemplateSummary,
  HandoutKind,
  HandoutSummary,
} from "../api/types";
import { sectionDetailPath } from "../pages/sections/paths";
import { templateEditPath } from "../pages/templates/paths";
import type { Surface } from "../schema/design";
import { matchesAll } from "./match";

// サイト内検索の6区分と、区分ごとに見るところ。
// 区分の順はサイドバーの順。区分の中の並びは一覧の API の順(資料は更新の新しい順、テンプレートは名前の順)

export const SEARCH_KINDS = [
  "slide",
  "slideTemplate",
  "sheet",
  "sheetTemplate",
  "document",
  "documentTemplate",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

// 開く先。資料一覧・テンプレートの一覧のカードと同じ経路
export type SearchTarget = {
  to: string;
  params: Readonly<Record<string, string>>;
};

export type SearchEntry = {
  kind: SearchKind;
  key: string;
  title: string;
  // 行の右に小さく出す字。資料は ID、テンプレートは説明
  meta: string;
  // 語を探すところ
  fields: readonly string[];
  target: SearchTarget;
};

export type SearchGroup = { kind: SearchKind; entries: SearchEntry[] };

export const TEMPLATE_KIND = {
  slide: "slideTemplate",
  sheet: "sheetTemplate",
  document: "documentTemplate",
} as const satisfies Record<Surface, SearchKind>;

// スライドは題名・タグ・ID。読めない資料は ID だけ
export const deckEntries = (decks: readonly DeckSummary[]): SearchEntry[] =>
  decks.map((deck) => {
    const title = deck.state === "invalid" ? deck.deckId : deck.title;
    const tags = deck.state === "ready" ? deck.tags : [];
    return {
      kind: "slide",
      key: deck.deckId,
      title,
      meta: deck.deckId,
      fields: [title, ...tags, deck.deckId],
      target: { to: "/decks/$deckId", params: { deckId: deck.deckId } },
    };
  });

// 質問票と HTML 資料は題名・ID
export const handoutEntries = (
  kind: HandoutKind,
  handouts: readonly HandoutSummary[],
): SearchEntry[] =>
  handouts.map((handout) => ({
    kind,
    key: handout.id,
    title: handout.title,
    meta: handout.id,
    fields: [handout.title, handout.id],
    target: { to: sectionDetailPath[kind], params: { id: handout.id } },
  }));

// テンプレートは表示名・識別子・説明
export const templateEntries = (
  surface: Surface,
  templates: readonly DesignTemplateSummary[],
): SearchEntry[] =>
  templates.map((template) => ({
    kind: TEMPLATE_KIND[surface],
    key: template.name,
    title: template.label,
    meta: template.description ?? template.name,
    fields: [template.label, template.name, template.description ?? ""],
    target: { to: templateEditPath[surface], params: { name: template.name } },
  }));

// 語に当たったものを区分ごとにまとめる。当たらなかった区分は出さない
export const searchGroups = (
  entries: Readonly<Partial<Record<SearchKind, readonly SearchEntry[]>>>,
  terms: readonly string[],
): SearchGroup[] =>
  SEARCH_KINDS.map((kind) => ({
    kind,
    entries: (entries[kind] ?? []).filter((entry) =>
      matchesAll(terms, entry.fields),
    ),
  })).filter((group) => group.entries.length > 0);
