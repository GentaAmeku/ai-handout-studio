import { Star } from "lucide-react";
import { type ReactNode, useId } from "react";

// 写真のカードの一覧を2つに分ける区切り。資料一覧のお気に入りとテンプレートの一覧の既定で使う。
// 上に留めるもの(pinned)が1件でもあれば、★ 付きの見出しの下に並べ、残りはその下に見出しを付けずに
// 細い線で分けて並べる(利用者の指定)。上に留めるものは下に重ねない。1件も無ければ見出しの無い並び。
// 全部が上に留めるものなら下の並びは出さない。並びは渡されたまま

export const PinnedSections = <T,>({
  items,
  pinned,
  title,
  renderCard,
}: {
  items: readonly T[];
  pinned: (item: T) => boolean;
  // 上の区切りの見出し(「お気に入り」「既定」)
  title: string;
  // key は呼ぶ側が付ける
  renderCard: (item: T) => ReactNode;
}) => {
  const headingId = useId();
  const top = items.filter(pinned);
  if (top.length === 0) {
    return <div className="photo-card-grid">{items.map(renderCard)}</div>;
  }
  const rest = items.filter((item) => !pinned(item));
  return (
    <>
      <section className="list-section" aria-labelledby={headingId}>
        <h2 id={headingId} className="list-section__title">
          <Star size={16} strokeWidth={1.75} fill="currentColor" aria-hidden />
          {title}
        </h2>
        <div className="photo-card-grid">{top.map(renderCard)}</div>
      </section>
      {rest.length > 0 && (
        <div className="photo-card-grid list-rest">{rest.map(renderCard)}</div>
      )}
    </>
  );
};
