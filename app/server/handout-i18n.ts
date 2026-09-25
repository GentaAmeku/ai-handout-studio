import type { Locale } from "../src/schema/profile.ts";

// 質問票・HTML 資料の画面の文言の辞書。利用者が書いた中身(題名・質問・本文)は訳さない。
// ここに無い言葉(見出し・部品の説明など)は利用者の中身なのでそのまま出す

export type SheetStrings = {
  readonly noticeWord: Readonly<Record<"success" | "info" | "warning", string>>;
  readonly statusDone: string;
  readonly statusPrefilled: string;
  readonly statusEmpty: string;
  readonly questionCounter: (index: number, total: number) => string;
  readonly explorerHeading: string;
  readonly explorerOpen: string;
  readonly copyAnswers: string;
  readonly answerTextLabel: string;
  readonly noteOptionalLabel: string;
  readonly yourAnswer: string;
  readonly answerChoicesSr: string;
  readonly answerMultipleSr: string;
  readonly singleHint: string;
  readonly required: string;
  readonly optional: string;
  // labels はすでに escapeHtml 済みの選択肢名。区切りと言い回しはここで決める
  readonly requiredWhen: (labels: readonly string[]) => string;
  readonly answerTextAndConditionLabel: string;
  readonly answerLabel: string;
  readonly pickOne: string;
  readonly pickAll: string;
  // id・revision はすでに escapeHtml 済み
  readonly printMeta: (id: string, revision: string, count: number) => string;
  readonly sidebarClose: string;
  readonly sidebarOpenLabel: string;
  readonly saveDraft: string;
  readonly questionListHeading: string;
  // 入力済みの数(<span data-done-count="">)のあとに続ける文字。総数だけを埋め込む
  readonly doneOfTotalSuffix: (total: number) => string;
  readonly answerListLabel: string;
  readonly submitAriaLabel: string;
  readonly toAnswerList: string;
  readonly moveAriaLabel: string;
  readonly prev: string;
  readonly nextQuestion: string;
  // 入力済みの数(<span data-done-count="">)のあとに続ける文字
  readonly doneSuffix: string;
  readonly draftSaved: string;
  readonly loadDraft: string;
  readonly loadDraftAriaLabel: string;
  // イメージ画像が読めなかったときの文言
  readonly imageMissingPrefix: string;
  // <title> の質問票の末尾(例: "題名 — 質問票")
  readonly titleSuffix: string;
  // 推奨の選択肢の後ろに足す印。回答をコピーすると選択肢の名前と一緒に入る
  readonly recommendedMark: string;
  // 案の画像を拡大する <dialog> の見出し(スクリーンリーダーだけに読ませる)と閉じるボタンの名前
  readonly imageZoomHeading: string;
  readonly imageZoomClose: string;
};

export type DocumentStrings = {
  readonly noticeLabel: Readonly<
    Record<"info" | "success" | "warning", string>
  >;
  readonly noteLabel: string;
  readonly alertLabel: string;
  readonly imageMissingPrefix: string;
  readonly tocLabel: string;
  readonly summaryLabel: string;
  // コードブロックの右上のボタン(document-client.ts が動かす)。ボタンはアイコンだけで、
  // これらは読み上げとツールチップに使う
  readonly copyCode: string;
  readonly copiedCode: string;
  readonly copyCodeFailed: string;
};

