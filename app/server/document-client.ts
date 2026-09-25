import { createHash } from "node:crypto";

// HTML 資料に埋めるスクリプト。次の2つを動かす。
// - コードブロックの「コピー」ボタン。相手にするのは document-render.ts の code が組んだ DOM
//   (.ds-code-block > pre.ds-code > code と、hidden の button[data-code-copy] > .ds-code-copy-text)。
//   ボタンは hidden で描き、このスクリプトが動いたときだけ出す。スクリプトを止めた見本
//   (取り込む前の見比べ・入口のカード・design/samples/)では、押しても何も起きないボタンを出さない。
//   ボタンはアイコンだけ。画面の文言はボタンの title / data-copied / data-failed が持つ。
// - 読んでいる位置。スクロールに合わせ、読んでいる章・節の目次(.ds-toc)のリンクに aria-current="location" を付ける。
//   見た目は付けない(色はテンプレートの CSS が付ける)。目次の無い資料では何もしない。
//   スクリプトが動かない見本と印刷では付かないだけで、読むのに困らない。
// 中身が言語で変わらないので、指紋は1つ。
// この中では ` と ${ を使わない(handout-html.ts の safeInline と衝突させない)

const SOURCE = `(() => {
  // 読んでいる位置の目安。画面の上からこの高さの線を最後に越えた見出しを、読んでいるところとみなす
  const LINE = 96;

  const markLocation = () => {
    const toc = document.querySelector(".ds-toc");
    if (!toc) return;
    // 目次のリンクと飛び先(章は section、節は h3)。目次の順は本文の順と同じ
    const entries = Array.from(toc.querySelectorAll("a[href^='#']")).flatMap((link) => {
      const target = document.getElementById((link.getAttribute("href") || "").slice(1));
      return target ? [{ link, target }] : [];
    });
    if (entries.length === 0) return;

    const current = () => {
      const root = document.documentElement;
      const line = Math.min(LINE, window.innerHeight / 4);
      // 下まで読み切ったら、線を越えられない短い最後の節も読んだことにする
      const scrollable = root.scrollHeight > window.innerHeight;
      const atEnd = scrollable && window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      if (atEnd) return entries[entries.length - 1];
      const passed = entries.filter((entry) => entry.target.getBoundingClientRect().top <= line);
      return passed[passed.length - 1] || entries[0];
    };

    const update = () => {
      const now = current();
      entries.forEach((entry) => {
        if (entry === now) {
          if (entry.link.getAttribute("aria-current") !== "location") {
            entry.link.setAttribute("aria-current", "location");
          }
          return;
        }
        entry.link.removeAttribute("aria-current");
      });
    };

    // スクロールのたびには測らず、描く前に1回だけ測る
    const frame = { id: 0 };
    const schedule = () => {
      if (typeof window.requestAnimationFrame !== "function") {
        update();
        return;
      }
      if (frame.id) return;
      frame.id = window.requestAnimationFrame(() => {
        frame.id = 0;
        update();
      });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
  };

  const copyButtons = () => {
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

    // 押したボタンのアイコン(data-state)と、読み上げの文字・ツールチップで知らせ、2秒で戻す
    const tell = (button, state, message) => {
      const text = button.querySelector(".ds-code-copy-text");
      const label = button.dataset.label || button.title;
      button.dataset.label = label;
      button.dataset.state = state;
      button.title = message;
      if (text) text.textContent = message;
      window.clearTimeout(Number(button.dataset.timer));
      button.dataset.timer = String(
        window.setTimeout(() => {
          delete button.dataset.state;
          button.title = label;
          if (text) text.textContent = label;
        }, 2000),
      );
    };

    const fallback = (button, code, text) => {
      if (legacy(text)) {
        tell(button, "copied", button.dataset.copied);
        return;
      }
      selectCode(code);
      tell(button, "failed", button.dataset.failed);
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
        () => tell(button, "copied", button.dataset.copied),
        () => fallback(button, code, text),
      );
    };

    buttons.forEach((button) => {
      button.hidden = false;
      button.addEventListener("click", () => copy(button));
    });
  };

  copyButtons();
  markLocation();
})();`;

// </script> で閉じられないように逃がす(handout-html.ts の safeInline と同じ。二度かけても変わらない)
export const documentScript = (): string => SOURCE.replaceAll("</", "<\\/");

// CSP はこのスクリプトの指紋だけを許す。中身に紛れ込んだ script(html ブロックの生の HTML)は動かない
export const documentScriptHash = (): string =>
  `'sha256-${createHash("sha256").update(documentScript()).digest("base64")}'`;
