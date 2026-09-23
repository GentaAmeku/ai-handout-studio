import type { Block, KnownBlock } from "../schema/block";
import {
  type Deck,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Slide,
  type SlideLayout,
} from "../schema/deck";

// 編集操作。どれも deck を書き換えず、新しい deck を返す

export const SNAP_PX = 8;
export const MIN_BLOCK_PX = 32;

export type Rect = { x: number; y: number; w: number; h: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type NewBlock = DistributiveOmit<KnownBlock, "id">;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const snap = (value: number): number =>
  Math.round(value / SNAP_PX) * SNAP_PX;

// キャンバスの中に収める。8px のスナップは直接操作のときだけ使う
export const fitRect = (
  rect: Rect,
  { snapToGrid }: { snapToGrid: boolean },
): Rect => {
  const round = snapToGrid ? snap : Math.round;
  const w = clamp(round(rect.w), MIN_BLOCK_PX, SLIDE_WIDTH);
  const h = clamp(round(rect.h), MIN_BLOCK_PX, SLIDE_HEIGHT);
  return {
    x: clamp(round(rect.x), 0, SLIDE_WIDTH - w),
    y: clamp(round(rect.y), 0, SLIDE_HEIGHT - h),
    w,
    h,
  };
};

const allIds = (deck: Deck): string[] =>
  deck.slides.flatMap((slide) => [
    slide.id,
    ...slide.blocks.map((block) => block.id),
  ]);

// 既存の id と重ならない連番(s14, b44 …)を、offset 番目から順に返す
export const idSequence = (deck: Deck, prefix: "s" | "b") => {
  const used = allIds(deck).flatMap((id) => {
    const match = id.match(/^([a-z]+)(\d+)$/);
    return match?.[1] === prefix ? [Number(match[2])] : [];
  });
  const start = Math.max(0, ...used) + 1;
  return (offset: number): string =>
    `${prefix}${String(start + offset).padStart(2, "0")}`;
};

const insertAt = <T>(items: readonly T[], index: number, item: T): T[] => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
];

const indexOfSlide = (deck: Deck, slideId: string): number =>
  deck.slides.findIndex((slide) => slide.id === slideId);

export const findSlide = (deck: Deck, slideId: string): Slide | undefined =>
  deck.slides.find((slide) => slide.id === slideId);

export const findBlock = (
  deck: Deck,
  slideId: string,
  blockId: string,
): Block | undefined =>
  findSlide(deck, slideId)?.blocks.find((block) => block.id === blockId);

export const updateSlide = (
  deck: Deck,
  slideId: string,
  update: (slide: Slide) => Slide,
): Deck => ({
  ...deck,
  slides: deck.slides.map((slide) =>
    slide.id === slideId ? update(slide) : slide,
  ),
});

const mapBlocks = (
  deck: Deck,
  slideId: string,
  update: (blocks: readonly Block[]) => Block[],
): Deck =>
  updateSlide(deck, slideId, (slide) => ({
    ...slide,
    blocks: update(slide.blocks),
  }));

export const replaceBlock = (deck: Deck, slideId: string, block: Block): Deck =>
  mapBlocks(deck, slideId, (blocks) =>
    blocks.map((current) => (current.id === block.id ? block : current)),
  );

export const setBlockRect = (
  deck: Deck,
  slideId: string,
  blockId: string,
  rect: Rect,
  options: { snapToGrid: boolean },
): Deck =>
  mapBlocks(deck, slideId, (blocks) =>
    blocks.map((block) =>
      block.id === blockId ? { ...block, ...fitRect(rect, options) } : block,
    ),
  );

export const deleteBlock = (
  deck: Deck,
  slideId: string,
  blockId: string,
): Deck =>
  mapBlocks(deck, slideId, (blocks) =>
    blocks.filter((block) => block.id !== blockId),
  );

