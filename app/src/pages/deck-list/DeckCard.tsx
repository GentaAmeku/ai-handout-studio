import { Pencil, TriangleAlert } from "lucide-react";
import { deckAssetBase } from "../../api/client";
import { useDeleteDeck } from "../../api/queries";
import type { DeckSummary, WithFavorite } from "../../api/types";
import {
  CardActions,
  CardMessage,
  type FavoriteControl,
} from "../../components/ListCardParts";
import { PhotoCard, type PhotoCardLink } from "../../components/PhotoCard";
import { ScaledSlide } from "../../components/ScaledSlide";
import { useLanguage } from "../../i18n/language";

// スライドの資料一覧の写真のカード。ふだんは表紙だけで、合わせると題名・中央の ✎・右上の 🗑 と ☆ が出る。
// お気に入りは塗りの ★ をいつも出す。
// 読めた資料は編集画面へ、読めない資料は内容の確認へ(どちらも /decks/<id>)

const titleOf = (deck: DeckSummary): string =>
  deck.state === "invalid" ? deck.deckId : deck.title;

const DeckImage = ({ deck }: { deck: DeckSummary }) => {
  const { t } = useLanguage();
  if (deck.state === "invalid") {
    return (
      <CardMessage
        tone="danger"
        icon={<TriangleAlert size={28} aria-hidden />}
        text={t("deckCard.invalidTitle")}
        detail={deck.message}
      />
    );
  }
  if (!deck.cover) {
    return <CardMessage tone="muted" text={t("deckCard.noSlides")} />;
  }
  return (
    <span className="photo-card__media">
      <ScaledSlide
        slide={deck.cover}
        decorative
        context={{
          pageNumber: 1,
          pageCount: deck.slideCount,
          assetBaseUrl: deckAssetBase(deck.deckId),
          template: deck.template,
        }}
      />
    </span>
  );
};

export const DeckCard = ({
  deck,
  favoriteControl,
}: {
  deck: WithFavorite<DeckSummary>;
  favoriteControl: FavoriteControl;
}) => {
  const { t } = useLanguage();
  const deleteDeck = useDeleteDeck();
  const title = titleOf(deck);
  // 読めない資料は絵が無いので、題名をいつも出す
  const always = deck.state !== "ready";
  // 経路の型は Link の型と重ならないので、いったん unknown を通して PhotoCardLink へゆるめる
  const open = {
    to: "/decks/$deckId",
    params: { deckId: deck.deckId },
  } as unknown as PhotoCardLink;
  return (
    <PhotoCard
      articleLabel={title}
      className={always ? "photo-card--titled" : undefined}
      link={
        {
          ...open,
          "aria-label": t(
            deck.state === "ready"
              ? "deckCard.editNamed"
              : "deckCard.openNamed",
            { title },
          ),
        } as PhotoCardLink
      }
      image={<DeckImage deck={deck} />}
      icon={<Pencil size={22} strokeWidth={1.75} />}
      name={title}
      action={
        <CardActions
          id={deck.deckId}
          title={title}
          favorite={deck.favorite}
          favoriteControl={favoriteControl}
          deleting={deleteDeck.isPending}
          deleteError={
            deleteDeck.isError ? deleteDeck.error.message : undefined
          }
          onDelete={() => deleteDeck.mutate(deck.deckId)}
        />
      }
    />
  );
};
