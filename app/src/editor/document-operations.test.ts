import { describe, expect, it } from "vitest";
import type { DocumentFile } from "../schema/document";
import { checkDocument } from "../schema/document";
import {
  addSection,
  deleteBlock,
  deleteSection,
  insertBlock,
  reorderBlocks,
  reorderSections,
  replaceBlock,
  updateSection,
} from "./document-operations";

const doc = (): DocumentFile => ({
  id: "doc_20260920_001",
  title: "見本",
  status: "draft",
  meta: {
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  head: { title: "見本" },
  toc: "auto",
  sections: [
    {
      id: "s01",
      heading: "いま何が起きているか",
      blocks: [
        { id: "b01", type: "text", props: { text: "本文" } },
        { id: "b02", type: "note", props: { text: "補足" } },
      ],
    },
    {
      id: "s02",
      heading: "どう直すか",
      blocks: [{ id: "b03", type: "text", props: { text: "本文" } }],
    },
  ],
});

const ids = (document: DocumentFile): string[] =>
  document.sections.flatMap((section) => [
    section.id,
    ...section.blocks.map((block) => block.id),
  ]);

describe("文書の編集操作", () => {
  it("セクションを足すと、使っていない番号の id が付く", () => {
    const result = addSection(doc());
    expect(result.sectionId).toBe("s03");
    expect(result.document.sections.at(-1)).toMatchObject({ id: "s03" });
    // 中に空の本文を1つ置く。セクションだけの空の箱を作らない
    expect(result.document.sections.at(-1)?.blocks).toMatchObject([
      { id: "b04", type: "text" },
    ]);
  });

  it("セクションを足す位置は、選んでいるセクションの後ろ", () => {
    const result = addSection(doc(), "s01");
    expect(result.document.sections.map((section) => section.id)).toEqual([
      "s01",
      "s03",
      "s02",
    ]);
  });

  it("セクションを並べ替えても、残る id は変わらない", () => {
    const moved = reorderSections(doc(), "s02", "s01");
    expect(moved.sections.map((section) => section.id)).toEqual(["s02", "s01"]);
    expect(ids(moved).sort()).toEqual(ids(doc()).sort());
  });

  it("同じ場所や知らない id へ動かすと、そのまま返す", () => {
    const document = doc();
    expect(reorderSections(document, "s01", "s01")).toBe(document);
    expect(reorderSections(document, "s01", "s99")).toBe(document);
  });

  it("セクションを消すと、同じ位置に残ったセクションを返す", () => {
    const result = deleteSection(doc(), "s01");
    expect(result.sectionId).toBe("s02");
    expect(result.document.sections).toHaveLength(1);
  });

  it("ブロックは選んでいるブロックの後ろに入り、並べ替えで id を振り直さない", () => {
    const inserted = insertBlock(
      doc(),
      "s01",
      { type: "table", props: { headers: ["項目"], rows: [[""]] } },
      "b01",
    );
    expect(inserted.blockId).toBe("b04");
    expect(
      inserted.document.sections[0]?.blocks.map((block) => block.id),
    ).toEqual(["b01", "b04", "b02"]);

    const moved = reorderBlocks(inserted.document, "s01", "b04", "b02");
    expect(moved.sections[0]?.blocks.map((block) => block.id)).toEqual([
      "b01",
      "b02",
      "b04",
    ]);
  });

  it("入れ先のブロックを指さなければ、セクションの末尾に足す", () => {
    const inserted = insertBlock(doc(), "s01", {
      type: "text",
      props: { text: "" },
    });
    expect(
      inserted.document.sections[0]?.blocks.map((block) => block.id),
    ).toEqual(["b01", "b02", "b04"]);
  });

  it("ブロックの差し替えと削除は、そのセクションの中だけを変える", () => {
    const replaced = replaceBlock(doc(), "s01", {
      id: "b01",
      type: "text",
      props: { text: "直した本文" },
    });
    expect(replaced.sections[0]?.blocks[0]).toMatchObject({
      props: { text: "直した本文" },
    });
    expect(replaced.sections[1]).toEqual(doc().sections[1]);

    const deleted = deleteBlock(replaced, "s01", "b02");
    expect(deleted.sections[0]?.blocks.map((block) => block.id)).toEqual([
      "b01",
    ]);
  });

  it("見出しと深さを直した文書は、スキーマを通る", () => {
    const edited = updateSection(doc(), "s02", (section) => ({
      ...section,
      heading: "直した見出し",
      level: 3,
    }));
    const checked = checkDocument(JSON.parse(JSON.stringify(edited)));
    expect(checked.success).toBe(true);
  });
});
