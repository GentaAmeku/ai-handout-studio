import {
  checkDocument,
  type DocumentBlock,
  type DocumentFile,
} from "../schema/document";
import type { DocumentPatch } from "../schema/document-patch";
import { idSequence } from "./document-operations";

// 編集案の取り込み。対象のセクションの blocks だけを置き換える。セクションの見出しと他のセクション、骨格は触らない

export type DocumentPatchResult =
  | { success: true; document: DocumentFile; sectionId: string }
  | { success: false; message: string };

// 対象のセクションと id を対象の文書と突き合わせる。取り込みとサーバーの検証が共有する
export const checkPatchTarget = (
  doc: DocumentFile,
  patch: DocumentPatch,
): string | undefined => {
  const section = doc.sections.find((item) => item.id === patch.sectionId);
  if (!section) return `対象に無いセクション: ${patch.sectionId}`;
  const existing = section.blocks.map((block) => block.id);
  const unknown = patch.blocks.flatMap((block) =>
    block.id !== undefined && !existing.includes(block.id) ? [block.id] : [],
  );
  return unknown.length > 0
    ? `セクション ${patch.sectionId} に無い id が入っている: ${unknown.join(", ")}。新しいブロックは id を書かない`
    : undefined;
};

export const applyDocumentPatch = (
  doc: DocumentFile,
  patch: DocumentPatch,
): DocumentPatchResult => {
  const problem = checkPatchTarget(doc, patch);
  if (problem) return { success: false, message: problem };

  const nextId = idSequence(doc, "b");
  const blocks = patch.blocks.reduce<{
    items: DocumentBlock[];
    offset: number;
  }>(
    (current, block) =>
      block.id === undefined
        ? {
            items: [
              ...current.items,
              { ...block, id: nextId(current.offset) } as DocumentBlock,
            ],
            offset: current.offset + 1,
          }
        : {
            items: [
              ...current.items,
              { ...block, id: block.id } as DocumentBlock,
            ],
            offset: current.offset,
          },
    { items: [], offset: 0 },
  );

  const applied: DocumentFile = {
    ...doc,
    sections: doc.sections.map((section) =>
      section.id === patch.sectionId
        ? { ...section, blocks: blocks.items }
        : section,
    ),
  };
  // 取り込んだら、文書全体をもう一度検証する
  const checked = checkDocument(applied);
  return checked.success
    ? { success: true, document: checked.document, sectionId: patch.sectionId }
    : { success: false, message: checked.message };
};
