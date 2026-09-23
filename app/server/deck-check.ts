import { access } from "node:fs/promises";
import { join } from "node:path";
import { isKnownBlock, type KnownBlock } from "../src/schema/block.ts";
import {
  checkAiDeck,
  checkDeck,
  type Deck,
  type Slide,
  slideSchema,
} from "../src/schema/deck.ts";
import { checkPatch, type SlidePatch } from "../src/schema/patch.ts";

// AI が作った deck の検査。pnpm deck:check(ai-handout-studio check)が使う

export type GeneratedCheck =
  | { ok: true; deck: Deck; warnings: string[] }
  | { ok: false; errors: string };

const PLACEHOLDER = "[[要確認]]";
const MAX_BULLETS = 7;

// 検査の警告
const warningsFor = (deck: Deck): string[] => {
  const placeholders = JSON.stringify(deck).split(PLACEHOLDER).length - 1;
  const longLists = deck.slides.flatMap((slide) =>
    slide.blocks.flatMap((block) =>
      isKnownBlock(block) &&
      block.type === "bullets" &&
      block.props.items.length > MAX_BULLETS
        ? [
            `${slide.id} / ${block.id}: 箇条書きが${block.props.items.length}項目ある(${MAX_BULLETS}項目以下にする)`,
          ]
        : [],
    ),
  );
  return [
    ...(placeholders > 0
      ? [`${PLACEHOLDER} が ${placeholders} か所に残っている`]
      : []),
    ...longLists,
  ];
};

// 不合格(スキーマ違反・スライド0枚・title 空)と、フォルダ名との一致
export const checkGeneratedDeck = (
  input: unknown,
  expectedDeckId?: string,
): GeneratedCheck => {
  const result = checkAiDeck(input);
  if (!result.success) return { ok: false, errors: result.message };
  const { deck } = result;
  if (expectedDeckId && deck.id !== expectedDeckId) {
    return {
      ok: false,
      errors: `id を "${expectedDeckId}" にする(いまは "${deck.id}")`,
    };
  }
  if (deck.slides.length === 0) {
    return { ok: false, errors: "スライドが0枚" };
  }
  if (deck.title.trim() === "") return { ok: false, errors: "title が空" };
  return { ok: true, deck, warnings: warningsFor(deck) };
};

// 登壇向けの検査。talk.md §尺・§検品 の値とそろえる
export const TALK_CHARS_PER_MINUTE = 300;
export const TALK_CONTENT_SLIDE_SECONDS = 30;
export const TALK_COVER_SECTION_CLOSING_SECONDS = 8;
export const TALK_TIME_BUDGET_RATIO = 0.9;
export const TALK_MAX_BODY_CHARS = 120;
export const TALK_MAX_BULLET_ITEMS = 5;
export const TALK_MAX_HEADING_CHARS = 15;
export const TALK_MONOTONE_MIN_SLIDES = 10;

// 空白・改行を除いた字数
const charCount = (text: string): number => text.replace(/\s/g, "").length;

const headingOf = (slide: Slide): string | undefined =>
  slide.blocks
    .filter(isKnownBlock)
    .find(
      (block): block is Extract<KnownBlock, { type: "heading" }> =>
        block.type === "heading",
    )?.props.text;

// 見出し・フッターを除いた、本文にあたるブロックの字
const bodyTextOf = (block: KnownBlock): string => {
  if (block.type === "text") return block.props.text;
  if (block.type === "bullets") return block.props.items.join("");
  if (block.type === "card-grid") {
    return block.props.items
      .map((item) => `${item.title ?? ""}${item.body}`)
      .join("");
  }
  if (block.type === "kpi-row") {
    return block.props.items
      .map((item) => `${item.value}${item.label}${item.note ?? ""}`)
      .join("");
  }
  if (block.type === "two-col") {
    const { left, right } = block.props;
    return `${left.title ?? ""}${left.body}${right.title ?? ""}${right.body}`;
  }
  if (block.type === "process") {
    return block.props.steps
      .map((step) => `${step.title}${step.body}`)
      .join("");
  }
  if (block.type === "table") {
    return [...block.props.headers, ...block.props.rows.flat()].join("");
  }
  if (block.type === "image") return block.props.caption ?? "";
  return "";
};

