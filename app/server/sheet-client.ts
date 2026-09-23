import { createHash } from "node:crypto";
import type { Locale } from "../src/schema/profile.ts";

// 保存した質問票の HTML に埋めるスクリプト。質問を移動し、回答を Markdown に
// まとめてコピーする。入力はこのブラウザの中に残し、開き直したら戻す。
// 回答をサーバーへ送ることはしない。
// 相手にするのは sheet-render.ts が interactive で組んだ DOM
// (data-question / data-move / data-go / data-progress / data-copy /
//  data-qid / data-qtype / data-qtitle / data-note / data-field / data-label /
//  data-at-end / data-share)。
// この中では ` と ${ を使わない(T.xxx を差し込む以外は文字列連結にする)。
// 画面の文言は先頭の T に埋め込む。JSON.stringify の中身にバックスラッシュ・
// バックティックは出ないので、外側のテンプレート文字列の逃がし(safeInline)と衝突しない

// 画面の文言。言語ごとに埋め込む
type ClientStrings = {
  readonly sidebarClose: string;
  readonly sidebarOpenLabel: string;
  readonly questionWord: string;
  readonly statusDone: string;
  readonly statusEmpty: string;
  readonly setLabel: string;
  readonly revisionLabel: string;
  readonly submissionNote: string;
  readonly answerLabel: string;
  readonly unanswered: string;
  readonly noteLabel: string;
  readonly copyFailedShort: string;
  readonly copyFailedLong: string;
  readonly markdownAriaLabel: string;
  readonly saveToFile: string;
  readonly copiedPrefix: string;
  readonly copiedLinesSuffix: string;
  readonly copiedButton: string;
};

const CLIENT_STRINGS: Record<Locale, ClientStrings> = {
  ja: {
    sidebarClose: "質問一覧を閉じる",
    sidebarOpenLabel: "質問一覧を開く",
    questionWord: "質問",
    statusDone: "✓ 入力済み",
    statusEmpty: "未入力",
    setLabel: "質問群",
    revisionLabel: "版",
    submissionNote: "回答の返却です。外部操作の承認は含みません。",
    answerLabel: "回答",
    unanswered: "(未記入)",
    noteLabel: "補足",
    copyFailedShort: "コピーできませんでした。下の欄から写してください。",
    copyFailedLong:
      "コピーできませんでした。下の欄を長押しして「すべて選択」→「コピー」してください。",
    markdownAriaLabel: "回答の Markdown",
    saveToFile: "ファイルで保存",
    copiedPrefix: "✓ コピーしました(",
    copiedLinesSuffix: " 行)。会話に貼り付けてください。",
    copiedButton: "コピーしました",
  },
  en: {
    sidebarClose: "Close question list",
    sidebarOpenLabel: "Open question list",
    questionWord: "Question",
    statusDone: "✓ Answered",
    statusEmpty: "Not answered",
    setLabel: "Question set",
    revisionLabel: "rev",
    submissionNote:
      "These are answers only. No external actions are authorized.",
    answerLabel: "Answer",
    unanswered: "(not answered)",
    noteLabel: "Notes",
    copyFailedShort: "Couldn't copy. Please copy the text from the box below.",
    copyFailedLong:
      'Couldn\'t copy. Long-press the box below, choose "Select all", then "Copy".',
    markdownAriaLabel: "Answers as Markdown",
    saveToFile: "Save to file",
    copiedPrefix: "✓ Copied (",
    copiedLinesSuffix: " lines). Paste it into the chat.",
    copiedButton: "Copied",
  },
};

