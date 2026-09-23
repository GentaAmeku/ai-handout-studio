import { type FigureInput, render } from "../../design/figure/render.mjs";
import type { DocumentFile } from "../src/schema/document.ts";
import { documentBody } from "./document-render.ts";
import { sampleImages } from "./sample-images.ts";
import { SAMPLE_ORG_NAME } from "./sample-org.ts";

// 文書の見本(design/samples/document.html)の中身。
// DOM を組むのは document-render.ts。ここが持つのは、部品を1つずつ並べた document.json だけ。
// 部品を足したら、この見本にも足して形が見えるようにする

const AT = "2026-09-18T00:00:00.000Z";

const SAMPLE_IMAGE_SRC = "assets/sample-screen.jpg";

// 見本の図。分かれ目・外・保管の形と、枝分かれ・合流の線を1枚に入れる
const sampleFigure: FigureInput = {
  figure: 1,
  caption:
    "図 依頼が届いてから記録に残るまで。規模の判断で3つに分かれ、記録へ合流する。",
  flow: [
    { label: "依頼が届く", kind: "outside" },
    {
      label: "規模は",
      kind: "branch",
      fork: [
        { label: "その場で直す" },
        { label: "設計から作る" },
        { label: "断る" },
      ],
    },
    { label: "記録に残す", kind: "store" },
  ],
};

const sample: DocumentFile = {
  id: "document-sample",
  title: "文書の見本",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  signature: { org: "", note: "文書の見本 / 2026-09-18" },
  head: {
    title: "部品の見え方を確かめる",
    lede: "テーマの色・余白・部品の変種を変えると、この文書と質問票・スライドが同時に変わる。",
  },
  summary: {
    label: "要約",
    text: "表・カード・注意・図はテーマの変種で見た目が決まる。本文幅・脇・目次の位置は文書のレイアウトの型が決める。",
  },
  toc: "auto",
  sections: [
    {
      id: "table",
      heading: "表",
      level: 2,
      blocks: [
        {
          id: "table-lede",
          type: "text",
          props: {
            text: "短い対応関係に使う。罫線・縞・最小の変種と、密度のパラメータがある。",
          },
        },
        {
          id: "table-body",
          type: "table",
          props: {
            headers: ["段", "内容", "担当", "日数"],
            rows: [
              ["調査", "現状を聞き取る", "自分", "3"],
              ["設計", "方式を決める", "自分", "5"],
              ["実装", "画面を作る", "自分", "10"],
              ["確認", "見本で確かめる", "自分", "2"],
            ],
            rowLabel: true,
            numeric: [3],
          },
        },
      ],
    },
    {
      id: "cards",
      heading: "カード",
      level: 2,
      blocks: [
        {
          id: "cards-body",
          type: "cards",
          props: {
            columns: 3,
            items: [
              { title: "案A", body: "設定の修正だけで進める。変更は小さい。" },
              {
                title: "案B",
                body: "型チェック用の環境を分ける。手順が増える。",
              },
              {
                title: "案C",
                body: "実行ツールも移行する。確認の範囲が広い。",
              },
            ],
          },
        },
      ],
    },
    {
      id: "notice",
      heading: "注意",
      level: 2,
      blocks: [
        {
          id: "notice-note",
          type: "note",
          props: { text: "読み飛ばしても本筋が通るもの。" },
        },
        {
          id: "notice-info",
          type: "notice",
          props: {
            kind: "info",
            text: "帯と箱の変種がある。種類ごとの色は class で決まる。",
          },
        },
        {
          id: "notice-success",
          type: "notice",
          props: { kind: "success", text: "検査がすべて通った。" },
        },
        {
          id: "notice-warning",
          type: "notice",
          props: { kind: "warning", text: "処理時間は短くならない。" },
        },
        {
          id: "notice-alert",
          type: "alert",
          props: { text: "元に戻せない操作。言葉を必ず添える。" },
        },
      ],
    },
    {
      id: "figure",
      heading: "図",
      level: 2,
      blocks: [
        {
          id: "figure-lede",
          type: "text",
          props: {
            text: "箱の形・矢印・線種はテーマの図の変種が決める。「外」の破線の枠だけは意味の区別なので変わらない。",
          },
        },
        {
          id: "figure-body",
          type: "figure",
          props: {
            html: render(sampleFigure).svg,
            caption: sampleFigure.caption,
          },
        },
      ],
    },
    {
      id: "image",
      heading: "画像",
      level: 2,
      blocks: [
        {
          id: "image-lede",
          type: "text",
          props: {
            text: "スクリーンショットや生成した絵。ファイルは資料の assets/ に置き、描くときに埋め込む。",
          },
        },
        {
          id: "image-body",
          type: "image",
          props: {
            src: SAMPLE_IMAGE_SRC,
            alt: "スライドの資料一覧の画面",
            caption: "資料一覧。お気に入りの資料が上に分かれて並ぶ",
          },
        },
      ],
    },
    {
      id: "other",
      heading: "そのほかの部品",
      level: 2,
      blocks: [],
    },
    {
      id: "other-ordered",
      heading: "番号の付く並び",
      level: 3,
      blocks: [
        {
          id: "other-ordered-body",
          type: "ordered",
          props: {
            items: [
              {
                text: "1項目に1行の理由を添える。",
                why: "理由がない決定は、読者が後から覆せない。",
              },
              { text: "決定・仮説・未決を同じセクションに混ぜない。" },
            ],
          },
        },
      ],
    },
    {
      id: "other-quote",
      heading: "引用",
      level: 3,
      blocks: [
        {
          id: "other-quote-body",
          type: "quote",
          props: {
            text: "読みやすさは文書・文の連なり・文・語彙の四つの層で決まる。",
            source: "書き方の手引き",
          },
        },
      ],
    },
    {
      id: "other-code",
      heading: "コード",
      level: 3,
      blocks: [
        {
          id: "other-code-body",
          type: "code",
          props: { text: "pnpm design:build" },
        },
      ],
    },
    {
      id: "other-open",
      heading: "未決",
      level: 3,
      blocks: [
        {
          id: "other-open-body",
          type: "open",
          props: { text: "段 E で新しいテンプレートの見本を決める。" },
        },
      ],
    },
    {
      id: "other-bullets",
      heading: "箇条書き",
      level: 3,
      blocks: [
        {
          id: "other-bullets-body",
          type: "bullets",
          props: {
            items: [
              "並べるだけで順番に意味が無いもの。",
              "番号と理由が要るなら、番号の付く並びにする。",
            ],
          },
        },
      ],
    },
  ],
  aside: {
    label: "用語",
    glossary: [
      {
        term: "テーマ",
        description: "色・書体・余白と、部品の変種の組み合わせ。",
      },
      {
        term: "変種",
        description: "部品ごとの見た目の選択肢。CSS 変数の値で表す。",
      },
      { term: "レイアウト", description: "本文幅・脇・目次の位置。" },
    ],
  },
  foot: { showPage: true },
};

export const documentSample = (): DocumentFile => sample;

export const documentSampleBody = (): string =>
  documentBody(sample, SAMPLE_ORG_NAME, sampleImages(["sample-screen.jpg"]));
