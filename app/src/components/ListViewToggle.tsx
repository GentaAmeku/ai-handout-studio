import { LayoutGrid, List } from "lucide-react";
import { useLanguage } from "../i18n/language";
import type { ListView } from "./list-view";

// 資料一覧の見出しの右、Search のボタンの左に置く表示の切り替え(184)。
// カードとリストの2つのボタンを1つの枠に並べ、選んでいる方を aria-pressed で示す。
// 字は出さず、名前は読み上げとツールチップに持つ

const VIEWS = [
  { view: "cards", label: "list.viewCards", Icon: LayoutGrid },
  { view: "list", label: "list.viewList", Icon: List },
] as const;

export const ListViewToggle = ({
  view,
  onChange,
}: {
  view: ListView;
  onChange: (next: ListView) => void;
}) => {
  const { t } = useLanguage();
  return (
    <fieldset className="view-toggle">
      <legend className="visually-hidden">{t("list.viewLegend")}</legend>
      {VIEWS.map(({ view: item, label, Icon }) => (
        <button
          key={item}
          type="button"
          className="view-toggle__button"
          aria-pressed={view === item}
          aria-label={t(label)}
          data-tooltip={t(label)}
          onClick={() => onChange(item)}
        >
          <Icon size={18} strokeWidth={2} aria-hidden />
        </button>
      ))}
    </fieldset>
  );
};
