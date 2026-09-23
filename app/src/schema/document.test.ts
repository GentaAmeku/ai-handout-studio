import { describe, expect, it } from "vitest";
import {
  checkDocument,
  checkDocumentBody,
  DOCUMENT_BODY_LIMIT,
} from "./document";

const ok = '<div class="ds-page"><h1>題</h1><p class="ds-lede">本文</p></div>';

describe("checkDocumentBody", () => {
  it(".ds-* の部品だけで組んだ断片を通す", () => {
    expect(checkDocumentBody(ok)).toEqual({ success: true });
    expect(
      checkDocumentBody('<figure class="ds-figure"><svg><g/></svg></figure>'),
    ).toEqual({ success: true });
    // 画像は本文に埋め込む
    expect(
      checkDocumentBody('<img src="data:image/png;base64,AA" alt="">'),
    ).toEqual({ success: true });
  });

  const rejected = (html: string): string => {
    const result = checkDocumentBody(html);
    return result.success ? "" : result.message;
  };

  it("ページの枠・スクリプト・入力部品は拒む", () => {
    expect(rejected("")).toContain("空");
    expect(rejected("<html><body>x</body></html>")).toContain("<html>");
    expect(rejected("<style>p{color:red}</style>")).toContain("<style>");
    expect(rejected('<script src="x.js"></script>')).toContain("<script>");
    expect(rejected('<button type="button">送信</button>')).toContain(
      "<button>",
    );
  });

  it("外への参照と、部品の外の class を拒む", () => {
    expect(rejected('<p onclick="x()">a</p>')).toContain("on…");
    expect(rejected('<a href="javascript:x()">a</a>')).toContain("javascript:");
    expect(rejected('<img src="https://example.com/a.png" alt="">')).toContain(
      "data:",
    );
    expect(rejected('<p class="lede">a</p>')).toContain("lede");
    expect(rejected('<p class="ds-lede fancy">a</p>')).toContain("fancy");
  });

  it("大きすぎる本文は拒む", () => {
    expect(rejected(`${ok}${"あ".repeat(DOCUMENT_BODY_LIMIT)}`)).toContain(
      "大きすぎる",
    );
  });
});

const AT = "2026-09-20T00:00:00.000Z";

const documentOf = (sections: unknown) => ({
  id: "doc_20260920_001",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "題" },
  toc: "auto",
  sections,
});

const rejectedDocument = (input: unknown): string => {
  const result = checkDocument(input);
  return result.success ? "" : result.message;
};

describe("checkDocument", () => {
  it("セクションとブロックの並びを読む", () => {
    const result = checkDocument(
      documentOf([
        {
          id: "s01",
          heading: "決まったこと",
          level: 2,
          blocks: [
            { id: "b01", type: "text", props: { text: "本文" } },
            {
              id: "b02",
              type: "notice",
              props: { kind: "warning", text: "条件" },
            },
          ],
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("知らないキーと知らないブロックは拒む", () => {
    expect(rejectedDocument({ ...documentOf([]), width: 800 })).toContain(
      "width",
    );
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "text",
                props: { text: "本文", color: "#fff" },
              },
            ],
          },
        ]),
      ),
    ).toContain("color");
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [{ id: "b01", type: "chart", props: {} }],
          },
        ]),
      ),
    ).not.toBe("");
  });

  it("図と html の中身は本文と同じ検査を通す", () => {
    expect(
      checkDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "figure",
                props: { html: '<svg class="ds-node"></svg>' },
              },
            ],
          },
        ]),
      ).success,
    ).toBe(true);
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "html",
                props: { html: '<p class="lede">a</p>' },
              },
            ],
          },
        ]),
      ),
    ).toContain("lede");
  });

  it("id の重複は拒む", () => {
    expect(
      rejectedDocument(
        documentOf([
          { id: "s01", heading: "セクション", blocks: [] },
          { id: "s01", heading: "別のセクション", blocks: [] },
        ]),
      ),
    ).toContain("重複");
  });
});
