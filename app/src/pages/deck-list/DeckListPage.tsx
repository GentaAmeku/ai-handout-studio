import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { decksQuery, useSetDeckFavorite } from "../../api/queries";
import type { DeckSummary, WithFavorite } from "../../api/types";
import { favoriteControlOf } from "../../components/ListCardParts";
import { PinnedSections } from "../../components/PinnedSections";
import { useLanguage } from "../../i18n/language";
import { SearchButton } from "../../search/SearchButton";
import { DeckCard } from "./DeckCard";
import { collectTags, filterDecks } from "./filter";

const route = getRouteApi("/_shell/slides");

const DeckGrid = ({
  decks,
  filtered,
}: {
  decks: readonly WithFavorite<DeckSummary>[];
  filtered: readonly WithFavorite<DeckSummary>[];
}) => {
  const { t } = useLanguage();
  const setFavorite = useSetDeckFavorite();
  if (decks.length === 0) {
    return <p className="state-message">{t("decks.empty")}</p>;
  }
  if (filtered.length === 0) {
    return <p className="state-message">{t("decks.noMatch")}</p>;
  }
  // タグの絞り込みは、お気に入りとその下の並びの両方に効く
  return (
    <PinnedSections
      items={filtered}
      pinned={(deck) => deck.favorite}
      title={t("list.favorites")}
      renderCard={(deck) => (
        <DeckCard
          key={deck.deckId}
          deck={deck}
          favoriteControl={favoriteControlOf(setFavorite, deck.deckId)}
        />
      )}
    />
  );
};

export const DeckListPage = () => {
  const { t } = useLanguage();
  const { tag } = route.useSearch();
  const navigate = route.useNavigate();
  const decks = useQuery(decksQuery);

  const all = decks.data ?? [];
  const tags = collectTags(all);

  const setTag = (next: string | undefined) =>
    navigate({ search: { tag: next }, replace: true });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t("decks.title")}</h1>
          <p className="page-lead">{t("decks.lead")}</p>
        </div>
        <SearchButton />
      </header>

      <div className="toolbar">
        <fieldset className="chips">
          <legend className="visually-hidden">{t("decks.filterLegend")}</legend>
          <button
            type="button"
            className="chip"
            aria-pressed={!tag}
            onClick={() => setTag(undefined)}
          >
            {t("decks.filterAll")}
          </button>
          {tags.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={tag === name}
              onClick={() => setTag(name)}
            >
              {name}
            </button>
          ))}
        </fieldset>
      </div>

      {decks.isPending && (
        <p className="state-message">{t("common.loading")}</p>
      )}
      {decks.isError && (
        <p className="state-message state-message--error">
          {decks.error.message}
        </p>
      )}
      {decks.isSuccess && (
        <DeckGrid decks={all} filtered={filterDecks(all, { tag })} />
      )}
    </div>
  );
};
