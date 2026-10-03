// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DocumentFile } from "../src/schema/document";
import { documentText } from "./document-text";

const AT = "2026-10-04T00:00:00.000Z";

const base: DocumentFile = {
  id: "doc_test",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "設計書の題", lede: "1行の要旨" },
  summary: { text: "結論はこれ" },
  toc: "auto",
  sections: [
    {
      id: "s01",
      heading: "決まったこと",
      blocks: [
        { id: "b01", type: "text", props: { text: "段落" } },
        { id: "b02", type: "bullets", props: { items: ["一", "二"] } },
        {
          id: "b03",
          type: "ordered",
          props: { items: [{ text: "手順", why: "先に要る" }] },
        },
        {
          id: "b04",
          type: "table",
          props: { headers: ["名前", "値"], rows: [["a|b", "1"]] },
        },
        {
          id: "b05",
          type: "notice",
          props: { kind: "warning", text: "読み落とすと困る" },
        },
        { id: "b06", type: "open", props: { text: "まだ決めていない" } },
      ],
    },
    {
      id: "s02",
      heading: "節",
      level: 3,
      blocks: [
        {
          id: "b07",
          type: "code",
          props: { text: "pnpm test", caption: "試験", verify: { run: "x" } },
        },
        {
          id: "b08",
          type: "figure",
          props: {
            html: '<svg><text class="ds-node">受付</text><text>配送 &amp; 返品</text></svg>',
            caption: "流れ",
          },
        },
        {
          id: "b09",
          type: "image",
          props: {
            src: "assets/img-1.png",
            alt: "設定の画面",
            caption: "変更前",
          },
        },
        { id: "b10", type: "quote", props: { text: "引用", source: "出典" } },
      ],
    },
  ],
  aside: { label: "用語", glossary: [{ term: "CTI", description: "反例" }] },
};

describe("documentText", () => {
  it("読む順に、見出し・本文・脇の用語を Markdown に近い文字で並べる", () => {
    expect(documentText(base)).toBe(
      `${[
        "# 設計書の題",
        "1行の要旨",
        "要約: 結論はこれ",
        "## 決まったこと",
        "段落",
        "- 一\n- 二",
        "1. 手順(理由: 先に要る)",
        "| 名前 | 値 |\n| --- | --- |\n| a\\|b | 1 |",
        "[注意] 読み落とすと困る",
        "[未決] まだ決めていない",
        "### 節",
        "試験\n```\npnpm test\n```",
        "[図: 流れ]\n(受付 配送 & 返品)",
        "[画像: 変更前]\n(設定の画面)",
        "> 引用\n> — 出典",
        "## 用語",
        "- CTI: 反例",
      ].join("\n\n")}\n`,
    );
  });

  it("英語の資料は英語の印で書く。コードの中の ``` より長い囲みにする", () => {
    const text = documentText({
      ...base,
      lang: "en",
      summary: undefined,
      aside: undefined,
      sections: [
        {
          id: "s01",
          heading: "Plan",
          blocks: [
            { id: "b01", type: "note", props: { text: "aside" } },
            { id: "b02", type: "code", props: { text: "```md\nx\n```" } },
          ],
        },
      ],
    });
    expect(text).toContain("[Note] aside");
    expect(text).toContain("````\n```md\nx\n```\n````");
  });
});
