import type { Block, PatchBlock } from "../schema/block";
import { checkDeck, type Deck } from "../schema/deck";
import type { SlidePatch } from "../schema/patch";
import { idSequence } from "./operations";

// 編集案の反映。対象スライドの blocks だけを置き換える

export type PatchResult =
  | { success: true; deck: Deck; slideIds: string[] }
  | { success: false; message: string };

const duplicates = (values: readonly string[]): string[] =>
  values.filter((value, index) => values.indexOf(value) !== index);

// 残すブロックは元の id のまま。id を書いていない新しいブロックにだけ id を振る
const withIds = (
  blocks: readonly PatchBlock[],
  nextId: (offset: number) => string,
  startOffset: number,
): { blocks: Block[]; offset: number } =>
  blocks.reduce<{ blocks: Block[]; offset: number }>(
    (current, block) =>
      block.id === undefined
        ? {
            blocks: [
              ...current.blocks,
              { ...block, id: nextId(current.offset) } as Block,
            ],
            offset: current.offset + 1,
          }
        : {
            blocks: [...current.blocks, { ...block, id: block.id } as Block],
            offset: current.offset,
          },
    { blocks: [], offset: startOffset },
  );

const checkTargets = (
  deck: Deck,
  patches: readonly SlidePatch[],
): string | undefined => {
  const slideIds = patches.map((patch) => patch.slideId);
  const repeated = duplicates(slideIds);
  if (repeated.length > 0) {
    return `同じスライドへのパッチが重なっている: ${repeated.join(", ")}`;
  }
  const missing = slideIds.filter(
    (slideId) => !deck.slides.some((slide) => slide.id === slideId),
  );
  if (missing.length > 0) {
    return `対象のスライドが見つからない: ${missing.join(", ")}`;
  }
  // 元に無い id を書いていたら、既存ブロックの id を振り直したとみなして弾く
  const unknown = patches.flatMap((patch) => {
    const slide = deck.slides.find((item) => item.id === patch.slideId);
    const existing = slide?.blocks.map((block) => block.id) ?? [];
    return patch.blocks.flatMap((block) =>
      block.id !== undefined && !existing.includes(block.id) ? [block.id] : [],
    );
  });
  if (unknown.length > 0) {
    return `元のスライドに無い id が入っている: ${unknown.join(", ")}。新しいブロックは id を書かない`;
  }
  return undefined;
};

export const applyPatches = (
  deck: Deck,
  patches: readonly SlidePatch[],
): PatchResult => {
  const problem = checkTargets(deck, patches);
  if (problem) return { success: false, message: problem };

  const nextId = idSequence(deck, "b");
  const applied = patches.reduce<{ deck: Deck; offset: number }>(
    (current, patch) => {
      const filled = withIds(patch.blocks, nextId, current.offset);
      return {
        deck: {
          ...current.deck,
          slides: current.deck.slides.map((slide) =>
            slide.id === patch.slideId
              ? { ...slide, blocks: filled.blocks }
              : slide,
          ),
        },
        offset: filled.offset,
      };
    },
    { deck, offset: 0 },
  );

  // 反映したら、下書き全体をもう一度検証する
  const result = checkDeck(applied.deck);
  return result.success
    ? {
        success: true,
        deck: result.deck,
        slideIds: patches.map((patch) => patch.slideId),
      }
    : { success: false, message: result.message };
};
