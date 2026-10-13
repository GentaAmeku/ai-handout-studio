import { Pencil, Search, TriangleAlert } from "lucide-react";
import { handoutPreviewUrl, useDeleteHandout } from "../../api/queries";
import type { HandoutSummary, WithFavorite } from "../../api/types";
import {
  type ActionPlace,
  CardActions,
  CardMessage,
  type FavoriteControl,
} from "../../components/ListCardParts";
import { PhotoCard, type PhotoCardLink } from "../../components/PhotoCard";
import { useLanguage } from "../../i18n/language";
import { FrameView } from "../design/SampleStage";
import { sectionDetailPath } from "./paths";

// 質問票と HTML 資料の資料一覧の写真のカード。ふだんは見本の頭だけで、
// 合わせると題名・中央の印・右上の 🗑 と ☆ が出る。質問票は1件のページが開くので 🔍、
// HTML 資料は編集画面が開くので ✎。お気に入りは塗りの ★ をいつも出す。
// 行き先・🗑 と ☆ は、リスト表示の行(HandoutRow.tsx)も同じものを使う

export const useHandoutLink = (summary: HandoutSummary): PhotoCardLink => {
  const { t } = useLanguage();
  // 2つの経路の和は Link の型と重ならないので、いったん unknown を通して PhotoCardLink へゆるめる
  return {
    to: sectionDetailPath[summary.kind],
    params: { id: summary.id },
    "aria-label": t(
      summary.kind === "sheet" ? "deckCard.openNamed" : "deckCard.editNamed",
      { title: summary.title },
    ),
  } as unknown as PhotoCardLink;
};

export const HandoutActions = ({
  summary,
  favoriteControl,
  place,
}: {
  summary: WithFavorite<HandoutSummary>;
  favoriteControl: FavoriteControl;
  place?: ActionPlace;
}) => {
  const remove = useDeleteHandout(summary.kind);
  return (
    <CardActions
      id={summary.id}
      title={summary.title}
      favorite={summary.favorite}
      favoriteControl={favoriteControl}
      deleting={remove.isPending}
      deleteError={remove.isError ? remove.error.message : undefined}
      onDelete={() => remove.mutate(summary.id)}
      place={place}
    />
  );
};

export const HandoutCard = ({
  summary,
  favoriteControl,
}: {
  summary: WithFavorite<HandoutSummary>;
  favoriteControl: FavoriteControl;
}) => {
  const { t } = useLanguage();
  const link = useHandoutLink(summary);
  const { title } = summary;
  const isSheet = summary.kind === "sheet";
  return (
    <PhotoCard
      articleLabel={title}
      className={summary.error ? "photo-card--titled" : undefined}
      link={link}
      image={
        summary.error ? (
          <CardMessage
            tone="danger"
            icon={<TriangleAlert size={28} aria-hidden />}
            text={t("handouts.unreadable")}
            detail={summary.error}
          />
        ) : (
          <FrameView
            src={handoutPreviewUrl(summary.kind, summary.id)}
            title={title}
            decorative
          />
        )
      }
      icon={
        isSheet ? (
          <Search size={22} strokeWidth={1.75} />
        ) : (
          <Pencil size={22} strokeWidth={1.75} />
        )
      }
      name={title}
      action={
        <HandoutActions summary={summary} favoriteControl={favoriteControl} />
      }
    />
  );
};
