// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkDocumentFile, isDocumentInput } from "./document-check";
import { documentSample } from "./document-sample";

describe("document.json の検査", () => {
  it("見本は合格し、警告は出ない", () => {
    expect(checkDocumentFile(documentSample())).toMatchObject({
      ok: true,
      warnings: [],
    });
  });

  it("形が壊れていれば不合格", () => {
    const result = checkDocumentFile({ ...documentSample(), toc: "x" });
    expect(result.ok).toBe(false);
  });

  it("中身の気になる点は警告にとどめる", () => {
    const doc = documentSample();
    const result = checkDocumentFile({
      ...doc,
      sections: [
        {
          id: "s01",
          heading: "",
          blocks: [
            {
              id: "b01",
              type: "table",
              props: { headers: ["a", "b"], rows: [["1"]], numeric: [5] },
            },
            { id: "b02", type: "html", props: { html: "<p>x</p>" } },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual(
      expect.arrayContaining([
        "セクション s01: 見出しが空",
        expect.stringContaining("列数"),
        expect.stringContaining("numeric"),
        expect.stringContaining("html は受け皿"),
      ]),
    );
  });

  it("sections を持ち slides を持たない JSON を文書として扱う", () => {
    expect(isDocumentInput(documentSample())).toBe(true);
    expect(isDocumentInput({ slides: [], sections: [] })).toBe(false);
    expect(isDocumentInput([])).toBe(false);
  });

  it("文中の ` が対になっていなければ警告する。止めはしない", () => {
    const doc = documentSample();
    const result = checkDocumentFile({
      ...doc,
      sections: [
        {
          id: "s01",
          heading: "見出し",
          blocks: [
            { id: "b01", type: "text", props: { text: "半端な ` だけ" } },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([
      "ブロック b01: 文中の ` が対になっていない",
    ]);
  });

  it("対になっていれば警告しない", () => {
    const doc = documentSample();
    const result = checkDocumentFile({
      ...doc,
      sections: [
        {
          id: "s01",
          heading: "見出し",
          blocks: [
            { id: "b01", type: "text", props: { text: "`pnpm dev` を実行" } },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it("要約とリードの ` も対になっているか確かめる", () => {
    const doc = documentSample();
    const result = checkDocumentFile({
      ...doc,
      sections: [],
      head: { ...doc.head, lede: "半端な `" },
      summary: { text: "半端な `" },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual(
      expect.arrayContaining([
        "要約: 文中の ` が対になっていない",
        "リード: 文中の ` が対になっていない",
      ]),
    );
  });

  it("見出し・題名・カードの題・引用の出典の ` は確かめない", () => {
    const doc = documentSample();
    const result = checkDocumentFile({
      ...doc,
      sections: [
        {
          id: "s01",
          heading: "半端な `",
          blocks: [
            {
              id: "b01",
              type: "cards",
              props: {
                columns: 2,
                items: [{ title: "半端な `", body: "本文" }],
              },
            },
            {
              id: "b02",
              type: "quote",
              props: { text: "本文", source: "半端な `" },
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
  });
});
