import { type MouseEvent, useEffect, useRef } from "react";

// ☆(お気に入り 115・既定 116)を押すと、カードが区切りを移って作り直される。
// キーボードで押したときに行き先を見失わないよう、作り直されたカードのボタンへ合わせ直す

const pending: { key: string | undefined } = { key: undefined };

export const useRefocusAfterMove = <E extends HTMLElement>(key: string) => {
  const ref = useRef<E>(null);
  useEffect(() => {
    if (pending.key !== key) return;
    pending.key = undefined;
    ref.current?.focus();
  }, [key]);
  // ボタンを押したときに呼ぶ。マウスで押したときは合わせ直さない
  // (移った先のカードが合わせたときの見え方になる)
  const markMoving = (event: MouseEvent) => {
    if (event.detail === 0) pending.key = key;
  };
  return { ref, markMoving };
};
