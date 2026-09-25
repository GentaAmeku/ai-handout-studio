import { createHash } from "node:crypto";

// HTML 資料に埋めるスクリプト。次の4つを動かす。
// - コードブロックの「コピー」ボタン。相手にするのは document-render.ts の code が組んだ DOM
//   (.ds-code-block > pre.ds-code > code と、hidden の button[data-code-copy] > .ds-code-copy-text)。
//   ボタンは hidden で描き、このスクリプトが動いたときだけ出す。スクリプトを止めた見本
//   (取り込む前の見比べ・入口のカード・design/samples/)では、押しても何も起きないボタンを出さない。
//   ボタンはアイコンだけ。画面の文言はボタンの title / data-copied / data-failed が持つ。
// - 読んでいる位置。スクロールに合わせ、読んでいる章・節の目次(.ds-toc)のリンクに aria-current="location" を付ける。
//   見た目は付けない(色はテンプレートの CSS が付ける)。目次の無い資料では何もしない。
//   スクリプトが動かない見本と印刷では付かないだけで、読むのに困らない。
// - 章ごとに読む資料(paging: "chapter")。章を1つずつ見せ、前へ・次へと「すべての章を表示」を置く。
//   隠すのは document.css の画面だけの規則なので、スクリプトが動かない見本と印刷(PDF)では全章が流れる。
// - 表の列の幅。読む人が見出しの列の境目をドラッグして変える。幅は保存しない(読み込み直すと戻る)。
//   取っ手はこのスクリプトが置くので、スクリプトが動かない見本には出ない。印刷では隠す。
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
      // 章ごとに読む資料では、表示している章の中だけで数える
      const shown = entries.filter((entry) => !entry.target.closest("[data-paging-hidden]"));
      const root = document.documentElement;
      const line = Math.min(LINE, window.innerHeight / 4);
      // 下まで読み切ったら、線を越えられない短い最後の節も読んだことにする
      const scrollable = root.scrollHeight > window.innerHeight;
      const atEnd = scrollable && window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      if (atEnd) return shown[shown.length - 1];
      const passed = shown.filter((entry) => entry.target.getBoundingClientRect().top <= line);
      return passed[passed.length - 1] || shown[0];
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

  // 章ごとに読む資料(.ds-page[data-paging="chapter"])。表示しない章に data-paging-hidden を付け、
  // .ds-page に data-paging-active と今の章の番号(data-paging-index、1 から)を付ける。隠すのは CSS(画面だけ)。
  // 章は #章の id で選ぶ(戻る・進むも効く)。#節の id なら、その節を持つ章に切り替えてから節へ移る。
  // 本文の下に前へ・次へ、目次の上(目次が無ければ本文の上)に「すべての章を表示」の切り替えを置く。
  // 文言は .ds-page の data 属性(資料の言語)から読む
  const pageByChapter = () => {
    const page = document.querySelector(".ds-page[data-paging='chapter']");
    const main = page && page.querySelector(".ds-main");
    if (!main) return;
    const chapters = Array.from(main.children).filter((node) => node.tagName === "SECTION");
    if (chapters.length < 2) return;
    const toc = page.querySelector(".ds-toc");
    const tocItems = toc ? Array.from(toc.querySelectorAll(":scope > ol > li")) : [];
    const state = { all: false, index: 0 };

    const pager = document.createElement("nav");
    pager.className = "ds-pager";
    pager.setAttribute("aria-label", page.dataset.pagerLabel || "");
    main.appendChild(pager);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ds-paging-toggle";
    const list = toc && toc.querySelector(":scope > ol");
    if (list) toc.insertBefore(toggle, list);
    else main.insertBefore(toggle, main.firstChild);

    const pagerLink = (chapter, kind) => {
      const link = document.createElement("a");
      link.className = "ds-pager-" + kind;
      link.href = "#" + chapter.id;
      const label = document.createElement("span");
      label.className = "ds-pager-label";
      label.textContent = (kind === "prev" ? page.dataset.pagerPrev : page.dataset.pagerNext) || "";
      const title = document.createElement("span");
      title.className = "ds-pager-title";
      const heading = chapter.querySelector("h2, h3");
      title.textContent = heading ? heading.textContent : "";
      link.append(label, title);
      return link;
    };

    const render = () => {
      const current = chapters[state.index];
      chapters.forEach((chapter) => {
        chapter.toggleAttribute("data-paging-hidden", !state.all && chapter !== current);
      });
      page.toggleAttribute("data-paging-active", !state.all);
      page.dataset.pagingIndex = String(state.index + 1);
      tocItems.forEach((item) => {
        const link = item.querySelector("a");
        item.toggleAttribute("data-current", !state.all && Boolean(link) && link.getAttribute("href") === "#" + current.id);
      });
      pager.textContent = "";
      pager.hidden = state.all;
      const prev = chapters[state.index - 1];
      const next = chapters[state.index + 1];
      if (prev) pager.appendChild(pagerLink(prev, "prev"));
      if (next) pager.appendChild(pagerLink(next, "next"));
      toggle.textContent = (state.all ? page.dataset.pagingShowOne : page.dataset.pagingShowAll) || "";
      toggle.setAttribute("aria-pressed", state.all ? "true" : "false");
      // 読んでいる位置の印を、表示した章で数え直す
      window.dispatchEvent(new Event("scroll"));
    };

    const targetOf = () => {
      const raw = window.location.hash.slice(1);
      const id = (() => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })();
      return id ? document.getElementById(id) : null;
    };

    // scroll: 章なら上端へ、節ならその節へ移る。開いたとき # が無ければ移らない
    const follow = (scroll) => {
      if (state.all) return;
      const target = targetOf();
      const index = target ? chapters.findIndex((chapter) => chapter.contains(target)) : -1;
      if (index === -1 && target) return;
      state.index = Math.max(0, index);
      render();
      if (!scroll) return;
      if (target && target !== chapters[state.index]) target.scrollIntoView();
      else window.scrollTo(0, 0);
    };

    // 全章を流している間に読み進めた章。章ごとに戻すとき、その章を開く
    const readingIndex = () => {
      if (window.scrollY <= 0) return state.index;
      const passed = chapters.filter((chapter) => chapter.getBoundingClientRect().top <= LINE);
      return Math.max(0, passed.length - 1);
    };

    toggle.addEventListener("click", () => {
      if (state.all) state.index = readingIndex();
      state.all = !state.all;
      render();
      if (state.all) chapters[state.index].scrollIntoView();
      else window.scrollTo(0, 0);
    });
    window.addEventListener("hashchange", () => follow(true));
    follow(Boolean(targetOf()));
  };

  // 表の列の幅(document-render.ts の table.ds-table[data-col-resize])。見出しの列の境目ごとに取っ手を置き、
  // ドラッグか左右キーで、隣り合う2列の間で幅をやり取りする。表全体の幅は変えない。ダブルクリックで元に戻す。
  // 初めて動かすときに今の見た目の幅を colgroup の % へ写し、data-col-resized で固定の割り付けに切り替える
  // (測るのを動かすときまで待つのは、章ごとに読む資料の隠れた章では幅が測れないため)。
  // 取っ手の名前は表の data-col-resize(資料の言語)から読む
  const resizeColumns = () => {
    // 1列の最小の幅(px)と、キー1回で動かす幅(表の幅に対する %)
    const MIN = 48;
    const STEP = 2;

    const setUp = (table) => {
      const row = table.tHead && table.tHead.rows[0];
      const heads = row ? Array.from(row.cells) : [];
      if (heads.length < 2 || heads.some((cell) => cell.colSpan !== 1)) return;
      const label = table.dataset.colResize || "";
      const percent = (px) => (px / row.getBoundingClientRect().width) * 100;
      const widthOf = (col) => parseFloat(col.style.width) || 0;

      const cols = () => {
        const current = table.querySelector(":scope > colgroup[data-col-resize-group]");
        if (current) return Array.from(current.children);
        const group = document.createElement("colgroup");
        group.setAttribute("data-col-resize-group", "");
        heads.forEach((cell) => {
          const col = document.createElement("col");
          col.style.width = percent(cell.getBoundingClientRect().width) + "%";
          group.appendChild(col);
        });
        table.insertBefore(group, table.firstChild);
        table.setAttribute("data-col-resized", "");
        return Array.from(group.children);
      };

      const handles = heads.slice(0, -1).map((cell) => {
        const handle = document.createElement("span");
        handle.className = "ds-col-resize";
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute("aria-label", label);
        handle.setAttribute("aria-valuemin", "0");
        handle.setAttribute("aria-valuemax", "100");
        handle.title = label;
        handle.tabIndex = 0;
        cell.appendChild(handle);
        return handle;
      });

      // 取っ手の値は、左の列が表の幅に占める %
      const sync = () => {
        if (row.getBoundingClientRect().width === 0) return;
        handles.forEach((handle, index) => {
          handle.setAttribute("aria-valuenow", String(Math.round(percent(heads[index].getBoundingClientRect().width))));
        });
      };

      // index の列の幅を width(%)にし、右隣の列で差を受ける。どちらも MIN より細くしない
      const place = (index, width) => {
        const list = cols();
        const left = list[index];
        const right = list[index + 1];
        const pair = widthOf(left) + widthOf(right);
        const min = Math.min(percent(MIN), pair / 2);
        const next = Math.min(Math.max(width, min), pair - min);
        left.style.width = next + "%";
        right.style.width = pair - next + "%";
        sync();
      };

      const reset = () => {
        const group = table.querySelector(":scope > colgroup[data-col-resize-group]");
        if (group) group.remove();
        table.removeAttribute("data-col-resized");
        sync();
      };

      handles.forEach((handle, index) => {
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const start = { x: event.clientX, width: widthOf(cols()[index]) };
          handle.setPointerCapture(event.pointerId);
          handle.setAttribute("data-dragging", "");
          const move = (moved) => place(index, start.width + percent(moved.clientX - start.x));
          const end = () => {
            handle.removeAttribute("data-dragging");
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", end);
            handle.removeEventListener("pointercancel", end);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", end);
          handle.addEventListener("pointercancel", end);
        });
        handle.addEventListener("keydown", (event) => {
          const step = event.key === "ArrowLeft" ? -STEP : event.key === "ArrowRight" ? STEP : 0;
          if (step === 0) return;
          event.preventDefault();
          place(index, widthOf(cols()[index]) + step);
        });
        handle.addEventListener("dblclick", reset);
        handle.addEventListener("focus", sync);
      });
      sync();
    };

    Array.from(document.querySelectorAll("table.ds-table[data-col-resize]")).forEach(setUp);
  };

  copyButtons();
  resizeColumns();
  pageByChapter();
  markLocation();
})();`;

// </script> で閉じられないように逃がす(handout-html.ts の safeInline と同じ。二度かけても変わらない)
export const documentScript = (): string => SOURCE.replaceAll("</", "<\\/");

// CSP はこのスクリプトの指紋だけを許す。中身に紛れ込んだ script(html ブロックの生の HTML)は動かない
export const documentScriptHash = (): string =>
  `'sha256-${createHash("sha256").update(documentScript()).digest("base64")}'`;
