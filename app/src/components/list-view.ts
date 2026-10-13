import { useState } from "react";
import type { Surface } from "../schema/design";

// 資料一覧の表示(184)。写真のカードか、絵の無い行のリスト。選んだ方を区分ごとに覚える。既定はカード

export type ListView = "cards" | "list";

const LIST_VIEW_KEY = "ai-handout-studio:list-view";

const keyOf = (surface: Surface): string => `${LIST_VIEW_KEY}:${surface}`;

export const readListView = (surface: Surface): ListView =>
  localStorage.getItem(keyOf(surface)) === "list" ? "list" : "cards";

export const writeListView = (surface: Surface, view: ListView): void => {
  localStorage.setItem(keyOf(surface), view);
};

// 質問票と HTML 資料の一覧は同じ部品なので、この画面で選んだ値も区分ごとに持つ
export const useListView = (surface: Surface) => {
  const [chosen, setChosen] = useState<Partial<Record<Surface, ListView>>>({});
  const view = chosen[surface] ?? readListView(surface);
  const setView = (next: ListView) => {
    writeListView(surface, next);
    setChosen((prev) => ({ ...prev, [surface]: next }));
  };
  return [view, setView] as const;
};
