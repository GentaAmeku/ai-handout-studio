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

const blockWarnings = (block: DocumentBlock): string[] => {
  if (block.type === "html") {
    return [`ブロック ${block.id}: html は受け皿。まず他の型を使う`];
  }
  if (block.type === "table") {
    const { headers, rows, numeric } = block.props;
    return [
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
    return [`ブロック ${block.id}: 項目が無い`];
  }
  if (block.type === "cards" && block.props.items.length === 0) {
    return [`ブロック ${block.id}: カードが無い`];
  }
  return [];
};

const documentWarnings = (doc: DocumentFile): string[] =>
  isMigrated(doc)
    ? []
    : doc.sections.flatMap((section) => [
        ...(section.heading.trim() === ""
          ? [`セクション ${section.id}: 見出しが空`]
          : []),
        ...section.blocks.flatMap(blockWarnings),
      ]);

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
