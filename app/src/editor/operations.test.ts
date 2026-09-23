import { describe, expect, it } from "vitest";
import { proposalDeck } from "../../server/test-fixtures.ts";
import { validateDeck } from "../schema/deck";
import {
  addSlide,
  deleteBlock,
  deleteSlide,
  duplicateSlide,
  findBlock,
  fitRect,
  idSequence,
  insertBlock,
  reorderSlides,
  setBlockRect,
} from "./operations";

const proposal = proposalDeck();

const deck = validateDeck(proposal);
const slideIds = (target: typeof deck) =>
  target.slides.map((slide) => slide.id);

describe("fitRect", () => {
  it("直接操作では 8px にスナップし、キャンバスの中に収める", () => {
    expect(
      fitRect({ x: 1250, y: -10, w: 101, h: 20 }, { snapToGrid: true }),
    ).toEqual({ x: 1176, y: 0, w: 104, h: 32 });
  });

  it("数値の入力ではスナップせず、はみ出しだけ直す", () => {
    expect(
      fitRect({ x: 70, y: 13, w: 2000, h: 50 }, { snapToGrid: false }),
    ).toEqual({ x: 0, y: 13, w: 1280, h: 50 });
  });
});

describe("id の採番", () => {
  it("スライドとブロックそれぞれで、既存の最大の次から振る", () => {
    expect(idSequence(deck, "s")(0)).toBe("s14");
    expect(idSequence(deck, "b")(1)).toBe("b45");
  });
});

describe("スライドの操作", () => {
  it("追加は選んだスライドの後ろに入り、既定の見出しとフッターを持つ", () => {
    const result = addSlide(deck, "s02");
    expect(result.slideId).toBe("s14");
    expect(slideIds(result.deck).slice(0, 4)).toEqual([
      "s01",
      "s02",
      "s14",
      "s03",
    ]);
    expect(
      validateDeck(result.deck).slides[2]?.blocks.map((b) => b.id),
    ).toEqual(["b44", "b45"]);
  });

  it("複製は直後に入り、ブロックの id を振り直してもデッキの検証を通る", () => {
    const result = duplicateSlide(deck, "s04");
    const copy = result.deck.slides[4];
    expect(copy?.id).toBe("s14");
    expect(copy?.blocks.map((block) => block.id)).toEqual([
      "b44",
      "b45",
      "b46",
      "b47",
    ]);
    expect(() => validateDeck(result.deck)).not.toThrow();
  });

  it("削除は同じ位置のスライドを選び、最後の1枚は消さない", () => {
    const result = deleteSlide(deck, "s13");
    expect(result.slideId).toBe("s12");
    expect(result.deck.slides).toHaveLength(12);

    const single = { ...deck, slides: deck.slides.slice(0, 1) };
    expect(deleteSlide(single, "s01").deck).toBe(single);
  });

  it("並び替えは離した先の位置へ入れ、同じ場所と知らない id はそのまま", () => {
    expect(slideIds(reorderSlides(deck, "s02", "s01")).slice(0, 2)).toEqual([
      "s02",
      "s01",
    ]);
    expect(reorderSlides(deck, "s01", "s01")).toBe(deck);
    expect(reorderSlides(deck, "s01", "s99")).toBe(deck);
  });
});

describe("ブロックの操作", () => {
  it("位置と大きさを変え、削除し、新しいブロックを末尾に足す", () => {
    const moved = setBlockRect(
      deck,
      "s02",
      "b06",
      { x: 99, y: 201, w: 500, h: 300 },
      { snapToGrid: true },
    );
    expect(findBlock(moved, "s02", "b06")).toMatchObject({
      x: 96,
      y: 200,
      w: 504,
      h: 304,
    });

    expect(findBlock(deleteBlock(deck, "s02", "b06"), "s02", "b06")).toBe(
      undefined,
    );

    const inserted = insertBlock(deck, "s02", {
      type: "text",
      x: 64,
      y: 64,
      w: 400,
      h: 96,
      props: { text: "本文" },
    });
    expect(inserted.blockId).toBe("b44");
    expect(inserted.deck.slides[1]?.blocks.at(-1)?.id).toBe("b44");
  });
});
