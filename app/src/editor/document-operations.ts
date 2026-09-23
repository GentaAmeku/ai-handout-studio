import type {
  DocumentBlock,
  DocumentFile,
  DocumentSection,
} from "../schema/document";

// HTML 資料の編集操作。どれも document を書き換えず、新しい document を返す。
// 座標は持たないので、あるのは並べ替えと出し入れだけ(スライドの operations.ts と同じ流儀)

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type NewDocumentBlock = DistributiveOmit<DocumentBlock, "id">;

const allIds = (doc: DocumentFile): string[] =>
  doc.sections.flatMap((section) => [
    section.id,
    ...section.blocks.map((block) => block.id),
  ]);

// 既存の id と重ならない連番(s04, b12 …)。残っている id は振り直さない
export const idSequence = (
  doc: DocumentFile,
  prefix: "s" | "b",
): ((offset: number) => string) => {
  const used = allIds(doc).flatMap((id) => {
    const match = id.match(/^([a-z]+)(\d+)$/);
    return match?.[1] === prefix ? [Number(match[2])] : [];
  });
  const start = Math.max(0, ...used) + 1;
  return (offset: number): string =>
    `${prefix}${String(start + offset).padStart(2, "0")}`;
};

const insertAt = <T>(items: readonly T[], index: number, item: T): T[] => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
];

const move = <T>(items: readonly T[], index: number, target: number): T[] =>
  insertAt(
    items.filter((_, current) => current !== index),
    target,
    items[index] as T,
  );

export const findSection = (
  doc: DocumentFile,
  sectionId: string,
): DocumentSection | undefined =>
  doc.sections.find((section) => section.id === sectionId);

export const findBlock = (
  doc: DocumentFile,
  sectionId: string,
  blockId: string,
): DocumentBlock | undefined =>
  findSection(doc, sectionId)?.blocks.find((block) => block.id === blockId);

export const updateSection = (
  doc: DocumentFile,
  sectionId: string,
  update: (section: DocumentSection) => DocumentSection,
): DocumentFile => ({
  ...doc,
  sections: doc.sections.map((section) =>
    section.id === sectionId ? update(section) : section,
  ),
});

const mapBlocks = (
  doc: DocumentFile,
  sectionId: string,
  update: (blocks: readonly DocumentBlock[]) => DocumentBlock[],
): DocumentFile =>
  updateSection(doc, sectionId, (section) => ({
    ...section,
    blocks: update(section.blocks),
  }));

const indexOfSection = (doc: DocumentFile, sectionId: string): number =>
  doc.sections.findIndex((section) => section.id === sectionId);

export const addSection = (
  doc: DocumentFile,
  afterSectionId?: string,
): { document: DocumentFile; sectionId: string } => {
  const sectionId = idSequence(doc, "s")(0);
  const section: DocumentSection = {
    id: sectionId,
    heading: "",
    blocks: [
      { id: idSequence(doc, "b")(0), type: "text", props: { text: "" } },
    ],
  };
  const index =
    afterSectionId === undefined
      ? doc.sections.length
      : indexOfSection(doc, afterSectionId) + 1;
  return {
    document: { ...doc, sections: insertAt(doc.sections, index, section) },
    sectionId,
  };
};

// 消したら同じ位置のセクションを選ぶ。最後の1つも消せる(セクションの無い資料も形としては通る)
export const deleteSection = (
  doc: DocumentFile,
  sectionId: string,
): { document: DocumentFile; sectionId?: string } => {
  const index = indexOfSection(doc, sectionId);
  if (index < 0) return { document: doc, sectionId };
  const sections = doc.sections.filter((section) => section.id !== sectionId);
  return {
    document: { ...doc, sections },
    sectionId: sections[Math.min(index, sections.length - 1)]?.id,
  };
};

// つまんだセクションを、離した先のセクションの位置へ入れる
export const reorderSections = (
  doc: DocumentFile,
  sectionId: string,
  targetSectionId: string,
): DocumentFile => {
  const index = indexOfSection(doc, sectionId);
  const target = indexOfSection(doc, targetSectionId);
  if (index < 0 || target < 0 || index === target) return doc;
  return { ...doc, sections: move(doc.sections, index, target) };
};

// 選んでいるブロックの後ろへ入れる。選んでいなければセクションの末尾
export const insertBlock = (
  doc: DocumentFile,
  sectionId: string,
  block: NewDocumentBlock,
  afterBlockId?: string,
): { document: DocumentFile; blockId: string } => {
  const blockId = idSequence(doc, "b")(0);
  const inserted = { ...block, id: blockId } as DocumentBlock;
  return {
    document: mapBlocks(doc, sectionId, (blocks) => {
      const index = blocks.findIndex((item) => item.id === afterBlockId);
      return insertAt(blocks, index < 0 ? blocks.length : index + 1, inserted);
    }),
    blockId,
  };
};

export const replaceBlock = (
  doc: DocumentFile,
  sectionId: string,
  block: DocumentBlock,
): DocumentFile =>
  mapBlocks(doc, sectionId, (blocks) =>
    blocks.map((current) => (current.id === block.id ? block : current)),
  );

export const deleteBlock = (
  doc: DocumentFile,
  sectionId: string,
  blockId: string,
): DocumentFile =>
  mapBlocks(doc, sectionId, (blocks) =>
    blocks.filter((block) => block.id !== blockId),
  );

// つまんだブロックを、同じセクションの中で離した先の位置へ入れる
export const reorderBlocks = (
  doc: DocumentFile,
  sectionId: string,
  blockId: string,
  targetBlockId: string,
): DocumentFile =>
  mapBlocks(doc, sectionId, (blocks) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const target = blocks.findIndex((block) => block.id === targetBlockId);
    if (index < 0 || target < 0 || index === target) return [...blocks];
    return move(blocks, index, target);
  });
