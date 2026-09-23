import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

// 呼ぶ側で行き先を組むときの型(テンプレート個別のルート型を、ここで一旦ゆるめる)
export type PhotoCardLink = ComponentProps<typeof Link>;

// 写真のカード。テンプレートの一覧と資料一覧で使う共通の部品。
// 持つのは 16:9 の絵(押すと行き先を開くリンク)・合わせたとき(:hover・:focus-within)の見え方
// (浮き・枠・影・下の薄い暗がり・左下の名前・中央の透けた丸の印)・右上のボタンの置き場。
// 指で触る画面・prefers-reduced-motion の扱いは app.css の .photo-card* が持つ

export const PhotoCard = ({
  articleLabel,
  className,
  link,
  image,
  icon,
  name,
  action,
}: {
  // article の読み上げの名前(カードの題名)
  articleLabel: string;
  className?: string;
  // 絵を押したとき開く行き先。読み上げの名前は呼ぶ側が aria-label で渡す
  link: PhotoCardLink;
  // 16:9 の絵。読み込み中はローディングの表示などを渡す
  image: ReactNode;
  // 中央に出す透けた丸の印(aria-hidden はこの部品が付ける)
  icon: ReactNode;
  // 左下に出す名前(2行まで)
  name: string;
  // 右上のボタンの置き場。中身(☆・🗑 など)は呼ぶ側が渡す
  action?: ReactNode;
}) => {
  const cls = className ? `photo-card ${className}` : "photo-card";
  return (
    <article className={cls} aria-label={articleLabel}>
      <Link {...link} className="photo-card__preview">
        {image}
        <span className="photo-card__icon" aria-hidden>
          {icon}
        </span>
        <span className="photo-card__name">{name}</span>
      </Link>
      {action}
    </article>
  );
};