// 後から足したブロックほど前面に描かれるよう、末尾に足す
export const insertBlock = (
  deck: Deck,
  slideId: string,
  block: NewBlock,
): { deck: Deck; blockId: string } => {
  const blockId = idSequence(deck, "b")(0);
  const inserted = { ...block, id: blockId } as KnownBlock;
  return {
    deck: mapBlocks(deck, slideId, (blocks) => [...blocks, inserted]),
    blockId,
  };
};

const heading = (id: string, rect: Rect, text: string): KnownBlock => ({
  id,
  type: "heading",
  ...rect,
  props: { kicker: "", text, level: 1 },
});

const footer = (
  id: string,
  rect: Rect,
  props: { showPage?: boolean },
): KnownBlock => ({ id, type: "footer", ...rect, props });

// 新しいスライドの初期配置。左右 64px の余白に合わせる
const defaultBlocks = (
  layout: SlideLayout,
  blockId: (offset: number) => string,
): Block[] => {
  if (layout === "cover" || layout === "closing") {
    return [
      heading(
        blockId(0),
        { x: 64, y: 240, w: 1152, h: 160 },
        layout === "cover" ? "資料のタイトル" : "締めのメッセージ",
      ),
      footer(
        blockId(1),
        { x: 64, y: 640, w: 1152, h: 48 },
        { showPage: false },
      ),
    ];
  }
  return [
    layout === "section"
      ? heading(blockId(0), { x: 64, y: 280, w: 1152, h: 120 }, "章の見出し")
      : heading(blockId(0), { x: 64, y: 48, w: 1152, h: 96 }, "見出し"),
    footer(blockId(1), { x: 64, y: 664, w: 1152, h: 32 }, { showPage: true }),
  ];
};

export const addSlide = (
  deck: Deck,
  afterSlideId: string | undefined,
  layout: SlideLayout = "content",
): { deck: Deck; slideId: string } => {
  const slideId = idSequence(deck, "s")(0);
  const slide: Slide = {
    id: slideId,
    layout,
    notes: "",
    blocks: defaultBlocks(layout, idSequence(deck, "b")),
  };
  const index =
    afterSlideId === undefined
      ? deck.slides.length
      : indexOfSlide(deck, afterSlideId) + 1;
  return {
    deck: { ...deck, slides: insertAt(deck.slides, index, slide) },
    slideId,
  };
};

export const duplicateSlide = (
  deck: Deck,
  slideId: string,
): { deck: Deck; slideId: string } => {
  const index = indexOfSlide(deck, slideId);
  const source = deck.slides[index];
  if (!source) return { deck, slideId };
  const copyId = idSequence(deck, "s")(0);
  const blockId = idSequence(deck, "b");
  const copy: Slide = {
    ...source,
    id: copyId,
    blocks: source.blocks.map((block, offset) => ({
      ...block,
      id: blockId(offset),
    })),
  };
  return {
    deck: { ...deck, slides: insertAt(deck.slides, index + 1, copy) },
    slideId: copyId,
  };
};

// スライドは1枚より少なくしない。消したら同じ位置のスライドを選ぶ
export const deleteSlide = (
  deck: Deck,
  slideId: string,
): { deck: Deck; slideId: string } => {
  const index = indexOfSlide(deck, slideId);
  if (index < 0 || deck.slides.length <= 1) return { deck, slideId };
  const slides = deck.slides.filter((slide) => slide.id !== slideId);
  const next = slides[Math.min(index, slides.length - 1)];
  return { deck: { ...deck, slides }, slideId: next?.id ?? slideId };
};

// つまんだスライドを、離した先のスライドの位置へ入れる
export const reorderSlides = (
  deck: Deck,
  slideId: string,
  targetSlideId: string,
): Deck => {
  const index = indexOfSlide(deck, slideId);
  const target = indexOfSlide(deck, targetSlideId);
  const moved = deck.slides[index];
  if (!moved || target < 0 || index === target) return deck;
  const rest = deck.slides.filter((_, current) => current !== index);
  return { ...deck, slides: insertAt(rest, target, moved) };
};
