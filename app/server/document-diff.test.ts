// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DocumentFile, DocumentSection } from "../src/schema/document";
import { diffDocuments, diffMarks } from "./document-diff";

const AT = "2026-09-20T00:00:00.000Z";

const section = (id: string, text = id, level?: 3): DocumentSection => ({
  id,
  heading: `見出し${id}`,
  ...(level ? { level } : {}),
  blocks: [{ id: `b-${id}`, type: "text", props: { text } }],
});

const doc = (sections: DocumentSection[]): DocumentFile => ({
  id: "doc_test",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "題" },
  toc: "auto",
  sections,
});

const changesOf = (before: DocumentFile, after: DocumentFile) =>
  diffDocuments(before, after).sections.map(
    (entry) => `${entry.id}:${entry.change}`,
  );

describe("diffDocuments", () => {
  const base = doc([section("s1"), section("s2"), section("s3", "s3", 3)]);

  it("同じ中身なら、どのセクションも same で表紙も並びも変わらない", () => {
    expect(diffDocuments(base, base)).toEqual({
      front: false,
      reordered: false,
      sections: [
        { id: "s1", heading: "見出しs1", level: 2, change: "same" },
        { id: "s2", heading: "見出しs2", level: 2, change: "same" },
        { id: "s3", heading: "見出しs3", level: 3, change: "same" },
      ],
    });
  });

  it("ブロックの中身が1か所でも違えばそのセクションだけ changed", () => {
    const after = doc([
      section("s1"),
      section("s2", "直した"),
      base.sections[2] as DocumentSection,
    ]);
    expect(changesOf(base, after)).toEqual([
      "s1:same",
      "s2:changed",
      "s3:same",
    ]);
  });

  it("足したセクションは変更後の位置に added で入る", () => {
    const after = doc([
      section("s1"),
      section("new"),
      ...base.sections.slice(1),
    ]);
    expect(changesOf(base, after)).toEqual([
      "s1:same",
      "new:added",
      "s2:same",
      "s3:same",
    ]);
  });

  it("消えたセクションは、元の並びで直前にあったセクションのすぐ後ろに removed で入る", () => {
    expect(
      changesOf(
        base,
        doc([section("s1"), base.sections[2] as DocumentSection]),
      ),
    ).toEqual(["s1:same", "s2:removed", "s3:same"]);
    expect(changesOf(base, doc(base.sections.slice(1)))).toEqual([
      "s1:removed",
      "s2:same",
      "s3:same",
    ]);
  });

  it("並びだけを入れ替えたら reordered にし、セクションは same のまま", () => {
    const changes = diffDocuments(
      base,
      doc([section("s2"), section("s1"), base.sections[2] as DocumentSection]),
    );
    expect(changes.reordered).toBe(true);
    expect(changes.sections.every((entry) => entry.change === "same")).toBe(
      true,
    );
  });

  it("表紙まわりの変更は front で知らせ、更新日時と状態の違いは数えない", () => {
    expect(
      diffDocuments(base, { ...base, head: { title: "別の題" } }).front,
    ).toBe(true);
    expect(
      diffDocuments(base, {
        ...base,
        status: "done",
        meta: { ...base.meta, updatedAt: "2026-09-21T00:00:00.000Z" },
      }).front,
    ).toBe(false);
  });
});

describe("diffMarks", () => {
  const before = doc([section("s1"), section("s2"), section("s3")]);
  const after = doc([section("s1", "直した"), section("s3"), section("s4")]);
  const changes = diffDocuments(before, after);

  it("変更前には消えたものと変わったもの、変更後には足したものと変わったものに印を付ける", () => {
    expect([...diffMarks(changes, "before")]).toEqual([
      ["s1", "changed"],
      ["s2", "removed"],
    ]);
    expect([...diffMarks(changes, "after")]).toEqual([
      ["s1", "changed"],
      ["s4", "added"],
    ]);
  });
});
