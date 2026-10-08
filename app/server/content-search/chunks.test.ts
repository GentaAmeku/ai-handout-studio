import { describe, expect, it } from "vitest";
import type { Deck } from "../../src/schema/deck.ts";
import type { DocumentFile } from "../../src/schema/document.ts";
import type { SheetDocument } from "../../src/schema/sheet.ts";
import {
  deckChunks,
  documentChunks,
  sheetChunks,
  splitLong,
} from "./chunks.ts";

// 中身を探す単位。HTML 資料は節ごと、質問票は概要と質問ごと、スライドは1枚ごと

const DATE = "2026-10-08T00:00:00.000Z";

const doc: DocumentFile = {
  id: "doc_20261008_001",
  title: "検索の設計",
  template: "cobalt",
  status: "draft",
  meta: { createdAt: DATE, updatedAt: DATE },
  head: { title: "検索の設計", lede: "中身も探せるようにする" },
  toc: "none",
  sections: [
    {
      id: "s01",
      heading: "並べ方",
      blocks: [
        { id: "b01", type: "text", props: { text: "語を全部含む資料を先に" } },
      ],
    },
    {
      id: "s02",
      heading: "速さ",
      level: 3,
      blocks: [{ id: "b02", type: "bullets", props: { items: ["30ミリ秒"] } }],
    },
  ],
};

const sheet: SheetDocument = {
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "検索の決めごと",
  description: "窓の見せ方を決める",
  questions: [
    {
      id: "layout",
      title: "どこに出しますか",
      type: "single",
      options: [
        { id: "a", label: "まとめて足す" },
        { id: "b", label: "混ぜる" },
      ],
      visual: {
        type: "comparison",
        caption: "違い",
        columns: ["案", "並び"],
        rows: [["A", { text: "点の順", kind: "info" }]],
      },
    },
    { id: "why", title: "理由", type: "text" },
  ],
};

const deck = {
  id: "deck_20261008_001",
  title: "検索の紹介",
  size: { width: 1280, height: 720 },
  status: "draft",
  meta: { createdAt: DATE, updatedAt: DATE },
  slides: [
    {
      id: "cover",
      layout: "cover",
      blocks: [
        {
          id: "h1",
          type: "heading",
          props: { text: "中身も探せる", level: 1 },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
      ],
    },
    {
      id: "body",
      layout: "content",
      notes: "話す人のメモ",
      blocks: [
        {
          id: "t1",
          type: "table",
          props: { headers: ["方式", "結果"], rows: [["段1", "12問"]] },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
        {
          id: "f1",
          type: "footer",
          props: { showPage: true },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
      ],
    },
  ],
} as unknown as Deck;

describe("documentChunks", () => {
  it("頭は概要、節は見出しを場所にして区切る", () => {
    expect(documentChunks(doc)).toEqual([
      { place: { type: "overview" }, text: "中身も探せるようにする" },
      {
        place: { type: "section", heading: "並べ方" },
        text: "並べ方\n\n語を全部含む資料を先に",
      },
      {
        place: { type: "section", heading: "速さ" },
        text: "速さ\n\n- 30ミリ秒",
      },
    ]);
  });
});

describe("sheetChunks", () => {
  it("概要と質問ごとに区切り、表の中の字と回答も入れる", () => {
    const chunks = sheetChunks(sheet, {
      schemaVersion: 1,
      documentId: "demo",
      revision: "1",
      answers: [{ id: "why", text: "あとで探したいから" }],
    });
    expect(chunks.map((chunk) => chunk.place)).toEqual([
      { type: "overview" },
      { type: "question", number: 1 },
      { type: "question", number: 2 },
    ]);
    expect(chunks[0]?.text).toBe("検索の決めごと\n\n窓の見せ方を決める");
    expect(chunks[1]?.text).toContain("まとめて足す");
    expect(chunks[1]?.text).toContain("点の順");
    expect(chunks[1]?.text).not.toContain("info");
    expect(chunks[2]?.text).toBe("理由\n\nあとで探したいから");
  });
});

describe("deckChunks", () => {
  it("1枚ごとに区切り、スライドの id とメモも持つ", () => {
    expect(deckChunks(deck)).toEqual([
      {
        place: { type: "slide", number: 1, slideId: "cover" },
        text: "中身も探せる",
      },
      {
        place: { type: "slide", number: 2, slideId: "body" },
        text: "方式 結果\n\n段1 12問\n\n話す人のメモ",
      },
    ]);
  });
});

describe("splitLong", () => {
  it("上限を超えたら段落で割り、収まる所まではつなぐ", () => {
    expect(splitLong("あいう\n\nかき\n\nさしすせ", 8)).toEqual([
      "あいう\n\nかき",
      "さしすせ",
    ]);
  });

  it("上限以内ならそのまま", () => {
    expect(splitLong("あいう\n\nかき", 100)).toEqual(["あいう\n\nかき"]);
  });
});
