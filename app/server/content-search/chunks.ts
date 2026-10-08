import type { ContentPlace } from "../../src/api/types.ts";
import type {
  BlockOf,
  KnownBlock,
  KnownBlockType,
} from "../../src/schema/block.ts";
import { isKnownBlock } from "../../src/schema/block.ts";
import type { Deck } from "../../src/schema/deck.ts";
import type { DocumentFile } from "../../src/schema/document.ts";
import type {
  SheetAnswers,
  SheetDocument,
  SheetQuestion,
} from "../../src/schema/sheet.ts";
import { documentParts } from "../document-text.ts";

// サイト内検索で中身を探す単位(区切り)。HTML 資料は節ごと、質問票は概要と質問ごと、スライドは1枚ごと。
// 長い区切りは段落で割る(行の2行目に出す場所は割る前と同じ)

export type ContentChunk = { place: ContentPlace; text: string };

const CHUNK_LIMIT = 1500;

// 段落(空行)で割り、上限を超えない所までつなぐ。1段落が上限を超えるときはそのまま1つにする
export const splitLong = (text: string, limit = CHUNK_LIMIT): string[] =>
  text.length <= limit
    ? [text]
    : text.split(/\n{2,}/).reduce<string[]>((pieces, paragraph) => {
        const last = pieces.at(-1);
        if (last !== undefined && last.length + paragraph.length + 2 <= limit) {
          pieces[pieces.length - 1] = `${last}\n\n${paragraph}`;
        } else {
          pieces.push(paragraph);
        }
        return pieces;
      }, []);

const chunksOf = (place: ContentPlace, text: string): ContentChunk[] =>
  text.trim() === ""
    ? []
    : splitLong(text).map((piece) => ({ place, text: piece }));

export const documentChunks = (doc: DocumentFile): ContentChunk[] =>
  documentParts(doc).flatMap((part) =>
    chunksOf(
      part.heading
        ? { type: "section", heading: part.heading }
        : { type: "overview" },
      [...(part.heading ? [part.heading] : []), ...part.texts].join("\n\n"),
    ),
  );

// 図(比べる表・画像)の中の字も探す。流れの図は生成器の入力なので見ない。
// 形はスキーマが確かめているので、字の値を拾うだけにする(種類・画像の場所・色の名前は除く)
const SKIPPED_KEYS = new Set(["type", "src", "kind"]);

const stringsIn = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) =>
      SKIPPED_KEYS.has(key) ? [] : stringsIn(inner),
    );
  }
  return [];
};

const visualTexts = (question: SheetQuestion): string[] =>
  question.visual && question.visual.type !== "flow"
    ? stringsIn(question.visual)
    : [];

const questionText = (
  question: SheetQuestion,
  answer: SheetAnswers["answers"][number] | undefined,
): string =>
  [
    question.title,
    question.summary ?? "",
    question.detail ?? "",
    ...(question.options ?? []).map((option) => option.label),
    ...(question.fields ?? []).map((field) => field.label),
    ...(question.notices ?? []).map((notice) => notice.text),
    ...(question.evidence ?? []).map((item) => `${item.label} ${item.text}`),
    ...visualTexts(question),
    // 回答(自分で書いた文)も探す(質問票 sheet_20261008_003 の回答)
    answer?.text ?? "",
    ...Object.values(answer?.fields ?? {}),
  ]
    .filter((text) => text.trim() !== "")
    .join("\n\n");

export const sheetChunks = (
  doc: SheetDocument,
  answers?: SheetAnswers,
): ContentChunk[] => [
  ...chunksOf(
    { type: "overview" },
    [doc.title, doc.description ?? "", doc.context ?? ""]
      .filter((text) => text !== "")
      .join("\n\n"),
  ),
  ...doc.questions.flatMap((question, index) =>
    chunksOf(
      { type: "question", number: index + 1 },
      questionText(
        question,
        answers?.answers.find((answer) => answer.id === question.id),
      ),
    ),
  ),
];

type BlockTexts<T extends KnownBlockType> = (
  props: BlockOf<T>["props"],
) => string[];

const BLOCK_TEXTS: { [T in KnownBlockType]: BlockTexts<T> } = {
  heading: (props) => [props.kicker ?? "", props.text],
  text: (props) => [props.text],
  bullets: (props) => props.items,
  "card-grid": (props) =>
    props.items.map((item) => `${item.title} ${item.body}`),
  "kpi-row": (props) =>
    props.items.map((item) =>
      [item.value, item.label, item.note ?? ""].join(" "),
    ),
  "two-col": (props) =>
    [props.left, props.right].map((column) =>
      `${column.title ?? ""} ${column.body}`.trim(),
    ),
  process: (props) => props.steps.map((step) => `${step.title} ${step.body}`),
  table: (props) => [props.headers, ...props.rows].map((row) => row.join(" ")),
  image: (props) => [props.caption ?? ""],
  footer: () => [],
};

const blockTexts = (block: KnownBlock): string[] => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const toTexts = BLOCK_TEXTS[block.type] as BlockTexts<KnownBlockType>;
  return toTexts(block.props);
};

export const deckChunks = (deck: Deck): ContentChunk[] =>
  deck.slides.flatMap((slide, index) =>
    chunksOf(
      { type: "slide", number: index + 1, slideId: slide.id },
      [
        ...slide.blocks.filter(isKnownBlock).flatMap(blockTexts),
        slide.notes ?? "",
      ]
        .filter((text) => text.trim() !== "")
        .join("\n\n"),
    ),
  );
