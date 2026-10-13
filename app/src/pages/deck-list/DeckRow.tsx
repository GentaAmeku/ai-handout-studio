import type { DeckSummary, WithFavorite } from "../../api/types";
import type { FavoriteControl } from "../../components/ListCardParts";
import { ListRow, RowFact, RowWarning } from "../../components/ListRow";
import { useLanguage } from "../../i18n/language";
import { DeckActions, titleOf, useDeckLink } from "./DeckCard";

// スライドの資料一覧のリスト表示の1行(184)。題名・ID・枚数・状態・更新日時・☆ と 🗑。
// 行き先と 🗑・☆ は写真のカード(DeckCard.tsx)と同じ

export const DeckRow = ({
  deck,
  favoriteControl,
}: {
  deck: WithFavorite<DeckSummary>;
  favoriteControl: FavoriteControl;
}) => {
  const { t } = useLanguage();
  const link = useDeckLink(deck);
  const title = titleOf(deck);
  return (
    <ListRow
      articleLabel={title}
      link={link}
      title={title}
      id={deck.deckId}
      warning={
        deck.state === "invalid" && (
          <RowWarning text={t("deckCard.invalidTitle")} detail={deck.message} />
        )
      }
      factColumns={2}
      facts={
        deck.state === "ready" && (
          <>
            <RowFact>{t("unit.slides", { n: deck.slideCount })}</RowFact>
            <RowFact>
              {t(
                deck.status === "done"
                  ? "deckCard.statusDone"
                  : "deckCard.statusDraft",
              )}
            </RowFact>
          </>
        )
      }
      updatedAt={deck.updatedAt}
      action={
        <DeckActions
          deck={deck}
          favoriteControl={favoriteControl}
          place="row"
        />
      }
    />
  );
};