const ja: { sheet: SheetStrings; document: DocumentStrings } = {
  sheet: {
    noticeWord: { success: "成功", info: "情報", warning: "注意" },
    statusDone: "✓ 入力済み",
    statusPrefilled: "初期値あり",
    statusEmpty: "未入力",
    questionCounter: (index, total) => `質問 ${index} / ${total}`,
    explorerHeading: "全体図で関係を確認する",
    explorerOpen: "全体図を開く · Archify",
    copyAnswers: "回答をコピー",
    answerTextLabel: "回答文",
    noteOptionalLabel: "補足（任意）",
    yourAnswer: "あなたの回答",
    answerChoicesSr: "回答の選択肢",
    answerMultipleSr: "回答（複数選択）",
    singleHint: "選択すると回答文が入ります。文章は自由に編集できます。",
    required: "※必須",
    optional: "※任意",
    requiredWhen: (labels) => `※「${labels.join("・")}」を選んだら必須`,
    answerTextAndConditionLabel: "回答文・条件",
    answerLabel: "回答",
    pickOne: "1つ選ぶ",
    pickAll: "当てはまるものをすべて",
    printMeta: (id, revision, count) =>
      `質問群 ${id} / 版 ${revision} / ${count} 問`,
    sidebarClose: "質問一覧を閉じる",
    sidebarOpenLabel: "質問一覧を開く",
    saveDraft: "下書きを保存",
    questionListHeading: "質問一覧",
    doneOfTotalSuffix: (total) => ` / ${total} 問 入力済み`,
    answerListLabel: "回答一覧",
    submitAriaLabel: "回答の返却",
    toAnswerList: "回答一覧へ",
    moveAriaLabel: "質問の移動",
    prev: "前へ",
    nextQuestion: "次の質問へ",
    doneSuffix: " 問入力済み",
    draftSaved: "下書きは保存されています。",
    loadDraft: "保存した下書きを読み込む",
    loadDraftAriaLabel: "下書きJSONを読み込む",
    imageMissingPrefix: "画像が見つからない: ",
    titleSuffix: "質問票",
    recommendedMark: "（推奨）",
    imageZoomHeading: "画像の拡大",
    imageZoomClose: "画像を閉じる",
  },
  document: {
    noticeLabel: { info: "情報", success: "成功", warning: "注意" },
    noteLabel: "補足",
    alertLabel: "危険",
    imageMissingPrefix: "画像が見つからない: ",
    tocLabel: "目次",
    summaryLabel: "要約",
    copyCode: "コードをコピー",
    copiedCode: "コピーしました",
    copyCodeFailed: "選択しました。手でコピーしてください",
  },
};

const en: { sheet: SheetStrings; document: DocumentStrings } = {
  sheet: {
    noticeWord: { success: "Success", info: "Info", warning: "Warning" },
    statusDone: "✓ Answered",
    statusPrefilled: "Prefilled",
    statusEmpty: "Not answered",
    questionCounter: (index, total) => `Question ${index} / ${total}`,
    explorerHeading: "See how everything fits together",
    explorerOpen: "Open the map · Archify",
    copyAnswers: "Copy answers",
    answerTextLabel: "Answer text",
    noteOptionalLabel: "Notes (optional)",
    yourAnswer: "Your answer",
    answerChoicesSr: "Answer choices",
    answerMultipleSr: "Answer (multiple choice)",
    singleHint:
      "Choosing an option fills in the answer text. You can edit the wording freely.",
    required: "*Required",
    optional: "*Optional",
    requiredWhen: (labels) =>
      `*Required when you choose "${labels.join(", ")}"`,
    answerTextAndConditionLabel: "Answer text / conditions",
    answerLabel: "Answer",
    pickOne: "Choose one",
    pickAll: "Choose all that apply",
    printMeta: (id, revision, count) =>
      `Question set ${id} / rev ${revision} / ${count} questions`,
    sidebarClose: "Close question list",
    sidebarOpenLabel: "Open question list",
    saveDraft: "Save draft",
    questionListHeading: "Question list",
    doneOfTotalSuffix: (total) => ` / ${total} answered`,
    answerListLabel: "Answer list",
    submitAriaLabel: "Submit answers",
    toAnswerList: "Go to answer list",
    moveAriaLabel: "Move between questions",
    prev: "Back",
    nextQuestion: "Next question",
    doneSuffix: " answered",
    draftSaved: "Your draft is saved.",
    loadDraft: "Load a saved draft",
    loadDraftAriaLabel: "Load draft JSON",
    imageMissingPrefix: "Image not found: ",
    titleSuffix: "Questionnaire",
    recommendedMark: " (recommended)",
    imageZoomHeading: "Enlarged image",
    imageZoomClose: "Close image",
  },
  document: {
    noticeLabel: { info: "Info", success: "Success", warning: "Warning" },
    noteLabel: "Note",
    alertLabel: "Warning",
    imageMissingPrefix: "Image not found: ",
    tocLabel: "Contents",
    summaryLabel: "Summary",
    copyCode: "Copy code",
    copiedCode: "Copied",
    copyCodeFailed: "Selected. Please copy it manually",
  },
};

export const HANDOUT_STRINGS: Record<
  Locale,
  { sheet: SheetStrings; document: DocumentStrings }
> = { ja, en };
