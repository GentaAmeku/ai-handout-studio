import type { KnownBlockType } from "../schema/block";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../schema/deck";
import { type NewBlock, snap } from "./operations";

// パーツパネルに並べる10種。後回しの type は入れない

export type Part = {
  type: KnownBlockType;
  label: string;
  note: string;
  create: () => NewBlock;
};

const centered = (w: number, h: number) => ({
  x: snap((SLIDE_WIDTH - w) / 2),
  y: snap((SLIDE_HEIGHT - h) / 2),
  w,
  h,
});

export const parts: readonly Part[] = [
  {
    type: "heading",
    label: "見出し",
    note: "1枚のメッセージ",
    create: () => ({
      type: "heading",
      ...centered(1152, 96),
      props: { kicker: "", text: "見出し", level: 1 },
    }),
  },
  {
    type: "text",
    label: "本文",
    note: "補足の文章",
    create: () => ({
      type: "text",
      ...centered(560, 96),
      props: { text: "本文" },
    }),
  },
  {
    type: "bullets",
    label: "箇条書き",
    note: "並列の要点",
    create: () => ({
      type: "bullets",
      ...centered(560, 176),
      props: { items: ["項目1", "項目2", "項目3"], marker: "disc" },
    }),
  },
  {
    type: "card-grid",
    label: "カード列",
    note: "並列の概念を2〜4個",
    create: () => ({
      type: "card-grid",
      ...centered(1152, 200),
      props: {
        columns: 3,
        items: [1, 2, 3].map((number) => ({
          title: `タイトル${number}`,
          body: "本文",
        })),
      },
    }),
  },
  {
    type: "kpi-row",
    label: "数値タイル",
    note: "指標の数値",
    create: () => ({
      type: "kpi-row",
      ...centered(1152, 176),
      props: {
        items: [1, 2, 3].map((number) => ({
          value: "[[要確認]]",
          label: `指標${number}`,
        })),
      },
    }),
  },
  {
    type: "two-col",
    label: "左右の対比",
    note: "現状と目標など",
    create: () => ({
      type: "two-col",
      ...centered(1152, 240),
      props: {
        left: { title: "左", body: "本文" },
        right: { title: "右", body: "本文" },
      },
    }),
  },
  {
    type: "process",
    label: "ステップ",
    note: "順番のある手順",
    create: () => ({
      type: "process",
      ...centered(1152, 240),
      props: {
        steps: [1, 2, 3].map((number) => ({
          title: `ステップ${number}`,
          body: "内容",
        })),
      },
    }),
  },
  {
    type: "table",
    label: "表",
    note: "行と列で比べる",
    create: () => ({
      type: "table",
      ...centered(1152, 200),
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
    type: "image",
    label: "画像",
    note: "assets/ の画像",
    create: () => ({
      type: "image",
      ...centered(560, 320),
      props: { src: "assets/image.png", fit: "contain" },
    }),
  },
  {
    type: "footer",
    label: "フッター",
    note: "ページ番号",
    create: () => ({
      type: "footer",
      x: 64,
      y: 664,
      w: 1152,
      h: 32,
      props: { showPage: true },
    }),
  },
];

export const partLabel = (type: string): string =>
  parts.find((part) => part.type === type)?.label ?? type;
