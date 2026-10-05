import { createHash } from "node:crypto";
import type { Locale } from "../src/schema/profile.ts";
import { HANDOUT_STRINGS } from "./handout-i18n.ts";
import type { HandoutKind } from "./handouts.ts";
import { escapeHtml } from "./sheet-render.ts";

// 質問票と HTML 資料をアプリで原寸に開いたときだけ、署名の行の右端に置く操作。
// 資料一覧へ移るリンクと、お気に入りの ☆(アプリの1件の画面の帯の ☆ と同じお気に入り)。
// 見た目はテンプレートの部品(design/document.css の .ds-app-actions)で、色はテンプレートのトークンから引く。
// 出すかどうかは見本の口(handout-api.ts)が決め、書き出し・共有・印刷には出さない

export type AppActions = {
  readonly id: string;
  // 「資料一覧」で移るアプリの経路
  readonly listPath: string;
  readonly favorite: boolean;
};

// 区分ごとの資料一覧(アプリの経路。app/src/pages/sections/paths.ts と同じ)
export const handoutListPath: Record<HandoutKind, string> = {
  sheet: "/sheets",
  document: "/documents",
};

const BACK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

// 付いているときは CSS が塗る(.ds-app-action[aria-pressed="true"] .ds-app-action-star)
const STAR_ICON =
  '<svg class="ds-app-action-star" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

// 署名の行に入れる。名前は文字のまま置き、span で包まない
// (署名の span と span の間に区切りを出すテンプレートがあるため)
export const appActionsHtml = (actions: AppActions, lang: Locale): string => {
  const t = HANDOUT_STRINGS[lang].actions;
  return [
    `<nav class="ds-app-actions" aria-label="${escapeHtml(t.label)}">`,
    `<a class="ds-app-action" href="${escapeHtml(actions.listPath)}">${BACK_ICON}${escapeHtml(t.list)}</a>`,
    `<button type="button" class="ds-app-action" aria-pressed="${actions.favorite}"`,
    ` title="${escapeHtml(actions.favorite ? t.favoriteRemove : t.favoriteAdd)}"`,
    ` data-favorite-id="${escapeHtml(actions.id)}"`,
    ` data-add="${escapeHtml(t.favoriteAdd)}" data-remove="${escapeHtml(t.favoriteRemove)}"`,
    ` data-failed="${escapeHtml(t.favoriteFailed)}">${STAR_ICON}${escapeHtml(t.favorite)}</button>`,
    '<span class="ds-app-actions-status" role="status"></span>',
    "</nav>",
  ].join("");
};

// ☆ を押すと、アプリのお気に入りの API へ送る。付け外しできたら印と吹き出しを替え、
// できなかったら印はそのままで一言を出す。文言は ☆ の data 属性が持つので、指紋は言語で変わらない。
// この中では ` と ${ を使わない(handout-html.ts の safeInline と衝突させない)
const SOURCE = `(() => {
  const button = document.querySelector("button[data-favorite-id]");
  if (!button) return;
  const status = document.querySelector(".ds-app-actions-status");
  const say = (message) => {
    if (status) status.textContent = message;
  };
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-pressed") !== "true";
    button.disabled = true;
    say("");
    fetch("/api/favorites/" + encodeURIComponent(button.dataset.favoriteId || ""), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        button.setAttribute("aria-pressed", String(next));
        button.title = (next ? button.dataset.remove : button.dataset.add) || "";
      })
      .catch(() => say(button.dataset.failed || ""))
      .finally(() => {
        button.disabled = false;
      });
  });
})();`;

// </script> で閉じられないように逃がす(handout-html.ts の safeInline と同じ。二度かけても変わらない)
export const appActionsScript = (): string => SOURCE.replaceAll("</", "<\\/");

// 見本の口の CSP は、操作を出すときだけこの指紋も許す
export const appActionsScriptHash = (): string =>
  `'sha256-${createHash("sha256").update(appActionsScript()).digest("base64")}'`;
