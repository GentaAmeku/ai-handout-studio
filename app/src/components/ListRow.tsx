import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateTime } from "../format/date";
import { useLanguage } from "../i18n/language";
import type { PhotoCardLink } from "./PhotoCard";

// 資料一覧のリスト表示の1行(184)。3区分で共通の部品。
// 絵は描かず、題名(押すと行き先を開くリンク。行のどこを押しても開く)・ID(出す区分だけ)・
// 区分ごとの項目・更新日時・右端のボタンの置き場を持つ。
// 列の幅は app.css の .list-row* が決め、行をまたいで縦にそろえる

export const ListRow = ({
  articleLabel,
  link,
  title,
  id,
  warning,
  factColumns,
  facts,
  updatedAt,
  action,
}: {
  // article の読み上げの名前(資料の題名)
  articleLabel: string;
  // 題名を押したとき開く行き先。読み上げの名前は呼ぶ側が aria-label で渡す
  link: PhotoCardLink;
  title: string;
  // 資料の ID。出さない区分(質問票)は渡さず、列ごと持たない
  id?: string;
  // 読めない資料の印と一言(RowWarning)。題名の横に出す
  warning?: ReactNode;
  // 区分ごとの項目の列の数。読めない資料で項目が無くても、列は空けておく
  factColumns: 0 | 2;
  // 区分ごとの項目(RowFact の並び)
  facts?: ReactNode;
  updatedAt: string;
  // 右端のボタンの置き場。中身(🗑・☆)は呼ぶ側が渡す
  action?: ReactNode;
}) => {
  const { t } = useLanguage();
  const idColumn = id === undefined ? "" : " list-row--id";
  return (
    <article
      className={`list-row list-row--facts-${factColumns}${idColumn}`}
      aria-label={articleLabel}
    >
      <div className="list-row__main">
        <Link {...link} className="list-row__title">
          {title}
        </Link>
        {warning}
      </div>
      <div className="list-row__meta">
        {/* 読めないスライドは題名に ID を出しているので、重ねない(列は空けておく) */}
        {id !== undefined && id !== title && (
          <span className="list-row__id">{id}</span>
        )}
        {facts}
        <span className="list-row__date">
          <span className="visually-hidden">{t("handouts.updatedAt")}</span>
          <time dateTime={updatedAt}>{formatDateTime(updatedAt)}</time>
        </span>
      </div>
      {action}
    </article>
  );
};

// 行の項目の1つ(枚数・状態・問数・回答)
export const RowFact = ({ children }: { children: ReactNode }) => (
  <span className="list-row__fact">{children}</span>
);

// 読めない資料の印と一言。理由は合わせたときの吹き出しに出す
export const RowWarning = ({
  text,
  detail,
}: {
  text: string;
  detail?: string;
}) => (
  <span className="list-row__warning" title={detail}>
    <TriangleAlert size={14} aria-hidden />
    {text}
  </span>
);