const sourceFor = (lang: Locale): string => `(() => {
  const T = ${JSON.stringify(CLIENT_STRINGS[lang])};
  const board = document.getElementById("app");
  if (!board) return;
  // 共有用の束の印。失敗の道で「ファイルで保存」を出さない(手で写す欄だけ)
  const shared = "share" in board.dataset;
  const sections = Array.from(board.querySelectorAll("[data-question]"));
  if (sections.length === 0) return;
  const links = Array.from(board.querySelectorAll(".ds-question-link"));
  const prev = board.querySelector('[data-move="prev"]');
  const next = board.querySelector('[data-move="next"]');
  const atEnd = board.querySelector("[data-at-end]");
  const progress = board.querySelector("[data-progress]");
  const toggle = board.querySelector(".ds-sidebar-toggle");
  const sidebar = document.getElementById("question-sidebar");
  const layout = board.querySelector(".ds-board-layout");
  const first = sections.findIndex((section) => !section.hidden);
  let current = first < 0 ? 0 : first;

  const show = (index) => {
    current = Math.min(Math.max(index, 0), sections.length - 1);
    sections.forEach((section, i) => {
      section.hidden = i !== current;
    });
    links.forEach((link) => {
      const at = Number(link.dataset.go) === current;
      if (at) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    const last = current === sections.length - 1;
    if (prev) prev.disabled = current === 0;
    // 最後の質問では、次へのところに「回答をコピー」を出す
    if (next) next.hidden = last;
    if (atEnd) atEnd.hidden = !last;
    if (progress) {
      progress.textContent = T.questionWord + " " + (current + 1) + " / " + sections.length;
    }
    window.scrollTo({ top: 0 });
    // 見ている質問も残す。remember は下で作る(呼ばれるのは作った後)
    remember();
  };

  if (prev) prev.addEventListener("click", () => show(current - 1));
  if (next) next.addEventListener("click", () => show(current + 1));
  links.forEach((link) => {
    link.addEventListener("click", () => show(Number(link.dataset.go)));
  });

  if (toggle && sidebar && layout) {
    toggle.addEventListener("click", () => {
      const open = sidebar.hidden;
      sidebar.hidden = !open;
      layout.classList.toggle("ds-sidebar-collapsed", !open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? T.sidebarClose : T.sidebarOpenLabel;
    });
  }

  // 単一回答は、選ぶと回答文に項目名が入る(質問票スキルと同じ)。文章はそのあと自由に直せる
  sections.forEach((section) => {
    const note = section.querySelector("[data-note]");
    if (!note) return;
    Array.from(section.querySelectorAll('input[type="radio"]')).forEach(
      (input) => {
        input.addEventListener("change", () => {
          if (!input.checked) return;
          const label = input.nextElementSibling;
          // 項目名の横の推奨の印(「（推奨）」「 (recommended)」)も文字のまま入る
          note.value = (label ? label.textContent : input.value).trim();
        });
      },
    );
  });

  // 答えるたびに、質問一覧の状態と入力済みの数を今の欄から数え直す
  const answered = (section) =>
    section.querySelector("input:checked") !== null ||
    value(section.querySelector("[data-note]")) !== "";

  const recount = () => {
    const done = sections.map(answered);
    links.forEach((link) => {
      const status = link.querySelector(".ds-status");
      const complete = done[Number(link.dataset.go)] === true;
      if (!status) return;
      status.dataset.complete = String(complete);
      status.textContent = complete ? T.statusDone : T.statusEmpty;
    });
    const count = String(done.filter(Boolean).length);
    Array.from(board.querySelectorAll("[data-done-count]")).forEach((node) => {
      node.textContent = count;
    });
  };

  board.addEventListener("input", recount);
  board.addEventListener("change", recount);

  // ここから回答のコピー。質問票スキルの markdown() と同じ形にする
  const value = (node) => (node ? node.value.trim() : "");

  const block = (section) => {
    const type = section.dataset.qtype;
    const note = value(section.querySelector("[data-note]"));
    const picked = Array.from(section.querySelectorAll("input:checked")).map(
      (input) => {
        const label = input.nextElementSibling;
        return (label ? label.textContent : input.value).trim();
      },
    );
    // 単一回答は回答文が正本。回答文が空なら選んだ項目名で補う
    const answer =
      type === "multiple" ? picked.join(" / ") : note || picked.join(" / ");
    const extra = Array.from(section.querySelectorAll("[data-field]"))
      .filter((field) => value(field))
      .map((field) => field.dataset.label + ": " + value(field));
    return [
      "## " + section.dataset.qtitle + " (" + section.dataset.qid + ")",
      T.answerLabel + ": " + (answer || T.unanswered),
    ]
      .concat(type === "multiple" && note ? [T.noteLabel + ": " + note] : [])
      .concat(extra)
      .join("\\n");
  };

  const markdown = () =>
    [
      "# " + board.dataset.title,
      T.setLabel + ": " + board.dataset.docId + " / " + T.revisionLabel + ": " + board.dataset.revision,
      T.submissionNote,
    ]
      .concat(sections.map(block))
      .join("\\n\\n");

  // コピーのボタンの上に浮かぶ吹き出し。3秒で消す。中が空なら CSS が隠す。
  // 続けて押したら、前の消す予定を取り消して数え直す
  const tipTimer = { id: 0 };
  const tell = (text) => {
    const tips = Array.from(board.querySelectorAll("[data-copy-status]"));
    tips.forEach((node) => {
      node.textContent = text;
    });
    window.clearTimeout(tipTimer.id);
    tipTimer.id = window.setTimeout(() => {
      tips.forEach((node) => {
        node.textContent = "";
      });
    }, 3000);
  };

  // 手で写す欄と保存のリンクを片づける。前に失敗したあとでコピーできたとき
  const tidy = () => {
    Array.from(board.querySelectorAll("[data-copy-fallback]")).forEach(
      (node) => node.remove(),
    );
  };

  // 古い道のコピー。http で開いたスマホには navigator.clipboard が無く、
  // 許可を断られたブラウザーでは writeText が落ちる。そのときでも execCommand は効く。
  // クリックの中(または writeText が断られた直後)で呼ばないと効かない。
  // 画面に出さない欄で選ぶ。readonly にしてスマホのキーボードを出さない
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

  // どの道でもコピーできなかったときの逃げ道。長押しで選べる欄と、ファイルで保存するリンクを出す。
  // 画面下の帯のすぐ後ろに置く。見出しの帯に入れると題名の列を押しつぶした
  const offer = (text) => {
    const nav = board.querySelector(".ds-page-navigation");
    if (!nav) return;
    const found = board.querySelector("[data-copy-fallback]");
    const box = found || document.createElement("div");
    if (!found) {
      box.className = "ds-copy-fallback";
      box.setAttribute("data-copy-fallback", "");
      const lead = document.createElement("p");
      lead.className = "ds-subtle";
      lead.textContent = T.copyFailedLong;
      const area = document.createElement("textarea");
      area.className = "ds-input";
      area.rows = 6;
      area.setAttribute("data-copy-text", "");
      area.setAttribute("aria-label", T.markdownAriaLabel);
      box.append(lead, area);
      // 共有の束では、ダウンロードで始まる保存は Artifact の中で止まるので出さない
      if (!shared) {
        const link = document.createElement("a");
        link.className = "ds-button";
        link.setAttribute("data-download", "");
        link.textContent = T.saveToFile;
        box.append(link);
      }
      nav.insertAdjacentElement("afterend", box);
    }
    const area = box.querySelector("[data-copy-text]");
    const link = box.querySelector("[data-download]");
    area.value = text;
    // blob: は原寸ページの CSP(default-src 'none')で止まりうるので、data: の URL で渡す
    if (link) {
      link.setAttribute("download", "answers-" + board.dataset.docId + ".md");
      link.setAttribute(
        "href",
        "data:text/markdown;charset=utf-8," + encodeURIComponent(text),
      );
    }
    area.focus();
    area.select();
  };

  const fail = (text) => {
    tell(T.copyFailedShort);
    offer(text);
  };

  // 押したボタンの文字と、その上の吹き出しで知らせる。
  // 帯は3つの列で組むので、吹き出しは浮かせて列を取らない。何をコピーしたかは行数で伝える
  const done = (button, text) => {
    tidy();
    tell(T.copiedPrefix + text.split("\\n").length + T.copiedLinesSuffix);
    const label = button.textContent;
    button.textContent = T.copiedButton;
    window.setTimeout(() => {
      button.textContent = label;
    }, 2000);
  };

  // ① clipboard → ② execCommand → ③ 手で写す欄とファイルで保存
  const fallback = (button, text) => {
    if (legacy(text)) done(button, text);
    else fail(text);
  };

  const copy = (button) => {
    const text = markdown();
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      fallback(button, text);
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => done(button, text),
      () => fallback(button, text),
    );
  };

  Array.from(board.querySelectorAll("[data-copy]")).forEach((button) => {
    button.addEventListener("click", () => copy(button));
  });

  // ここから入力を残す。リロードしても消えず、あとで開き直しても答えた内容を見返せる。
  // 質問票と版ごとに分け、sheet update で版が変わったら前の入力は戻さない。
  // 残した入力は、資料に記録した回答(answers.json)より優先する
  const key =
    "ai-handout-studio:sheet:" + board.dataset.docId + ":" + board.dataset.revision;
  // 全問を並べる形には前へ・次へが無い。そのときは質問を隠さない
  const paged = Boolean(prev || next);

  // 保存を止めたブラウザなどでは、localStorage に触れるだけで落ちる。そのときは残さない
  const storage = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  const raw = (node) => (node ? node.value : "");

  const snapshot = () => ({
    current: current,
    answers: sections.map((section) => ({
      id: section.dataset.qid,
      selected: Array.from(section.querySelectorAll("input:checked")).map(
        (input) => input.value,
      ),
      note: raw(section.querySelector("[data-note]")),
      fields: Array.from(section.querySelectorAll("[data-field]")).map(
        (field) => [field.dataset.field, field.value],
      ),
    })),
  });

  const remember = () => {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(key, JSON.stringify(snapshot()));
    } catch {
      // 容量が足りないときなどは残さない。画面はそのまま使える
    }
  };

  const load = () => {
    const store = storage();
    if (!store) return null;
    try {
      const saved = JSON.parse(store.getItem(key) || "null");
      return saved && Array.isArray(saved.answers) ? saved : null;
    } catch {
      return null;
    }
  };

  const restore = (saved) => {
    saved.answers.forEach((entry) => {
      const section = sections.find((node) => node.dataset.qid === entry.id);
      if (!section) return;
      const selected = Array.isArray(entry.selected) ? entry.selected : [];
      Array.from(
        section.querySelectorAll('input[type="radio"], input[type="checkbox"]'),
      ).forEach((input) => {
        input.checked = selected.includes(input.value);
      });
      const note = section.querySelector("[data-note]");
      if (note && typeof entry.note === "string") note.value = entry.note;
      const fields = Array.isArray(entry.fields) ? entry.fields : [];
      Array.from(section.querySelectorAll("[data-field]")).forEach((field) => {
        const found = fields.find((pair) => pair[0] === field.dataset.field);
        if (found) field.value = found[1];
      });
    });
    recount();
    if (paged) show(Number(saved.current) || 0);
  };

  const saved = load();
  if (saved) restore(saved);
  board.addEventListener("input", remember);
  board.addEventListener("change", remember);
})();`;

// </script> で閉じられないように逃がす(handout-html.ts の safeInline と同じ。二度かけても変わらない)
export const sheetScript = (lang: Locale): string =>
  sourceFor(lang).replaceAll("</", "<\\/");

// CSP はこのスクリプトの指紋だけを許す。中身に紛れ込んだ script は動かない。言語ごとに中身が違うので指紋も違う
export const sheetScriptHash = (lang: Locale): string =>
  `'sha256-${createHash("sha256").update(sheetScript(lang)).digest("base64")}'`;
