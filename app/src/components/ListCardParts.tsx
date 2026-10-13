import type { UseMutationResult } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { FavoriteResult } from "../api/types";
import { useLanguage } from "../i18n/language";
import { useRefocusAfterMove } from "./useRefocusAfterMove";

// 資料一覧の写真のカードで3区分が共通に使う部品。
// 右上の 🗑(確かめるダイアログのあと消す)と ☆(お気に入り)、絵の代わりに出す印と一言。
// 🗑 と ☆ はリスト表示の行(184)の右端にも置く

// お気に入りの付け外しは一覧に1つ持つ(カードは区切りを移るたびに作り直され、カードの中の状態は消える)。
// カードには、自分の資料の押している途中と失敗だけを渡す
export type FavoriteControl = {
  pending: boolean;
  error: string | undefined;
  onToggle: (favorite: boolean) => void;
};

export const favoriteControlOf = <Context,>(
  mutation: UseMutationResult<FavoriteResult, Error, FavoriteResult, Context>,
  id: string,
): FavoriteControl => {
  const mine = mutation.variables?.id === id;
  return {
    pending: mine && mutation.isPending,
    error: mine && mutation.isError ? mutation.error.message : undefined,
    onToggle: (favorite) => mutation.mutate({ id, favorite }),
  };
};

// 🗑 と ☆ の置き場。写真のカードの右上か、リスト表示の行の右端。動きは同じで、見た目のクラスだけが違う
const ACTION_CLASS = {
  card: {
    error: "photo-card__error",
    group: "photo-card__actions",
    button: "photo-card__action",
  },
  row: {
    error: "list-row__error",
    group: "list-row__actions",
    button: "list-row__action",
  },
} as const;

export type ActionPlace = keyof typeof ACTION_CLASS;

const CardFavoriteButton = ({
  id,
  title,
  favorite,
  control,
  className,
}: {
  id: string;
  title: string;
  favorite: boolean;
  control: FavoriteControl;
  className: string;
}) => {
  const { t } = useLanguage();
  const { ref, markMoving } = useRefocusAfterMove<HTMLButtonElement>(id);
  return (
    <button
      ref={ref}
      type="button"
      className={`${className} ${className}--favorite`}
      disabled={control.pending}
      aria-pressed={favorite}
      aria-label={t("deckCard.favoriteNamed", { title })}
      title={t(favorite ? "deckCard.unfavorite" : "deckCard.favorite")}
      onClick={(event) => {
        markMoving(event);
        control.onToggle(!favorite);
      }}
    >
      <Star
        size={16}
        strokeWidth={1.75}
        fill={favorite ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
};

const CardDeleteButton = ({
  title,
  pending,
  onConfirm,
  className,
}: {
  // 資料の題名。読み上げの名前と確かめるダイアログに出す
  title: string;
  pending: boolean;
  onConfirm: () => void;
  className: string;
}) => {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className={`${className} ${className}--danger`}
      disabled={pending}
      aria-label={t("deckCard.deleteNamed", { title })}
      title={pending ? t("deckCard.deleting") : t("deckCard.delete")}
      onClick={() => {
        if (!window.confirm(t("deckCard.deleteConfirm", { title }))) return;
        onConfirm();
      }}
    >
      <Trash2 size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
};

// カードの右上の置き場。🗑 と ☆ を並べ、☆ を角に置く(テンプレートの一覧の ★ と同じ所)。
// 消せなかったとき・付け外しできなかったときは、カードの上の端に知らせを出す。
// リスト表示の行(place="row")では右端に並べ、知らせは行の下に出す
export const CardActions = ({
  id,
  title,
  favorite,
  favoriteControl,
  deleting,
  deleteError,
  onDelete,
  place = "card",
}: {
  id: string;
  title: string;
  favorite: boolean;
  favoriteControl: FavoriteControl;
  deleting: boolean;
  deleteError: string | undefined;
  onDelete: () => void;
  place?: ActionPlace;
}) => {
  const error = deleteError ?? favoriteControl.error;
  const cls = ACTION_CLASS[place];
  return (
    <>
      {error && (
        <p className={`form-error ${cls.error}`} role="alert">
          {error}
        </p>
      )}
      <span className={cls.group}>
        <CardDeleteButton
          title={title}
          pending={deleting}
          onConfirm={onDelete}
          className={cls.button}
        />
        <CardFavoriteButton
          id={id}
          title={title}
          favorite={favorite}
          control={favoriteControl}
          className={cls.button}
        />
      </span>
    </>
  );
};

// 読めない資料・スライドの無い資料の絵の代わり。印と一言を出す
export const CardMessage = ({
  icon,
  text,
  tone,
  detail,
}: {
  icon?: ReactNode;
  text: string;
  tone: "muted" | "danger";
  // 読めない理由など。合わせたときの吹き出しに出す
  detail?: string;
}) => (
  <span
    className={`photo-card__message photo-card__message--${tone}`}
    title={detail}
  >
    {icon}
    <span>{text}</span>
  </span>
);
