import { Search } from "lucide-react";
import { useLanguage } from "../i18n/language";
import { useOpenSearch } from "./SearchProvider";

// 見出しの右端に置く検索のボタン。虫めがねだけの丸いボタンで、押すと検索の窓が開く。
// 字は出さず、読み上げとツールチップに「Search」を持つ。枠の外では何も出さない
export const SearchButton = () => {
  const { t } = useLanguage();
  const openSearch = useOpenSearch();
  if (!openSearch) return null;
  return (
    <button
      type="button"
      className="search-button"
      aria-label={t("search.label")}
      title={t("search.label")}
      onClick={openSearch}
    >
      <Search size={20} strokeWidth={2.25} aria-hidden />
    </button>
  );
};