const hasBusyBody = (slide: Slide): boolean => {
  const known = slide.blocks.filter(isKnownBlock);
  const bodyChars = known
    .filter((block) => block.type !== "heading" && block.type !== "footer")
    .reduce((total, block) => total + charCount(bodyTextOf(block)), 0);
  const hasLongBullets = known.some(
    (block) =>
      block.type === "bullets" &&
      block.props.items.length >= TALK_MAX_BULLET_ITEMS,
  );
  return bodyChars > TALK_MAX_BODY_CHARS || hasLongBullets;
};

const imageCountOf = (slide: Slide): number =>
  slide.blocks.filter(isKnownBlock).filter((block) => block.type === "image")
    .length;

// 口語の砕けた語尾。末尾の句読点・「！」「？」・閉じ括弧を外してから見る。
// 「育てる」「捨てる」「立てる」のように、もともと「てる」で終わる動詞は拾わない
const TRAILING_MARKS = /[\s。、．.!！?？」』)）]+$/;
const COLLOQUIAL_ENDING = /((?<![育捨立建当慌企果隔])てる|ばいい|んです)$/;
const isColloquial = (heading: string): boolean =>
  COLLOQUIAL_ENDING.test(heading.replace(TRAILING_MARKS, ""));

const secondsFor = (slide: Slide): number => {
  const noteChars = charCount(slide.notes ?? "");
  if (noteChars > 0) return (noteChars / TALK_CHARS_PER_MINUTE) * 60;
  return slide.layout === "content"
    ? TALK_CONTENT_SLIDE_SECONDS
    : TALK_COVER_SECTION_CLOSING_SECONDS;
};

const formatMinutes = (minutes: number): string => minutes.toFixed(1);

const estimateLine = (
  deck: Deck,
  minutes: number,
  totalSeconds: number,
): string => {
  const contentSlides = deck.slides.filter(
    (slide) => slide.layout === "content",
  );
  const otherSlides = deck.slides.filter((slide) => slide.layout !== "content");
  const noteChars = deck.slides.reduce(
    (total, slide) => total + charCount(slide.notes ?? ""),
    0,
  );
  return (
    `尺: 約${formatMinutes(totalSeconds / 60)}分 / 持ち時間 ${minutes}分` +
    `(本文 ${contentSlides.length}枚・表紙と中扉と締め ${otherSlides.length}枚・` +
    `ノート ${noteChars.toLocaleString("ja-JP")}字)`
  );
};

const monotoneWarning = (deck: Deck): string[] => {
  const headings = deck.slides.flatMap((slide) => {
    const text = headingOf(slide);
    return text === undefined ? [] : [text];
  });
  if (deck.slides.length < TALK_MONOTONE_MIN_SLIDES || headings.length === 0) {
    return [];
  }
  const hasNoExclamationOrQuestion = headings.every(
    (heading) => !/[!?！？]/.test(heading),
  );
  const allHeadingsLong = headings.every(
    (heading) => charCount(heading) >= TALK_MAX_HEADING_CHARS,
  );
  return hasNoExclamationOrQuestion || allHeadingsLong
    ? [
        `見出しが単調(${TALK_MONOTONE_MIN_SLIDES}枚以上あって「！」も「？」も無い、または全部の見出しが${TALK_MAX_HEADING_CHARS}字以上)`,
      ]
    : [];
};

export type TalkCheck = { estimateLine: string; warnings: string[] };

