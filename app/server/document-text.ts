import type {
  DocumentBlock,
  DocumentBlockType,
  DocumentFile,
} from "../src/schema/document.ts";
import type { Locale } from "../src/schema/profile.ts";
import { type DocumentStrings, HANDOUT_STRINGS } from "./handout-i18n.ts";

// HTML 資料を、読む順の文字だけにする(ai-handout-studio document export --text)。
// 読者テスト(skills/ai-handout-studio/references/document.md)で、文脈を持たない読み手に渡すためのもの。
// 書き出しの HTML は CSS と埋め込んだ画像で重いので、本文の文字だけを Markdown に近い形で並べる。
// 図と画像は中身を見せられないので、説明(caption・alt)と図の中の文字だけを残す

// 書き出しの HTML に無い、文字だけで読むときの印
const TEXT_LABELS: Record<
  Locale,
  { open: string; figure: string; image: string; why: string }
> = {
  ja: { open: "未決", figure: "図", image: "画像", why: "理由" },
  en: { open: "Open", figure: "Figure", image: "Image", why: "Why" },
};

type Labels = DocumentStrings & (typeof TEXT_LABELS)[Locale];

type BlockText<T extends DocumentBlockType> = (
  props: Extract<DocumentBlock, { type: T }>["props"],
  labels: Labels,
) => string;

// 図の生成器の出力と html ブロックから、タグを落として文字だけを取る
const textOfHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const cell = (value: string): string => value.replace(/\|/g, "\\|");

const row = (cells: readonly string[]): string =>
  `| ${cells.map(cell).join(" | ")} |`;

const fence = (text: string): string => {
  const longest = Math.max(
    2,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const marks = "`".repeat(longest + 1);
  return `${marks}\n${text}\n${marks}`;
};

const withCaption = (caption: string | undefined, body: string): string =>
  caption ? `${caption}\n${body}` : body;

const texts: { [T in DocumentBlockType]: BlockText<T> } = {
  text: (props) => props.text,
  bullets: (props) => props.items.map((item) => `- ${item}`).join("\n"),
  ordered: (props, labels) =>
    props.items
      .map(
        (item, index) =>
          `${index + 1}. ${item.text}${item.why ? `(${labels.why}: ${item.why})` : ""}`,
      )
      .join("\n"),
  table: (props) =>
    [
      row(props.headers),
      row(props.headers.map(() => "---")),
      ...props.rows.map(row),
    ].join("\n"),
  cards: (props) =>
    props.items.map((item) => `- ${item.title}: ${item.body}`).join("\n"),
  notice: (props, labels) =>
    `[${props.label ?? labels.noticeLabel[props.kind]}] ${props.text}`,
  note: (props, labels) => `[${labels.noteLabel}] ${props.text}`,
  alert: (props, labels) => `[${labels.alertLabel}] ${props.text}`,
  open: (props, labels) => `[${labels.open}] ${props.text}`,
  quote: (props) =>
    [
      ...props.text.split("\n").map((line) => `> ${line}`),
      ...(props.source ? [`> — ${props.source}`] : []),
    ].join("\n"),
  code: (props) => withCaption(props.caption, fence(props.text)),
  figure: (props, labels) => {
    const inside = textOfHtml(props.html);
    return `[${labels.figure}${props.caption ? `: ${props.caption}` : ""}]${inside ? `\n(${inside})` : ""}`;
  },
  image: (props, labels) =>
    `[${labels.image}: ${props.caption ?? props.alt}]${props.caption && props.alt !== props.caption ? `\n(${props.alt})` : ""}`,
  html: (props) => textOfHtml(props.html),
};

const blockText = (block: DocumentBlock, labels: Labels): string => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const toText = texts[block.type] as BlockText<DocumentBlockType>;
  return toText(block.props, labels);
};

const labelsOf = (doc: DocumentFile): Labels => {
  const lang = doc.lang ?? "ja";
  return { ...HANDOUT_STRINGS[lang].document, ...TEXT_LABELS[lang] };
};

// 本文の1かたまり。heading が無いのは頭(導入と要約)
export type DocumentPart = { heading?: string; level?: 2 | 3; texts: string[] };

// 読む順のかたまり。頭(導入と要約)・節ごと・用語集。document export --text とサイト内検索の区切りが使う
export const documentParts = (doc: DocumentFile): DocumentPart[] => {
  const labels = labelsOf(doc);
  return [
    {
      texts: [
        ...(doc.head.lede ? [doc.head.lede] : []),
        ...(doc.summary
          ? [`${doc.summary.label ?? labels.summaryLabel}: ${doc.summary.text}`]
          : []),
      ],
    },
    ...doc.sections.map((section) => ({
      heading: section.heading,
      level: section.level === 3 ? (3 as const) : (2 as const),
      texts: section.blocks
        .map((block) => blockText(block, labels))
        .filter((text) => text.trim() !== ""),
    })),
    ...(doc.aside && doc.aside.glossary.length > 0
      ? [
          {
            heading: doc.aside.label,
            level: 2 as const,
            texts: [
              doc.aside.glossary
                .map((entry) => `- ${entry.term}: ${entry.description}`)
                .join("\n"),
            ],
          },
        ]
      : []),
  ];
};

export const documentText = (doc: DocumentFile): string => {
  const parts = [
    `# ${doc.head.title}`,
    ...documentParts(doc).flatMap((part) => [
      ...(part.heading === undefined
        ? []
        : [`${part.level === 3 ? "###" : "##"} ${part.heading}`]),
      ...part.texts,
    ]),
  ];
  return `${parts.join("\n\n")}\n`;
};
