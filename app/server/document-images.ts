import type { DocumentBlock, DocumentFile } from "../src/schema/document.ts";

// HTML 資料の image ブロックの src を集める・書き換える。取り込みと埋め込みは handout-assets.ts

export const documentImageSrcs = (doc: DocumentFile): string[] =>
  doc.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.type === "image" ? [block.props.src] : [],
    ),
  );

const withSrc = (
  block: DocumentBlock,
  mapping: ReadonlyMap<string, string>,
): DocumentBlock =>
  block.type === "image" && mapping.has(block.props.src)
    ? {
        ...block,
        props: { ...block.props, src: mapping.get(block.props.src) ?? "" },
      }
    : block;

export const withImageSrcs = (
  doc: DocumentFile,
  mapping: ReadonlyMap<string, string>,
): DocumentFile =>
  mapping.size === 0
    ? doc
    : {
        ...doc,
        sections: doc.sections.map((section) => ({
          ...section,
          blocks: section.blocks.map((block) => withSrc(block, mapping)),
        })),
      };
