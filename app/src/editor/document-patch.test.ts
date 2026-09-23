import { describe, expect, it } from "vitest";
import type { DocumentFile } from "../schema/document";
import { checkDocumentPatch } from "../schema/document-patch";
import { applyDocumentPatch } from "./document-patch";

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
      heading: "現状",
      blocks: [
        { id: "b01", type: "text", props: { text: "本文" } },
        { id: "b02", type: "note", props: { text: "補足" } },
      ],
    },
    {
      id: "s02",
      heading: "対策",
      blocks: [{ id: "b03", type: "text", props: { text: "別のセクション" } }],
    },
  ],
});

const parse = (input: unknown) => {
  const result = checkDocumentPatch(input);
  if (!result.success) throw new Error(result.message);
  return result.patch;
};

describe("checkDocumentPatch", () => {
  it("新しいブロックは id を書かなくてよい", () => {
    expect(
      checkDocumentPatch({
        sectionId: "s01",
        blocks: [{ type: "bullets", props: { items: ["a", "b"] } }],
      }).success,
    ).toBe(true);
  });

  it("セクションの見出しや余分なキーは受け付けない", () => {
    expect(
      checkDocumentPatch({ sectionId: "s01", heading: "変える", blocks: [] })
        .success,
    ).toBe(false);
    expect(
      checkDocumentPatch({
        sectionId: "s01",
        blocks: [{ type: "text", props: { text: "a", color: "red" } }],
      }).success,
    ).toBe(false);
    expect(
      checkDocumentPatch({
        sectionId: "s01",
        blocks: [{ type: "unknown", props: {} }],
      }).success,
    ).toBe(false);
  });
});

describe("applyDocumentPatch", () => {
  it("対象のセクションの blocks だけを置き換え、残すブロックの id を保つ", () => {
    const result = applyDocumentPatch(
      doc(),
      parse({
        sectionId: "s01",
        blocks: [
          { id: "b02", type: "note", props: { text: "補足(直した)" } },
          { type: "bullets", props: { items: ["新しい項目"] } },
        ],
      }),
    );
    if (!result.success) throw new Error(result.message);
    const [first, second] = result.document.sections;
    expect(first?.heading).toBe("現状");
    expect(first?.blocks.map((block) => block.id)).toEqual(["b02", "b04"]);
    expect(second).toEqual(doc().sections[1]);
    expect(result.document.head).toEqual(doc().head);
  });

  it("無いセクションと、セクションに無い id は取り込まない", () => {
    const missing = applyDocumentPatch(
      doc(),
      parse({ sectionId: "s09", blocks: [] }),
    );
    expect(missing.success).toBe(false);
    // b03 は別のセクションのブロック
    const foreign = applyDocumentPatch(
      doc(),
      parse({
        sectionId: "s01",
        blocks: [{ id: "b03", type: "text", props: { text: "x" } }],
      }),
    );
    expect(foreign.success).toBe(false);
  });
});
