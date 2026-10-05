import { Star, X } from "lucide-react";
import { useSetHandoutDetailFavorite } from "../api/queries";
import type { HandoutKind } from "../api/types";
import { useLanguage } from "../i18n/language";

// 質問票の1件のページと HTML 資料の編集画面の帯に置く ☆。資料一覧のカードの ☆ と同じお気に入りを付け外しする。
// 付け外しできなかったときは、帯の下に知らせを出す(テンプレートの入れ替えの失敗と同じ形)
export const FavoriteButton = ({
  kind,
  id,
  favorite,
}: {
  kind: HandoutKind;
  id: string;
  favorite: boolean;
}) => {
  const { t } = useLanguage();
  const setFavorite = useSetHandoutDetailFavorite(kind, id);
  return (
    <>
      {/* アイコンだけ。名前は読み上げと吹き出し(data-tooltip)に持たせ、付いているかは aria-pressed で伝える */}
      <button
        type="button"
        className="button button--ghost button--icon favorite-button"
        aria-label={t("handouts.favorite")}
        aria-pressed={favorite}
        data-tooltip={t(favorite ? "handouts.unfavorite" : "handouts.favorite")}
        disabled={setFavorite.isPending}
        onClick={() => setFavorite.mutate(!favorite)}
      >
        <Star size={18} fill={favorite ? "currentColor" : "none"} aria-hidden />
      </button>
      {setFavorite.isError && (
        <div className="export-notice" role="alert">
          <p className="export-notice__title export-notice__title--error">
            {setFavorite.error.message}
          </p>
          <button
            type="button"
            className="icon-button export-notice__close"
            aria-label={t("export.closeNotice")}
            onClick={() => setFavorite.reset()}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
};
