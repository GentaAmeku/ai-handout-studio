import { describe, expect, it } from "vitest";
import { proposalDeck } from "../../server/test-fixtures.ts";
import { validateDeck } from "../schema/deck";
import { findSlide } from "./operations";
import { applySlideJson } from "./slide-json";

const proposal = proposalDeck();

const deck = validateDeck(proposal);
const slideJson = (patch: object) =>
  JSON.stringify({ ...findSlide(deck, "s02"), ...patch });

describe("applySlideJson", () => {
  it("検証を通った JSON で、そのスライドだけを置き換える", () => {
    const result = applySlideJson(
      deck,
      "s02",
      slideJson({ notes: "話すこと" }),
    );
    expect(result.success).toBe(true);
    expect(result.success && findSlide(result.deck, "s02")?.notes).toBe(
      "話すこと",
    );
    expect(result.success && result.deck.slides[0]).toEqual(deck.slides[0]);
  });

  it("読めない JSON、変えた id、重複した id、壊れたブロックを弾く", () => {
    expect(applySlideJson(deck, "s02", "{ broken")).toMatchObject({
      success: false,
      message: expect.stringContaining("JSON として読めない"),
    });
    expect(applySlideJson(deck, "s02", slideJson({ id: "s99" }))).toMatchObject(
      { success: false, message: expect.stringContaining('"s02"') },
    );
    const duplicated = slideJson({
      blocks: [{ ...findSlide(deck, "s03")?.blocks[0] }],
    });
    expect(applySlideJson(deck, "s02", duplicated)).toMatchObject({
      success: false,
      message: expect.stringContaining("重複"),
    });
    const broken = slideJson({
      blocks: [
        { id: "b90", type: "heading", x: 0, y: 0, w: 10, h: 10, props: {} },
      ],
    });
    expect(applySlideJson(deck, "s02", broken).success).toBe(false);
  });
});
