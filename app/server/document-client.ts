import { createHash } from "node:crypto";

// HTML 資料に埋めるスクリプト。コードブロックの「コピー」ボタンだけを動かす。
// 相手にするのは document-render.ts の code が組んだ DOM
// (.ds-code-block > pre.ds-code > code と、hidden の button[data-code-copy])。
// ボタンは hidden で描き、このスクリプトが動いたときだけ出す。スクリプトを止めた見本
// (取り込む前の見比べ・入口のカード・design/samples/)では、押しても何も起きないボタンを出さない。
// 画面の文言はボタンの data-copied / data-failed が持つ。中身が言語で変わらないので、指紋は1つ。
// この中では ` と ${ を使わない(handout-html.ts の safeInline と衝突させない)

const SOURCE = `(() => {
  const buttons = Array.from(document.querySelectorAll("[data-code-copy]"));
  if (buttons.length === 0) return;

  // 古い道のコピー。http で開いたスマホには navigator.clipboard が無く、
  // 許可を断られたブラウザーでは writeText が落ちる。そのときでも execCommand は効く
  const legacy = (text) => {
    if (typeof document.execCommand !== "function") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = (() => {
      try {
        return document.execCommand("copy") === true;
      } catch {
        return false;
      }
    })();
    area.remove();
    return copied;
  };

  // どの道でもコピーできなかったら、コードを選んだ状態にして手で写してもらう
  const selectCode = (code) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // 押したボタンの文字で知らせ、2秒で戻す
  const tell = (button, message) => {
    const label = button.dataset.label || button.textContent;
    button.dataset.label = label;
    button.textContent = message;
    window.clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(
      window.setTimeout(() => {
        button.textContent = label;
      }, 2000),
    );
  };

  const fallback = (button, code, text) => {
    if (legacy(text)) {
      tell(button, button.dataset.copied);
      return;
    }
    selectCode(code);
    tell(button, button.dataset.failed);
  };

  const copy = (button) => {
    const block = button.closest(".ds-code-block");
    const code = block && block.querySelector("pre.ds-code code");
    if (!code) return;
    const text = code.textContent || "";
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      fallback(button, code, text);
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => tell(button, button.dataset.copied),
      () => fallback(button, code, text),
    );
  };

  buttons.forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", () => copy(button));
  });
})();`;

// </script> で閉じられないように逃がす(handout-html.ts の safeInline と同じ。二度かけても変わらない)
export const documentScript = (): string => SOURCE.replaceAll("</", "<\\/");

// CSP はこのスクリプトの指紋だけを許す。中身に紛れ込んだ script(html ブロックの生の HTML)は動かない
export const documentScriptHash = (): string =>
  `'sha256-${createHash("sha256").update(documentScript()).digest("base64")}'`;
