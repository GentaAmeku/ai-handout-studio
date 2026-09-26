import type { Slide } from "../../schema/deck";
import type { Locale } from "../../schema/profile";

// 部品一覧。見出し・本文・箇条書き・表・カード・手順を、今のブロックで2枚に並べる。
// 編集画面の「部品」として、テンプレートの見本(sample.json)の後ろに足す。役割が違うので見本とは混ぜない。
// 注意と図はスライドのブロックが無いので、文書と質問票の見本で確かめる。
// 文は画面の言語で選ぶ。形(座標)は言語によらず同じ

const TEXT = {
  ja: {
    kicker: "見出し",
    heading: "部品の見え方を一度に確かめる",
    body: "本文です。色・書体・余白を変えると、この一覧と見本がすぐに変わります。",
    bullets: ["箇条書きの1行目", "箇条書きの2行目", "箇条書きの3行目"],
    headers: ["項目", "内容", "担当"],
    rows: [
      ["調査", "現状を聞き取る", "自分"],
      ["設計", "方式を決める", "自分"],
      ["実装", "画面を作る", "自分"],
      ["確認", "見本で確かめる", "自分"],
    ],
    cards: [
      { title: "カード", body: "枠・地・角丸は部品の変種で決まる" },
      { title: "もう1枚", body: "同じ変種がスライドと文書に効く" },
      { title: "3枚目", body: "見出しと本文の組み合わせ" },
    ],
    steps: [
      { title: "選ぶ", body: "変種を選ぶ" },
      { title: "整える", body: "色と数値を直す" },
      { title: "保存する", body: "CSS を作り直す" },
      { title: "確かめる", body: "検査の結果を見る" },
    ],
  },
  en: {
    kicker: "Heading",
    heading: "See how every part looks at once",
    body: "Body text. Change colors, type or spacing to see it update.",
    bullets: ["First bullet", "Second bullet", "Third bullet"],
    headers: ["Item", "Work", "Owner"],
    rows: [
      ["Research", "Interview", "Me"],
      ["Design", "Pick a method", "Me"],
      ["Build", "Make screens", "Me"],
      ["Review", "Check samples", "Me"],
    ],
    cards: [
      { title: "Card", body: "Border, fill and corners come from the variant" },
      { title: "Another", body: "One variant works for slides and documents" },
      { title: "Third", body: "A heading paired with body text" },
    ],
    steps: [
      { title: "Pick", body: "Choose a variant" },
      { title: "Adjust", body: "Fix colors and values" },
      { title: "Save", body: "Rebuild the CSS" },
      { title: "Check", body: "See the check results" },
    ],
  },
} as const satisfies Record<Locale, unknown>;

const CARD_ICONS = ["sparkles", "lightbulb", "circle-check"] as const;

export const partSlides = (lang: Locale = "ja"): Slide[] => {
  const text = TEXT[lang];
  return [
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
          props: { kicker: text.kicker, text: text.heading, level: 1 },
        },
        {
          id: "p-text",
          type: "text",
          x: 64,
          y: 176,
          w: 520,
          h: 96,
          props: { text: text.body },
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
            items: [...text.bullets],
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
            headers: [...text.headers],
            rows: text.rows.map((row) => [...row]),
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
            items: text.cards.map((card, index) => ({
              ...card,
              icon: CARD_ICONS[index],
            })),
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
            steps: text.steps.map((step) => ({ ...step })),
          },
        },
      ],
    },
  ];
};
