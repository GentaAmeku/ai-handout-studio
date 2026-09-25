import { ExternalLink } from "lucide-react";
import { handoutPreviewUrl } from "../api/queries";
import type { HandoutKind } from "../api/types";
import { useLanguage } from "../i18n/language";

// 1枚の HTML をそのままの大きさで別のタブに開く(読む人が見るのと同じページ)。
// 質問票は回答欄に書き込むとき、HTML 資料は章の切り替えなど読む画面の動きを確かめるときに使う。
// 保存した中身を描くので、HTML 資料の直しは保存してから開く
export const OpenFullLink = ({
  kind,
  id,
}: {
  kind: HandoutKind;
  id: string;
}) => {
  const { t } = useLanguage();
  return (
    <a
      className="button button--ghost button--icon"
      href={handoutPreviewUrl(kind, id)}
      target="_blank"
      rel="noreferrer"
      aria-label={t("handouts.openFull")}
      data-tooltip={t("handouts.openFull")}
    >
      <ExternalLink size={18} aria-hidden />
    </a>
  );
};
