// 編集画面の質問票の見本で「質問一覧を閉じる/開く」を効かせる。
// 見本の iframe はスクリプトを動かさない(sandbox は allow-same-origin だけ、CSP は script を許さない)。
// 見本の HTML にスクリプトは足さず、同じオリジンの親の画面が中の DOM に手を入れる
// (変数を書く applyVariables・はみ出しを測る検査と同じ道)。
// 開閉の仕方は保存した質問票のスクリプト(app/server/sheet-client.ts)と同じにする。
// 同じになることは sheet-toggle.test.ts が確かめる

// 同じ文書に二度つながない。読み込み直した見本は別の文書になる
const wired = new WeakSet<Document>();

export const wireSheetToggle = (doc: Document | null | undefined): void => {
  if (!doc || wired.has(doc)) return;
  const board = doc.getElementById("app");
  const toggle = board?.querySelector<HTMLButtonElement>(".ds-sidebar-toggle");
  const sidebar = doc.getElementById("question-sidebar");
  const layout = board?.querySelector(".ds-board-layout");
  if (!toggle || !sidebar || !layout) return;
  wired.add(doc);
  toggle.addEventListener("click", () => {
    const open = sidebar.hidden;
    sidebar.hidden = !open;
    layout.classList.toggle("ds-sidebar-collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "質問一覧を閉じる" : "質問一覧を開く";
  });
};
