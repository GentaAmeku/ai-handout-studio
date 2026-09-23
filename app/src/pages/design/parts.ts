import type { Slide } from "../../schema/deck";

// 部品一覧。見出し・本文・箇条書き・表・カード・手順を、今のブロックで2枚に並べる。
// 編集画面の「部品」として、テンプレートの見本(sample.json)の後ろに足す。役割が違うので見本とは混ぜない。
// 注意と図はスライドのブロックが無いので、文書と質問票の見本で確かめる

export const partSlides: Slide[] = [
  {
    id: "parts-1",
    layout: "content",
    blocks: [
      {
        id: "p-heading",
        type: "heading",
        x: 64,
        y: 48,
        w: 1152,
        h: 110,
        props: {
          kicker: "見出し",
          text: "部品の見え方を一度に確かめる",
          level: 1,
        },
      },
      {
        id: "p-text",
        type: "text",
        x: 64,
        y: 176,
        w: 520,
        h: 96,
        props: {
          text: "本文です。色・書体・余白を変えると、この一覧と見本がすぐに変わります。",
        },
      },
      {
        id: "p-bullets",
        type: "bullets",
        x: 64,
        y: 296,
        w: 520,
        h: 200,
        props: {
          marker: "disc",
          items: ["箇条書きの1行目", "箇条書きの2行目", "箇条書きの3行目"],
        },
      },
      {
        id: "p-table",
        type: "table",
        x: 640,
        y: 176,
        w: 576,
        h: 320,
        props: {
          headers: ["項目", "内容", "担当"],
          rows: [
            ["調査", "現状を聞き取る", "自分"],
            ["設計", "方式を決める", "自分"],
            ["実装", "画面を作る", "自分"],
            ["確認", "見本で確かめる", "自分"],
          ],
        },
      },
    ],
  },
  {
    id: "parts-2",
    layout: "content",
    blocks: [
      {
        id: "p-cards",
        type: "card-grid",
        x: 64,
        y: 64,
        w: 1152,
        h: 260,
        props: {
          columns: 3,
          items: [
            {
              title: "カード",
              body: "枠・地・角丸は部品の変種で決まる",
              icon: "sparkles",
            },
            {
              title: "もう1枚",
              body: "同じ変種がスライドと文書に効く",
              icon: "lightbulb",
            },
            {
              title: "3枚目",
              body: "見出しと本文の組み合わせ",
              icon: "circle-check",
            },
          ],
        },
      },
      {
        id: "p-process",
        type: "process",
        x: 64,
        y: 368,
        w: 1152,
        h: 288,
        props: {
          steps: [
            { title: "選ぶ", body: "変種を選ぶ" },
            { title: "整える", body: "色と数値を直す" },
            { title: "保存する", body: "CSS を作り直す" },
            { title: "確かめる", body: "検査の結果を見る" },
          ],
        },
      },
    ],
  },
];
