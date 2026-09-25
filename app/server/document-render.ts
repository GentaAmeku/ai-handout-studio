import type {
  DocumentBlock,
  DocumentBlockType,
  DocumentFile,
  DocumentSection,
} from "../src/schema/document.ts";
import type { Locale } from "../src/schema/profile.ts";
import { HANDOUT_STRINGS } from "./handout-i18n.ts";
import { escapeHtml } from "./sheet-render.ts";

// HTML 資料の DOM の正。見本(design/samples/document.html)・画面のプレビュー・書き出しが、
// すべてここを通る(質問票の sheet-render.ts と同じ決まり)。
// design/document.css の class を変えるときは、先にここを直す。
// skills/ai-handout-studio/references/document.md の骨格と部品表も、同じ DOM を指す

type PropsOf<T extends DocumentBlockType> = Extract<
  DocumentBlock,
  { type: T }
>["props"];

type DocumentStrings = (typeof HANDOUT_STRINGS)[Locale]["document"];

type BlockRender<T extends DocumentBlockType> = (
  props: PropsOf<T>,
  t: DocumentStrings,
) => string;

// 同じ行の中で対になった ` で囲んだ部分を <code> にする。対にならない ` はそのまま字で出す。
// 囲みの中は字のまま逃がすだけで、ほかの飾りは入れない。`[^`\n]*` が改行をまたがないので、
// 複数行の文字列に使っても行をまたいだ対にはならない
const INLINE_CODE = /`([^`\n]*)`/g;

const inlineCode = (line: string): string => {
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of line.matchAll(INLINE_CODE)) {
    parts.push(escapeHtml(line.slice(lastIndex, match.index)));
    parts.push(
      `<code class="ds-code-inline">${escapeHtml(match[1] ?? "")}</code>`,
    );
    lastIndex = match.index + match[0].length;
  }
  parts.push(escapeHtml(line.slice(lastIndex)));
  return parts.join("");
};

// 段落。改行(\n)ごとに p を分ける
const paragraphs = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${inlineCode(line)}</p>`)
    .join("");

const cellClass = (
  index: number,
  { rowLabel, numeric }: { rowLabel?: boolean; numeric?: readonly number[] },
): string =>
  index === 0 && rowLabel
    ? ' class="ds-rowlabel"'
    : (numeric ?? []).includes(index)
      ? ' class="ds-num"'
      : "";

const tableHtml = (props: PropsOf<"table">): string =>
  [
    '<table class="ds-table">',
    "<thead><tr>",
    props.headers
      .map(
        (header, index) =>
          `<th${(props.numeric ?? []).includes(index) ? ' class="ds-num"' : ""}>${escapeHtml(header)}</th>`,
      )
      .join(""),
    "</tr></thead>",
    "<tbody>",
    props.rows
      .map(
        (row) =>
          `<tr>${row.map((cell, index) => `<td${cellClass(index, props)}>${inlineCode(cell)}</td>`).join("")}</tr>`,
      )
      .join(""),
    "</tbody>",
    "</table>",
  ].join("");

// コードブロックの「コピー」。見た目はアイコンだけで、名前は読み上げ用の文字とツールチップが持つ。
// 押せたら check のアイコンに替わる(design/document.css の [data-state="copied"])。
// アイコンの形は画面(lucide-react)の Copy と Check と同じ(lucide, ISC)
const ICON_ATTRS =
  'class="ds-code-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

