import type { DocumentBlockType } from "../schema/document";
import type { NewDocumentBlock } from "./document-operations";

// パーツパネルに並べる部品。skills/ai-handout-studio/references/document.md の部品表と同じ順。
// figure(図の生成器の出力)と html(移行の受け皿)は中身を画面で作れないので、
// ここには出さない(すでにある分は属性の欄で直せる)

export type DocumentPart = {
  type: DocumentBlockType;
  create: () => NewDocumentBlock;
};

export const documentParts: readonly DocumentPart[] = [
  { type: "text", create: () => ({ type: "text", props: { text: "本文" } }) },
  {
    type: "bullets",
    create: () => ({
      type: "bullets",
      props: { items: ["項目1", "項目2", "項目3"] },
    }),
  },
  {
    type: "ordered",
    create: () => ({
      type: "ordered",
      props: { items: [{ text: "手順1" }, { text: "手順2" }] },
    }),
  },
  {
    type: "table",
    create: () => ({
      type: "table",
      props: {
        headers: ["項目", "内容"],
        rows: [
          ["", ""],
          ["", ""],
        ],
      },
    }),
  },
  {
    type: "cards",
    create: () => ({
      type: "cards",
      props: {
        columns: 2,
        items: [1, 2].map((number) => ({
          title: `タイトル${number}`,
          body: "本文",
        })),
      },
    }),
  },
  {
    type: "notice",
    create: () => ({
      type: "notice",
      props: { kind: "warning", text: "読み落とすと困る条件" },
    }),
  },
  { type: "note", create: () => ({ type: "note", props: { text: "補足" } }) },
  {
    type: "alert",
    create: () => ({ type: "alert", props: { text: "気をつけること" } }),
  },
  {
    type: "open",
    create: () => ({ type: "open", props: { text: "決まっていないこと" } }),
  },
  {
    type: "quote",
    create: () => ({ type: "quote", props: { text: "引用" } }),
  },
  {
    type: "code",
    create: () => ({ type: "code", props: { text: "command --flag" } }),
  },
];
