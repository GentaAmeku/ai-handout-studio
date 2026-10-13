import type { HandoutSummary, WithFavorite } from "../../api/types";
import type { FavoriteControl } from "../../components/ListCardParts";
import { ListRow, RowFact, RowWarning } from "../../components/ListRow";
import { useLanguage } from "../../i18n/language";
import { HandoutActions, useHandoutLink } from "./HandoutCard";

// 質問票と HTML 資料の資料一覧のリスト表示の1行(184)。題名・ID・更新日時・🗑 と ☆。
// 質問票は問数と回答の有無も出す。行き先と 🗑・☆ は写真のカード(HandoutCard.tsx)と同じ

export const HandoutRow = ({
  summary,
  favoriteControl,
}: {
  summary: WithFavorite<HandoutSummary>;
  favoriteControl: FavoriteControl;
}) => {
  const { t } = useLanguage();
  const link = useHandoutLink(summary);
  return (
    <ListRow
      articleLabel={summary.title}
      link={link}
      title={summary.title}
      id={summary.id}
      warning={
        summary.error && (
          <RowWarning text={t("handouts.unreadable")} detail={summary.error} />
        )
      }
      factColumns={summary.kind === "sheet" ? 2 : 0}
      facts={
        summary.questionCount !== undefined && (
          <>
            <RowFact>
              {t("unit.questions", { n: summary.questionCount })}
            </RowFact>
            <RowFact>
              {t(
                summary.hasAnswers
                  ? "handouts.answered"
                  : "handouts.notAnswered",
              )}
            </RowFact>
          </>
        )
      }
      updatedAt={summary.updatedAt}
      action={
        <HandoutActions
          summary={summary}
          favoriteControl={favoriteControl}
          place="row"
        />
      }
    />
  );
};
