import { type FigureInput, snippet } from "../../design/figure/render.mjs";
import {
  type DrawnSheetBase,
  drawnSheetBase,
  type SheetBase,
} from "../src/schema/design.ts";
import type { Locale } from "../src/schema/profile.ts";
import type {
  NoticeKind,
  SheetAnswer,
  SheetAnswers,
  SheetCell,
  SheetDocument,
  SheetField,
  SheetImages,
  SheetQuestion,
} from "../src/schema/sheet.ts";
import { HANDOUT_STRINGS, type SheetStrings } from "./handout-i18n.ts";
import { recommendedMark } from "./sheet-check.ts";

// 質問票の DOM の正。見本(design/samples/sheet.<骨格>.html)も保存した質問票の書き出しも、ここが組む。
// 質問票スキルの client.js が作る DOM と同じ形にする。class や並びを変えるときは、先にここを直す

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const MARK: Record<NoticeKind, string> = {
  success: "✓",
  info: "ⓘ",
  warning: "⚠",
};

const EMPTY_ANSWER = { selected: [], text: "", fields: {}, reviewed: false };

type Answer = {
  readonly selected: readonly string[];
  readonly text: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly reviewed: boolean;
};

const toAnswer = (answer: SheetAnswer | undefined): Answer =>
  answer
    ? {
        selected: answer.selected ?? [],
        text: answer.text ?? "",
        fields: answer.fields ?? {},
        reviewed: answer.reviewed ?? true,
      }
    : EMPTY_ANSWER;

const hasContent = (answer: Answer): boolean =>
  answer.selected.length > 0 || answer.text.trim().length > 0;

// 一覧に出す状態。client.js と同じ言い回しにする
const statusOf = (t: SheetStrings, answer: Answer): string =>
  answer.reviewed && hasContent(answer)
    ? t.statusDone
    : hasContent(answer)
      ? t.statusPrefilled
      : t.statusEmpty;

export type SheetView = {
  readonly doc: SheetDocument;
  readonly answers: ReadonlyMap<string, Answer>;
  readonly current: number;
  // 設定の組織名。題名の上に HTML 資料の署名の行と同じ形で出す
  readonly orgName?: string;
  // 画面の文言の言語。資料に無ければ ja
  readonly lang: Locale;
};

export const sheetView = (
  doc: SheetDocument,
  answers: SheetAnswers | undefined,
  current = 0,
  lang: Locale = "ja",
): SheetView => ({
  doc,
  answers: new Map(
    (answers?.answers ?? []).map((answer) => [answer.id, toAnswer(answer)]),
  ),
  current,
  lang,
});

const stringsOf = (view: SheetView): SheetStrings =>
  HANDOUT_STRINGS[view.lang].sheet;

const answerOf = (view: SheetView, question: SheetQuestion): Answer =>
  view.answers.get(question.id) ?? EMPTY_ANSWER;

const doneCount = (view: SheetView): number =>
  view.doc.questions.filter((question) => {
    const answer = answerOf(view, question);
    return answer.reviewed && hasContent(answer);
  }).length;

const cell = (value: SheetCell): string =>
  typeof value === "string"
    ? escapeHtml(value)
    : `<span class="ds-cell-status ds-cell-${value.kind}">${MARK[value.kind]} ${escapeHtml(value.text)}</span>`;