const COPY_ICON = `<svg ${ICON_ATTRS} data-icon="copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const CHECK_ICON = `<svg ${ICON_ATTRS} data-icon="check"><path d="M20 6 9 17l-5-5"/></svg>`;

const copyButtonHtml = (t: DocumentStrings): string =>
  `<button type="button" class="ds-code-copy" data-code-copy title="${escapeHtml(t.copyCode)}" data-copied="${escapeHtml(t.copiedCode)}" data-failed="${escapeHtml(t.copyCodeFailed)}" hidden>${COPY_ICON}${CHECK_ICON}<span class="ds-code-copy-text" aria-live="polite">${escapeHtml(t.copyCode)}</span></button>`;

// 型から描画関数を引く表。新しい部品を足すときは、スキーマと CSS とここを同時に直す
const renderers: { [T in DocumentBlockType]: BlockRender<T> } = {
  text: (props) => paragraphs(props.text),
  bullets: (props) =>
    `<ul>${props.items.map((item) => `<li>${inlineCode(item)}</li>`).join("")}</ul>`,
  ordered: (props) =>
    `<ol class="ds-ordered">${props.items
      .map(
        (item) =>
          `<li>${inlineCode(item.text)}${item.why ? `<span class="ds-why">${inlineCode(item.why)}</span>` : ""}</li>`,
      )
      .join("")}</ol>`,
  table: tableHtml,
  cards: (props) =>
    `<div class="ds-columns${props.columns === 3 ? " ds-columns-3" : ""}">${props.items
      .map(
        (item) =>
          `<div class="ds-card"><div class="ds-card-title">${escapeHtml(item.title)}</div><p>${inlineCode(item.body)}</p></div>`,
      )
      .join("")}</div>`,
  notice: (props, t) =>
    `<div class="ds-notice ds-notice-${props.kind}"><span class="ds-notice-label">${escapeHtml(props.label ?? t.noticeLabel[props.kind])}</span><p>${inlineCode(props.text)}</p></div>`,
  note: (props, t) =>
    `<div class="ds-note"><strong>${escapeHtml(t.noteLabel)}</strong> — ${inlineCode(props.text)}</div>`,
  alert: (props, t) =>
    `<div class="ds-alert"><strong>${escapeHtml(t.alertLabel)}</strong> — ${inlineCode(props.text)}</div>`,
  open: (props) => `<div class="ds-open">${paragraphs(props.text)}</div>`,
  quote: (props) =>
    `<div class="ds-quote">${paragraphs(props.text)}${props.source ? `<p class="ds-quote-source">${escapeHtml(props.source)}</p>` : ""}</div>`,
  // コピーのボタンは hidden で描く。資料に埋めたスクリプト(document-client.ts)が動いたときだけ出る
  code: (props, t) =>
    `${props.caption ? `<p class="ds-label">${escapeHtml(props.caption)}</p>` : ""}<div class="ds-code-block"><pre class="ds-code"><code>${escapeHtml(props.text)}</code></pre>${copyButtonHtml(t)}</div>`,
  // html は図の生成器の出力。スキーマが checkDocumentBody を通しているので、そのまま置く
  figure: (props) =>
    `<figure class="ds-figure"><div class="ds-figure-frame">${props.html}</div>${props.caption ? `<figcaption>${escapeHtml(props.caption)}</figcaption>` : ""}</figure>`,
  // src は描く前に data: へ置き換えてある(withImageData)。置き換わっていなければ画像が読めなかった
  image: (props, t) =>
    `<figure class="ds-figure ds-image"><div class="ds-figure-frame">${
      props.src.startsWith("data:image/")
        ? `<img src="${escapeHtml(props.src)}" alt="${escapeHtml(props.alt)}">`
        : `<p class="ds-image-missing">${escapeHtml(t.imageMissingPrefix)}${escapeHtml(props.src)}</p>`
    }</div>${props.caption ? `<figcaption>${escapeHtml(props.caption)}</figcaption>` : ""}</figure>`,
  html: (props) => props.html,
};

const blockHtml = (block: DocumentBlock, t: DocumentStrings): string => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const render = renderers[block.type] as BlockRender<DocumentBlockType>;
  return render(block.props, t);
};

// セクションのまとまり。level 3 のセクションは、直前の level 2 のセクションの中に h3 として入る
type Group = {
  readonly lead: DocumentSection;
  readonly subs: readonly DocumentSection[];
};

const groupSections = (
  sections: readonly DocumentSection[],
): readonly Group[] =>
  sections.reduce<readonly Group[]>((groups, section) => {
    const last = groups.at(-1);
    return section.level === 3 && last
      ? [...groups.slice(0, -1), { ...last, subs: [...last.subs, section] }]
      : [...groups, { lead: section, subs: [] }];
  }, []);

const blocksHtml = (section: DocumentSection, t: DocumentStrings): string =>
  section.blocks.map((block) => blockHtml(block, t)).join("");

const sectionHtml = ({ lead, subs }: Group, t: DocumentStrings): string =>
  [
    `<section id="${escapeHtml(lead.id)}">`,
    `<${lead.level === 3 ? "h3" : "h2"}>${escapeHtml(lead.heading)}</${lead.level === 3 ? "h3" : "h2"}>`,
    blocksHtml(lead, t),
    // 節の見出しにセクションの id を付け、目次の入れ子から飛べるようにする
    subs
      .map(
        (sub) =>
          `<h3 id="${escapeHtml(sub.id)}">${escapeHtml(sub.heading)}</h3>${blocksHtml(sub, t)}`,
      )
      .join(""),
    "</section>",
  ].join("");

const tocLink = (section: DocumentSection): string =>
  `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.heading)}</a>`;

// 目次はセクションの見出しから作る。章(h2)を並べ、h3 として入る節は章の li の中に入れ子の ol で出す。
// 入れ子は共通の document.css が隠し、出すかどうかはテンプレートが決める
const tocHtml = (groups: readonly Group[], t: DocumentStrings): string =>
  [
    `<nav class="ds-toc" aria-label="${escapeHtml(t.tocLabel)}">`,
    `<div class="ds-label">${escapeHtml(t.tocLabel)}</div>`,
    "<ol>",
    groups
      .map(({ lead, subs }) =>
        [
          "<li>",
          tocLink(lead),
          subs.length > 0
            ? `<ol>${subs.map((sub) => `<li>${tocLink(sub)}</li>`).join("")}</ol>`
            : "",
          "</li>",
        ].join(""),
      )
      .join(""),
    "</ol>",
    "</nav>",
  ].join("");

const asideHtml = (aside: NonNullable<DocumentFile["aside"]>): string =>
  [
    '<aside class="ds-aside">',
    `<span class="ds-label">${escapeHtml(aside.label)}</span>`,
    '<dl class="ds-glossary">',
    aside.glossary
      .map(
        (item) =>
          `<dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.description)}</dd>`,
      )
      .join(""),
    "</dl>",
    "</aside>",
  ].join("");

const headHtml = (head: DocumentFile["head"]): string =>
  `<div class="ds-head"><h1>${escapeHtml(head.title)}</h1>${head.lede ? `<p class="ds-lede">${inlineCode(head.lede)}</p>` : ""}</div>`;

const summaryHtml = (
  summary: NonNullable<DocumentFile["summary"]>,
  t: DocumentStrings,
): string =>
  `<div class="ds-summary"><div class="ds-label">${escapeHtml(summary.label ?? t.summaryLabel)}</div><p>${inlineCode(summary.text)}</p></div>`;

// 上端の署名の行。組織名は資料に書いた値を優先し、空なら設定の組織名。どちらも無ければ出さない
const signatureHtml = (doc: DocumentFile, orgName?: string): string => {
  const org = doc.signature?.org || orgName;
  const note = doc.signature?.note;
  return org || note
    ? `<div class="ds-signature">${org ? `<span>${escapeHtml(org)}</span>` : ""}${note ? `<span>${escapeHtml(note)}</span>` : ""}</div>`
    : "";
};

// 1枚で開く前提なので、ページ番号は 1 / 1
const footHtml = (foot: NonNullable<DocumentFile["foot"]>): string =>
  `<div class="ds-foot">${foot.org ? `<span>${escapeHtml(foot.org)}</span>` : ""}${foot.showPage ? "<span>1 / 1</span>" : ""}</div>`;

// 見出しの無いセクションに html ブロックが1つだけの文書は、移行で取り込んだ本文の断片。
// 断片が自分でページの枠を持っているので、枠を重ねずそのまま出す(書き出しは移行前と同じになる)
const rawPage = (doc: DocumentFile): string | undefined => {
  const [section, ...rest] = doc.sections;
  const [block, ...others] = section?.blocks ?? [];
  return rest.length === 0 &&
    section?.heading === "" &&
    others.length === 0 &&
    block?.type === "html"
    ? block.props.html
    : undefined;
};

// 画像の src(assets/…)を、読み込んだ data: に置き換える
const withImageData = (
  doc: DocumentFile,
  images: ReadonlyMap<string, string>,
): DocumentFile => ({
  ...doc,
  sections: doc.sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) =>
      block.type === "image"
        ? {
            ...block,
            props: {
              ...block.props,
              src: images.get(block.props.src) ?? block.props.src,
            },
          }
        : block,
    ),
  })),
});

// 章ごとに読む資料の印と、スクリプトが組む前へ・次へ・切り替えの文言(資料の言語)
const pagingAttributes = (doc: DocumentFile, t: DocumentStrings): string =>
  doc.paging === "chapter"
    ? [
        ' data-paging="chapter"',
        ` data-pager-label="${escapeHtml(t.pagerLabel)}"`,
        ` data-pager-prev="${escapeHtml(t.pagerPrev)}"`,
        ` data-pager-next="${escapeHtml(t.pagerNext)}"`,
        ` data-paging-show-all="${escapeHtml(t.pagingShowAll)}"`,
        ` data-paging-show-one="${escapeHtml(t.pagingShowOne)}"`,
      ].join("")
    : "";

// <div class="ds-page"> の丸ごと。目次・本文・脇の並びは見本のまま(置き場所はテンプレートの layout.areas が決める)。
// images は画像の src から data: への対応(資料の assets/ から読んだもの)。
// lang は画面の文言(目次・要約の見出しなど)の言語。資料に無ければ ja。
// paging を false にすると、章ごとに読む資料でも全章を流す(編集中のプレビュー)
export const documentBody = (
  source: DocumentFile,
  orgName?: string,
  images: ReadonlyMap<string, string> = new Map(),
  lang: Locale = "ja",
  paging = true,
): string => {
  const t = HANDOUT_STRINGS[lang].document;
  const doc = withImageData(source, images);
  const raw = rawPage(doc);
  if (raw !== undefined) return raw;
  const groups = groupSections(doc.sections);
  return [
    `<div class="ds-page"${paging ? pagingAttributes(doc, t) : ""}>`,
    signatureHtml(doc, orgName),
    headHtml(doc.head),
    doc.summary ? summaryHtml(doc.summary, t) : "",
    '<div class="ds-cols">',
    doc.toc === "auto" ? tocHtml(groups, t) : "",
    `<main class="ds-main">${groups.map((group) => sectionHtml(group, t)).join("")}</main>`,
    doc.aside ? asideHtml(doc.aside) : "",
    "</div>",
    doc.foot ? footHtml(doc.foot) : "",
    "</div>",
  ].join("");
};
