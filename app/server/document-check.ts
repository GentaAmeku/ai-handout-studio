import { checkPatchTarget } from "../src/editor/document-patch.ts";
import {
  checkDocument,
  type DocumentBlock,
  type DocumentFile,
} from "../src/schema/document.ts";
import {
  checkDocumentPatch,
  type DocumentPatch,
} from "../src/schema/document-patch.ts";

// document.json の検査。形の合否は checkDocument(Zod)が決め、中身の判断は警告にとどめる

export type DocumentFileCheck =
  | { ok: true; document: DocumentFile; warnings: string[] }
  | { ok: false; errors: string };

// 見出しの無いセクションに html ブロック1つだけの文書は、移行で取り込んだ本文の断片
const isMigrated = (doc: DocumentFile): boolean =>
  doc.sections.length === 1 &&
  doc.sections[0]?.heading === "" &&
  doc.sections[0].blocks.length === 1;

// 文中のコード(` `で囲む)を描く欄の文字列。見出し・題名・カードの題・引用の出典などは含めない
const inlineCodeTexts = (block: DocumentBlock): string[] => {
  if (block.type === "text") return [block.props.text];
  if (block.type === "bullets") return block.props.items;
  if (block.type === "ordered")
    return block.props.items.flatMap((item) =>
      item.why ? [item.text, item.why] : [item.text],
    );
  if (block.type === "table") return block.props.rows.flat();
  if (block.type === "cards") return block.props.items.map((item) => item.body);
  if (
    block.type === "notice" ||
    block.type === "note" ||
    block.type === "alert" ||
    block.type === "open" ||
    block.type === "quote"
  )
    return [block.props.text];
  return [];
};

// 同じ行の中で ` の数が奇数なら、対にならない ` がある
const hasUnpairedBacktick = (text: string): boolean =>
  text.split("\n").some((line) => (line.match(/`/g) ?? []).length % 2 !== 0);

const codeWarnings = (block: DocumentBlock): string[] =>
  inlineCodeTexts(block).some(hasUnpairedBacktick)
    ? [`ブロック ${block.id}: 文中の \` が対になっていない`]
    : [];

const blockWarnings = (block: DocumentBlock): string[] => {
  const warnings = codeWarnings(block);
  if (block.type === "html") {
    return [
      ...warnings,
      `ブロック ${block.id}: html は受け皿。まず他の型を使う`,
    ];
  }
  if (block.type === "table") {
    const { headers, rows, numeric } = block.props;
    return [
      ...warnings,
      ...rows.flatMap((row, index) =>
        row.length === headers.length
          ? []
          : [
              `ブロック ${block.id}: ${index + 1} 行目の列数(${row.length})が見出しの列数(${headers.length})と違う`,
            ],
      ),
      ...(numeric ?? [])
        .filter((column) => column >= headers.length)
        .map(
          (column) =>
            `ブロック ${block.id}: numeric の列番号 ${column} が列の数を超えている`,
        ),
    ];
  }
  if (block.type === "bullets" && block.props.items.length === 0) {
    return [...warnings, `ブロック ${block.id}: 項目が無い`];
  }
  if (block.type === "cards" && block.props.items.length === 0) {
    return [...warnings, `ブロック ${block.id}: カードが無い`];
  }
  return warnings;
};

// 要約とリードも文中のコードを描くので、対になっていない ` があれば警告する
const headWarnings = (doc: DocumentFile): string[] => [
  ...(doc.summary && hasUnpairedBacktick(doc.summary.text)
    ? ["要約: 文中の ` が対になっていない"]
    : []),
  ...(doc.head.lede && hasUnpairedBacktick(doc.head.lede)
    ? ["リード: 文中の ` が対になっていない"]
    : []),
];

const documentWarnings = (doc: DocumentFile): string[] =>
  isMigrated(doc)
    ? []
    : [
        ...headWarnings(doc),
        ...doc.sections.flatMap((section) => [
          ...(section.heading.trim() === ""
            ? [`セクション ${section.id}: 見出しが空`]
            : []),
          ...section.blocks.flatMap(blockWarnings),
        ]),
      ];

export const checkDocumentFile = (input: unknown): DocumentFileCheck => {
  const checked = checkDocument(input);
  return checked.success
    ? {
        ok: true,
        document: checked.document,
        warnings: documentWarnings(checked.document),
      }
    : { ok: false, errors: checked.message };
};

// deck.json は slides、document.json は sections と toc を持つ
export const isDocumentInput = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "sections" in value &&
  !("slides" in value);

// 編集案(patch.json)は sectionId を持つ。同じフォルダの target.json と突き合わせてセクションと id を確かめる
export const isDocumentPatchInput = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "sectionId" in value;

export type DocumentPatchFileCheck =
  | { ok: true; patch: DocumentPatch; warnings: string[] }
  | { ok: false; errors: string };

export const checkDocumentPatchFile = (
  input: unknown,
  target: unknown,
): DocumentPatchFileCheck => {
  const parsed = checkDocumentPatch(input);
  if (!parsed.success) return { ok: false, errors: parsed.message };
  const doc = checkDocument(target);
  if (!doc.success) {
    return {
      ok: true,
      patch: parsed.patch,
      warnings: [
        "target.json を読めないので、セクションと id は確かめていない",
      ],
    };
  }
  const problem = checkPatchTarget(doc.document, parsed.patch);
  return problem
    ? { ok: false, errors: problem }
    : { ok: true, patch: parsed.patch, warnings: [] };
};