const comparison = (visual: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly SheetCell[])[];
}): string =>
  `<figure class="ds-comparison"><figcaption>${escapeHtml(visual.caption)}</figcaption><div class="ds-table-scroll" role="region" aria-label="${escapeHtml(visual.caption)}" tabindex="0"><table class="ds-table"><thead><tr>${visual.columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${visual.rows.map((row) => `<tr>${row.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></figure>`;

// 案ごとのイメージ画像。src は描く前に data: へ置き換えてある。置き換わっていなければ読めなかった
const imageTile = (
  t: SheetStrings,
  item: SheetImages["items"][number],
): string =>
  `<figure class="ds-images-item"><div class="ds-figure-frame">${
    item.src.startsWith("data:image/")
      ? `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}">`
      : `<p class="ds-image-missing">${escapeHtml(t.imageMissingPrefix)}${escapeHtml(item.src)}</p>`
  }</div><figcaption>${escapeHtml(item.label)}</figcaption></figure>`;

const images = (t: SheetStrings, visual: SheetImages): string =>
  `<figure class="ds-images"><div class="ds-images-grid">${visual.items.map((item) => imageTile(t, item)).join("")}</div>${visual.caption ? `<figcaption>${escapeHtml(visual.caption)}</figcaption>` : ""}</figure>`;

// 比較表・流れの図・イメージ画像を描く。ほかの形は質問票スキルの持ち物なので飛ばす
const visualOf = (
  t: SheetStrings,
  question: SheetQuestion,
  lang: Locale,
): string => {
  const visual = question.visual;
  if (!visual) return "";
  if (visual.type === "images") return images(t, visual as SheetImages);
  if (visual.type === "comparison") {
    const { caption, columns, rows } = visual as {
      caption: string;
      columns: string[];
      rows: SheetCell[][];
    };
    return comparison({ caption, columns, rows });
  }
  if (visual.type === "flow") {
    // 図の読み上げの説明(aria-label)も質問票の言語にそろえる
    return snippet((visual as { figure: FigureInput }).figure, lang);
  }
  return "";
};

// 問いの本文(説明・図表・注意・根拠)。白いカード1枚
const questionCard = (
  view: SheetView,
  question: SheetQuestion,
  index: number,
  headingId: string,
): string => {
  const t = stringsOf(view);
  const notices = question.notices ?? [];
  const badges = notices
    .filter((notice) => notice.kind === "success")
    .map(
      (notice) =>
        `<span class="ds-badge ds-badge-success">✓ ${escapeHtml(notice.text)}</span>`,
    )
    .join("");
  const rest = notices
    .filter((notice) => notice.kind !== "success")
    .map(
      (notice) =>
        `<div class="ds-notice ds-notice-${notice.kind}"><span class="ds-notice-label">${MARK[notice.kind]} ${t.noticeWord[notice.kind]}</span><p>${escapeHtml(notice.text)}</p></div>`,
    )
    .join("");
  const visual = visualOf(t, question, view.lang);
  return [
    '<article class="ds-question-card">',
    `<p class="ds-question-count">${escapeHtml(t.questionCounter(index + 1, view.doc.questions.length))}</p>`,
    `<div class="ds-question-title-row"><h2 id="${headingId}" tabindex="-1">${escapeHtml(question.title)}</h2>${badges}</div>`,
    question.summary
      ? `<p class="ds-question-summary">${escapeHtml(question.summary)}</p>`
      : "",
    question.detail
      ? `<p class="ds-question-detail">${escapeHtml(question.detail)}</p>`
      : "",
    visual ? `<div class="ds-inline-visual">${visual}</div>` : "",
    rest,
    question.explorer
      ? `<h3 class="ds-section-heading">${escapeHtml(t.explorerHeading)}</h3><details class="ds-explorer"><summary>${escapeHtml(t.explorerOpen)}</summary></details>`
      : "",
    (question.evidence ?? [])
      .map(
        (item) =>
          `<blockquote class="ds-quote"><p>${escapeHtml(item.text)}</p><p class="ds-subtle">${escapeHtml(item.label)}</p></blockquote>`,
      )
      .join(""),
    "</article>",
  ].join("");
};

// 回答を Markdown にまとめてコピーするボタン。押したあとの結果は data-copy-status に出る。
// atEnd は画面下の帯に置くもので、最後の質問だけに出す
// 押したあとの結果は、帯の右端(コピーのボタン)の上に浮かぶ吹き出しに出し、3秒で消す。
// 帯は3つの列で組むので(design/interaction.css)、吹き出しは列を取らないよう浮かせる。
// 見出しの帯に置くと、長い文言が題名の列を押しつぶした
const COPY_STATUS =
  '<p class="ds-copy-tip" data-copy-status="" role="status" aria-live="polite"></p>';

const copyButton = (
  t: SheetStrings,
  { primary = false, atEnd = false, hidden = false } = {},
): string =>
  `<button type="button" class="ds-button${primary ? " ds-button-primary" : ""}" data-copy=""${atEnd ? ' data-at-end=""' : ""}${hidden ? ' hidden=""' : ""}>${escapeHtml(t.copyAnswers)}</button>`;

const noteLabelOf = (t: SheetStrings, question: SheetQuestion): string =>
  question.type !== "multiple"
    ? t.answerTextLabel
    : (question.noteLabel ?? t.noteOptionalLabel);

// 画面で答える回答欄。カード1枚
const answerCard = (view: SheetView, question: SheetQuestion): string => {
  const t = stringsOf(view);
  const answer = answerOf(view, question);
  const kind = question.type === "single" ? "radio" : "checkbox";
  const options = question.type === "text" ? [] : (question.options ?? []);
  const choices = options
    .map(
      (option) =>
        `<label class="ds-choice"><input type="${kind}" name="${question.id}" value="${option.id}" data-mutation=""${answer.selected.includes(option.id) ? " checked" : ""}><span>${escapeHtml(option.label)}${escapeHtml(recommendedMark(question, option, view.lang))}</span></label>`,
    )
    .join("");
  // 回答をまとめる印。どの欄がどの質問の何かを、スクリプトが属性だけで読めるようにする
  const mark = (field: { id: string; label: string }): string =>
    ` data-field="${escapeHtml(field.id)}" data-label="${escapeHtml(field.label)}"`;
  const fields = (question.fields ?? [])
    .map((field) =>
      field.multiline
        ? `<label class="ds-field">${escapeHtml(field.label)} ${requirementSpan(t, field, question)}<textarea class="ds-input" rows="4" maxlength="20000" data-mutation=""${mark(field)}>${escapeHtml(answer.fields[field.id] ?? field.initial ?? "")}</textarea></label>`
        : `<label class="ds-field">${escapeHtml(field.label)} ${requirementSpan(t, field, question)}<input type="text" class="ds-input" maxlength="20000" data-mutation=""${mark(field)} value="${escapeHtml(answer.fields[field.id] ?? field.initial ?? "")}"></label>`,
    )
    .join("");
  return [
    '<div class="ds-answer-section">',
    `<h3>${escapeHtml(t.yourAnswer)}</h3>`,
    choices
      ? `<fieldset class="ds-options"><legend class="ds-sr-only">${escapeHtml(question.type === "single" ? t.answerChoicesSr : t.answerMultipleSr)}</legend>${choices}</fieldset>`
      : "",
    fields,
    `<label class="ds-field">${escapeHtml(noteLabelOf(t, question))}<textarea class="ds-input" rows="${question.type === "multiple" ? 2 : 3}" maxlength="20000" data-mutation="" data-note="">${escapeHtml(answer.text)}</textarea></label>`,
    question.type === "single"
      ? `<p class="ds-subtle">${escapeHtml(t.singleHint)}</p>`
      : "",
    "</div>",
  ].join("");
};

// 記入欄が必須かどうかの印。問い(選択肢そのもの)には持たせず、記入欄だけに出す
const requirementSpan = (
  t: SheetStrings,
  field: SheetField,
  question: SheetQuestion,
): string => {
  if (field.required) {
    return `<span class="ds-requirement" data-required="true">${escapeHtml(t.required)}</span>`;
  }
  if ((field.requiredWhen ?? []).length > 0) {
    const options = question.options ?? [];
    const labels = (field.requiredWhen ?? []).map(
      (id) => options.find((option) => option.id === id)?.label ?? id,
    );
    return `<span class="ds-requirement" data-required="true">${t.requiredWhen(labels.map(escapeHtml))}</span>`;
  }
  return `<span class="ds-requirement" data-required="false">${escapeHtml(t.optional)}</span>`;
};

const printNoteLabel = (t: SheetStrings, question: SheetQuestion): string =>
  question.type === "single"
    ? t.answerTextAndConditionLabel
    : question.type === "multiple"
      ? (question.noteLabel ?? t.noteOptionalLabel)
      : t.answerLabel;

const printLines = (label: string, requirement = ""): string =>
  `<p class="ds-field">${escapeHtml(label)}${requirement ? ` ${requirement}` : ""}</p><div class="ds-answer-lines" aria-hidden="true"></div>`;

// 印刷向けの回答欄。選択肢に□、書き込む罫線。ボタンと入力部品は出さない
const printAnswer = (view: SheetView, question: SheetQuestion): string => {
  const t = stringsOf(view);
  const hint =
    question.type === "single"
      ? t.pickOne
      : question.type === "multiple"
        ? t.pickAll
        : "";
  const options = (question.type === "text" ? [] : (question.options ?? []))
    .map((option) => {
      const mark = recommendedMark(question, option, view.lang);
      return `<li>${escapeHtml(option.label)}${mark ? `<span class="ds-subtle">${escapeHtml(mark)}</span>` : ""}</li>`;
    })
    .join("");
  return [
    '<div class="ds-answer-section">',
    `<h3>${escapeHtml(t.yourAnswer)}${hint ? `<span class="ds-subtle">${escapeHtml(hint)}</span>` : ""}</h3>`,
    options
      ? `<ul class="ds-print-options" data-type="${question.type}">${options}</ul>`
      : "",
    (question.fields ?? [])
      .map((field) =>
        printLines(field.label, requirementSpan(t, field, question)),
      )
      .join(""),
    printLines(printNoteLabel(t, question)),
    "</div>",
  ].join("");
};

const heading = (
  view: SheetView,
  layout: SheetBase,
  sidebarOpen: boolean,
  interactive: boolean,
): string => {
  const t = stringsOf(view);
  const { doc } = view;
  // 組織名は見出しの帯の1行目に横いっぱいで置き、題名と「質問一覧を閉じる」は次の行に並ぶ
  const org = view.orgName
    ? `<div class="ds-signature"><span>${escapeHtml(view.orgName)}</span></div>`
    : "";
  const title = `${org}<div class="ds-board-title"><h1>${escapeHtml(doc.title)}</h1>${doc.description ? `<p class="ds-subtle">${escapeHtml(doc.description)}</p>` : ""}</div>`;
  if (layout === "print") {
    return `<header class="ds-board-heading">${title}<p class="ds-print-meta">${t.printMeta(escapeHtml(doc.id), escapeHtml(doc.revision), doc.questions.length)}</p></header>`;
  }
  const toggle =
    layout === "all"
      ? ""
      : `<button type="button" class="ds-button ds-sidebar-toggle" aria-controls="question-sidebar" aria-expanded="${sidebarOpen}">${escapeHtml(sidebarOpen ? t.sidebarClose : t.sidebarOpenLabel)}</button>`;
  // 回答を送る先が要るボタンは、動く画面では出さない。
  // コピーは画面下の帯に置き、その結果も帯の上に出す
  const save = interactive
    ? ""
    : `<button type="button" class="ds-button">${escapeHtml(t.saveDraft)}</button>`;
  return `<header class="ds-board-heading">${title}<div class="ds-board-actions">${save}${toggle}</div></header>`;
};

const sidebar = (
  view: SheetView,
  open: boolean,
  interactive: boolean,
): string => {
  const t = stringsOf(view);
  const { questions } = view.doc;
  const done = doneCount(view);
  return [
    `<aside id="question-sidebar" class="ds-question-sidebar"${open ? "" : ' hidden=""'}>`,
    `<h2>${escapeHtml(t.questionListHeading)}</h2>`,
    `<p class="ds-subtle" aria-live="polite"><span data-done-count="">${done}</span>${escapeHtml(t.doneOfTotalSuffix(questions.length))}</p>`,
    `<nav aria-label="${escapeHtml(t.questionListHeading)}"><ol class="ds-question-nav">`,
    questions
      .map((question, index) => {
        const answer = answerOf(view, question);
        const go = interactive ? ` data-go="${index}"` : "";
        return `<li><button type="button" class="ds-question-link"${go}${index === view.current ? ' aria-current="step"' : ""}><span class="ds-question-number">${String(index + 1).padStart(2, "0")}</span><span class="ds-question-name">${escapeHtml(question.title)}</span><span class="ds-status" data-complete="${answer.reviewed && hasContent(answer)}">${escapeHtml(statusOf(t, answer))}</span></button></li>`;
      })
      .join(""),
    "</ol></nav>",
    interactive
      ? ""
      : `<button type="button" class="ds-button">${escapeHtml(t.answerListLabel)}</button>`,
    "</aside>",
  ].join("");
};

// 画面下に固定する帯。前へ・進み具合・次へ
const pageNavigation = (
  view: SheetView,
  paged: boolean,
  interactive: boolean,
): string => {
  const t = stringsOf(view);
  const count = view.doc.questions.length;
  const done = doneCount(view);
  const progress = `<p class="ds-page-progress" aria-live="polite">${paged ? `<span data-progress="">${escapeHtml(t.questionCounter(view.current + 1, count))}</span>` : ""}<span><span data-done-count="">${done}</span>${escapeHtml(t.doneSuffix)}</span></p>`;
  if (!paged) {
    // 全問を並べる骨格。動く画面では最後にコピーを置く
    const submit = interactive
      ? copyButton(t, { primary: true })
      : `<button type="button" class="ds-button ds-button-primary">${escapeHtml(t.toAnswerList)}</button>`;
    return `<nav class="ds-page-navigation" aria-label="${escapeHtml(t.submitAriaLabel)}">${progress}${submit}${interactive ? COPY_STATUS : ""}</nav>`;
  }
  const last = view.current === count - 1;
  // 最後の質問では、次へのところに「回答をコピー」を出す。
  // 帯は1回しか組まないので、両方を入れておいてスクリプトが入れ替える
  const next = interactive
    ? [
        `<button type="button" class="ds-button ds-button-primary" data-move="next"${last ? ' hidden=""' : ""}>${escapeHtml(t.nextQuestion)}</button>`,
        copyButton(t, { primary: true, atEnd: true, hidden: !last }),
      ].join("")
    : `<button type="button" class="ds-button ds-button-primary">${escapeHtml(last ? t.toAnswerList : t.nextQuestion)}</button>`;
  return `<nav class="ds-page-navigation" aria-label="${escapeHtml(t.moveAriaLabel)}"><button type="button" class="ds-button"${interactive ? ' data-move="prev"' : ""}${view.current === 0 ? " disabled" : ""}>${escapeHtml(t.prev)}</button>${progress}${next}${interactive ? COPY_STATUS : ""}</nav>`;
};

// 下書きの保存と読み込みは回答サーバーの役目。動く画面では背景だけを残す
const tools = (view: SheetView, interactive: boolean): string => {
  const t = stringsOf(view);
  const draft = interactive
    ? ""
    : `<p class="ds-subtle" role="status" aria-live="polite">${escapeHtml(t.draftSaved)}</p><details><summary>${escapeHtml(t.loadDraft)}</summary><input type="file" accept=".json,application/json" class="ds-input" aria-label="${escapeHtml(t.loadDraftAriaLabel)}" data-mutation=""></details>`;
  const context = view.doc.context
    ? `<p class="ds-subtle">${escapeHtml(view.doc.context)}</p>`
    : "";
  return draft || context
    ? `<footer class="ds-board-tools">${draft}${context}</footer>`
    : "";
};

const errors = '<p class="ds-error" role="alert" hidden=""></p>';

// 1問ずつ出す骨格。動く画面では全部の質問を入れ、いま見ている1問だけを出す。
// 質問の section に付ける印。Markdown の見出しと突き合わせに使う
const questionMark = (question: SheetQuestion, index: number): string =>
  ` data-question="${index}" data-qid="${escapeHtml(question.id)}" data-qtype="${question.type}" data-qtitle="${escapeHtml(question.title)}"`;

// 静止した見本は今までどおり、いま見ている1問だけを組む
const oneQuestion = (
  view: SheetView,
  sidebarOpen: boolean,
  interactive: boolean,
): string => {
  const shown = interactive
    ? view.doc.questions.map((question, index) => ({ question, index }))
    : view.doc.questions
        .map((question, index) => ({ question, index }))
        .filter(({ index }) => index === view.current);
  if (shown.length === 0) return "";
  return [
    `<div class="ds-board-layout${sidebarOpen ? "" : " ds-sidebar-collapsed"}">`,
    sidebar(view, sidebarOpen, interactive),
    shown
      .map(({ question, index }) => {
        // 見本は質問票スキルと同じ id のまま。動く画面は全問を入れるので、1問ずつ分ける
        const id = interactive
          ? `question-heading-${index + 1}`
          : "question-heading";
        const hidden =
          interactive && index !== view.current ? ' hidden=""' : "";
        return `<section class="ds-question-content"${questionMark(question, index)} aria-labelledby="${id}"${hidden}>${questionCard(view, question, index, id)}${answerCard(view, question)}${errors}</section>`;
      })
      .join(""),
    "</div>",
    pageNavigation(view, true, interactive),
  ].join("");
};

const everyQuestion = (
  view: SheetView,
  answer: (view: SheetView, question: SheetQuestion) => string,
  interactive = false,
): string =>
  [
    '<div class="ds-board-layout ds-sidebar-collapsed"><div class="ds-question-list">',
    view.doc.questions
      .map(
        (question, index) =>
          `<section class="ds-question-content"${interactive ? questionMark(question, index) : ""} aria-labelledby="question-heading-${index + 1}">${questionCard(view, question, index, `question-heading-${index + 1}`)}${answer(view, question)}</section>`,
      )
      .join(""),
    "</div></div>",
  ].join("");

const bodyOf: Record<
  DrawnSheetBase,
  (view: SheetView, interactive: boolean) => string
> = {
  // 1問ずつは質問一覧を開いて始める。「質問一覧を閉じる/開く」で開閉する
  focus: (view, on) =>
    heading(view, "focus", true, on) +
    oneQuestion(view, true, on) +
    tools(view, on),
  all: (view, on) =>
    heading(view, "all", false, on) +
    everyQuestion(view, answerCard, on) +
    errors +
    pageNavigation(view, false, on) +
    tools(view, on),
  print: (view) =>
    heading(view, "print", false, false) + everyQuestion(view, printAnswer),
};

// <main class="ds-board"> の丸ごと。骨格ごとに中身が変わる。
// interactive は保存した質問票の画面。見本は静止したままにする。
// share は共有用の束。data-share="" を付け、sheet-client.ts が
// 失敗の道で「ファイルで保存」を出さない印にする
export const sheetBody = (
  view: SheetView,
  layout: SheetBase,
  interactive = false,
  share = false,
): string => {
  // Markdown の見出しに出す質問群と版。静止した見本には付けない
  const { doc } = view;
  const mark = interactive
    ? ` data-doc-id="${escapeHtml(doc.id)}" data-revision="${escapeHtml(doc.revision)}" data-title="${escapeHtml(doc.title)}"`
    : "";
  const shareMark = share ? ' data-share=""' : "";
  // overview は focus と同じに描く
  const base = drawnSheetBase(layout);
  return `<main class="ds-board" data-layout="${base}" id="app"${mark}${shareMark}>${bodyOf[base](view, interactive)}</main>`;
};