// 登壇向けの検査。--minutes を付けたときだけ呼ぶ
export const talkCheck = (deck: Deck, minutes: number): TalkCheck => {
  const totalSeconds = deck.slides.reduce(
    (total, slide) => total + secondsFor(slide),
    0,
  );
  const overBudget =
    totalSeconds / 60 > minutes * TALK_TIME_BUDGET_RATIO
      ? [
          `尺の見積りが持ち時間の${TALK_TIME_BUDGET_RATIO * 100}%を超えている` +
            `(持ち時間 ${minutes}分 / 見積り 約${formatMinutes(totalSeconds / 60)}分)`,
        ]
      : [];
  const perSlide = deck.slides.flatMap((slide) => {
    const heading = headingOf(slide);
    return [
      ...(hasBusyBody(slide)
        ? [
            `${slide.id}: 本文が多い(${TALK_MAX_BODY_CHARS}字を超える、または箇条書きが${TALK_MAX_BULLET_ITEMS}項目以上)`,
          ]
        : []),
      ...(imageCountOf(slide) >= 2 ? [`${slide.id}: 画像が2つ以上ある`] : []),
      ...(heading !== undefined && isColloquial(heading)
        ? [`${slide.id}: 見出しの語尾が口語で砕けている(${heading})`]
        : []),
      ...(slide.layout === "content" && charCount(slide.notes ?? "") === 0
        ? [`${slide.id}: ノートが空`]
        : []),
    ];
  });
  return {
    estimateLine: estimateLine(deck, minutes, totalSeconds),
    warnings: [...overBudget, ...monotoneWarning(deck), ...perSlide],
  };
};

// 編集案(パッチ)の検査。対象の JSON(target.json)と突き合わせて id を確かめる

export type PatchCheck =
  | { ok: true; patches: SlidePatch[]; warnings: string[] }
  | { ok: false; errors: string };

export const isPatchInput = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  ("slideId" in value || "patches" in value);

const targetSlides = (target: unknown): Slide[] | undefined => {
  const deck = checkDeck(target);
  if (deck.success) return deck.deck.slides;
  const slide = slideSchema.safeParse(target);
  return slide.success ? [slide.data] : undefined;
};

export const checkPatchFile = (input: unknown, target: unknown): PatchCheck => {
  const parsed = checkPatch(input);
  if (!parsed.success) return { ok: false, errors: parsed.message };

  const placeholders =
    JSON.stringify(parsed.patches).split(PLACEHOLDER).length - 1;
  const warnings =
    placeholders > 0
      ? [`${PLACEHOLDER} が ${placeholders} か所に残っている`]
      : [];

  const slides = targetSlides(target);
  if (!slides) {
    return {
      ok: true,
      patches: parsed.patches,
      warnings: [
        ...warnings,
        "target.json を読めないので、id は確かめていない",
      ],
    };
  }

  const problems = parsed.patches.flatMap((patch) => {
    const slide = slides.find((item) => item.id === patch.slideId);
    if (!slide) return [`対象に無いスライド: ${patch.slideId}`];
    const existing = slide.blocks.map((block) => block.id);
    return patch.blocks.flatMap((block) =>
      block.id !== undefined && !existing.includes(block.id)
        ? [
            `${patch.slideId}: 元に無い id "${block.id}"。新しいブロックは id を書かない`,
          ]
        : [],
    );
  });

  return problems.length > 0
    ? { ok: false, errors: problems.join("\n") }
    : { ok: true, patches: parsed.patches, warnings };
};

export const deckIdFromPath = (path: string): string | undefined =>
  path.match(/decks[/\\](deck_\d{8}_\d{3})[/\\]/)?.[1];

// 不合格「画像パス欠損」
export const findMissingAssets = async (
  deck: Deck,
  deckDir: string,
): Promise<string[]> => {
  const sources = [
    ...new Set(
      deck.slides.flatMap((slide) =>
        slide.blocks.flatMap((block) =>
          isKnownBlock(block) && block.type === "image"
            ? [block.props.src]
            : [],
        ),
      ),
    ),
  ];
  const found = await Promise.all(
    sources.map((src) =>
      access(join(deckDir, src)).then(
        () => true,
        () => false,
      ),
    ),
  );
  return sources.filter((_, index) => !found[index]);
};
