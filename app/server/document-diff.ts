import type { SectionChange, VersionChanges } from "../src/api/types.ts";
import type { DocumentFile, DocumentSection } from "../src/schema/document.ts";

// HTML 資料の2つの版を、セクションの単位で見比べる。セクションは id で突き合わせ、
// 見出し・段・ブロックのどこか1か所でも違えば「変更」にする(どのセクションが変わったかが分かれば足りる)

export type DiffMark = Exclude<SectionChange, "same">;

type SectionEntry = VersionChanges["sections"][number];

// 表紙まわり。作成・更新の日時(meta)と状態は保存のたびに変わるので見ない
const frontOf = (doc: DocumentFile): string =>
  JSON.stringify([
    doc.title,
    doc.template,
    doc.lang,
    doc.signature,
    doc.head,
    doc.summary,
    doc.toc,
    doc.paging,
    doc.aside,
    doc.foot,
  ]);

const keptOrder = (
  sections: readonly DocumentSection[],
  other: ReadonlySet<string>,
): string =>
  sections
    .filter((section) => other.has(section.id))
    .map((section) => section.id)
    .join("\n");

const entry = (
  section: DocumentSection,
  change: SectionChange,
): SectionEntry => ({
  id: section.id,
  heading: section.heading,
  level: section.level === 3 ? 3 : 2,
  change,
});

// 読み込んだ文書はスキーマの順にキーが並ぶので、JSON の文字列で比べられる
export const diffDocuments = (
  before: DocumentFile,
  after: DocumentFile,
): VersionChanges => {
  const beforeById = new Map(
    before.sections.map((section) => [section.id, section]),
  );
  const afterIds = new Set(after.sections.map((section) => section.id));
  const changeOf = (section: DocumentSection): SectionChange => {
    const old = beforeById.get(section.id);
    if (!old) return "added";
    return JSON.stringify(old) === JSON.stringify(section) ? "same" : "changed";
  };
  // 消えたセクションは、元の並びで直前にあった(残った)セクションのすぐ後ろに置く。先頭なら anchor は ""
  const removed = before.sections.reduce<{
    anchor: string;
    items: { anchor: string; section: DocumentSection }[];
  }>(
    (acc, section) =>
      afterIds.has(section.id)
        ? { ...acc, anchor: section.id }
        : { ...acc, items: [...acc.items, { anchor: acc.anchor, section }] },
    { anchor: "", items: [] },
  ).items;
  const removedAfter = (anchor: string): SectionEntry[] =>
    removed
      .filter((item) => item.anchor === anchor)
      .map((item) => entry(item.section, "removed"));
  return {
    front: frontOf(before) !== frontOf(after),
    reordered:
      keptOrder(before.sections, afterIds) !==
      keptOrder(after.sections, new Set(beforeById.keys())),
    sections: [
      ...removedAfter(""),
      ...after.sections.flatMap((section) => [
        entry(section, changeOf(section)),
        ...removedAfter(section.id),
      ]),
    ],
  };
};

// 見比べのプレビューで印を付けるセクション。変更前の姿には消えたものと変わったもの、
// 変更後の姿には足したものと変わったものが載っている
const SHOWN: Record<"before" | "after", readonly DiffMark[]> = {
  before: ["removed", "changed"],
  after: ["added", "changed"],
};

export const diffMarks = (
  changes: VersionChanges,
  view: "before" | "after",
): ReadonlyMap<string, DiffMark> =>
  new Map(
    changes.sections.flatMap(({ id, change }) => {
      const mark = SHOWN[view].find((shown) => shown === change);
      return mark ? [[id, mark] as const] : [];
    }),
  );

// 印の見え方。編集画面の見比べにだけ足し、書き出しには入れない。
// 色はテンプレートの状態色の変数だけを使う(どのテンプレートの CSS にもある)
export const DIFF_MARK_CSS = [
  "[data-diff] { outline: 2px solid var(--diff-color); outline-offset: var(--space-sm); border-radius: var(--radius-sm); scroll-margin-top: var(--space-gap); }",
  '[data-diff="added"] { --diff-color: var(--color-success); }',
  '[data-diff="changed"] { --diff-color: var(--color-warning); }',
  '[data-diff="removed"] { --diff-color: var(--color-danger); }',
  "[data-diff]::before { content: attr(data-diff-label); display: inline-block; margin: 0 var(--space-xs) var(--space-xs) 0; padding: 0 var(--space-xs); border-radius: var(--radius-sm); background: var(--diff-color); color: var(--color-on-primary); font-size: var(--fs-small); font-weight: normal; line-height: 1.6; vertical-align: middle; }",
  "section[data-diff]::before { display: block; width: fit-content; }",
].join("\n");
