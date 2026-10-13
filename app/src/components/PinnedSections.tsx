import { Star } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { ListView } from "./list-view";

// 写真のカードの一覧を2つに分ける区切り。資料一覧のお気に入りとテンプレートの一覧の既定で使う。
// 上に留めるもの(pinned)が1件でもあれば、★ 付きの見出しの下に並べ、残りはその下に見出しを付けずに
// 細い線で分けて並べる(利用者の指定)。上に留めるものは下に重ねない。1件も無ければ見出しの無い並び。
// 全部が上に留めるものなら下の並びは出さない。並びは渡されたまま。
// 資料一覧のリスト表示(184)では、同じ区切りのまま、カードの格子の代わりに行を縦に並べる

const CONTAINER_CLASS: Record<ListView, string> = {
  cards: "photo-card-grid",
  list: "list-rows",
};

export const PinnedSections = <T,>({
  items,
  pinned,
  title,
  view = "cards",
  renderItem,
}: {
  items: readonly T[];
  pinned: (item: T) => boolean;
  // 上の区切りの見出し(「お気に入り」「既定」)
  title: string;
  // 並べ方。写真のカードの格子か、行のリスト
  view?: ListView;
  // 1件のカードか行。key は呼ぶ側が付ける
  renderItem: (item: T) => ReactNode;
}) => {
  const headingId = useId();
  const container = CONTAINER_CLASS[view];
  const top = items.filter(pinned);
  if (top.length === 0) {
    return <div className={container}>{items.map(renderItem)}</div>;
  }
  const rest = items.filter((item) => !pinned(item));
  return (
    <>
      <section className="list-section" aria-labelledby={headingId}>
        <h2 id={headingId} className="list-section__title">
          <Star size={16} strokeWidth={1.75} fill="currentColor" aria-hidden />
          {title}
        </h2>
        <div className={container}>{top.map(renderItem)}</div>
      </section>
      {rest.length > 0 && (
        <div className={`${container} list-rest`}>{rest.map(renderItem)}</div>
      )}
    </>
  );
};
