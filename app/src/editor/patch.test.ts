import { describe, expect, it } from "vitest";
import { proposalDeck } from "../../server/test-fixtures.ts";
import { validateDeck } from "../schema/deck";
import type { SlidePatch } from "../schema/patch";
import { findSlide } from "./operations";
import { applyPatches } from "./patch";

const proposal = proposalDeck();

const deck = validateDeck(proposal);

const text = (extra: object = {}): SlidePatch["blocks"][number] => ({
  type: "text",
  x: 64,
  y: 176,
  w: 560,
  h: 96,
  props: { text: "本文" },
  ...extra,
});

describe("applyPatches", () => {
  it("対象スライドの blocks だけを置き換え、ほかのスライドは変えない", () => {
    const result = applyPatches(deck, [
      { slideId: "s02", blocks: [text({ id: "b06" })] },
    ]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(
      findSlide(result.deck, "s02")?.blocks.map((block) => block.id),
    ).toEqual(["b06"]);
    expect(findSlide(result.deck, "s02")?.layout).toBe("content");
    expect(findSlide(result.deck, "s03")).toEqual(findSlide(deck, "s03"));
  });

  it("id の無いブロックには、デッキ内で重ならない id を振る", () => {
    const result = applyPatches(deck, [
      { slideId: "s02", blocks: [text({ id: "b05" }), text(), text()] },
      { slideId: "s03", blocks: [text()] },
    ]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(
      findSlide(result.deck, "s02")?.blocks.map((block) => block.id),
    ).toEqual(["b05", "b44", "b45"]);
    expect(
      findSlide(result.deck, "s03")?.blocks.map((block) => block.id),
    ).toEqual(["b46"]);
  });

  it("元に無い id、対象外のスライド、同じスライドの重複を弾く", () => {
    expect(
      applyPatches(deck, [{ slideId: "s02", blocks: [text({ id: "b99" })] }]),
    ).toMatchObject({
      success: false,
      message: expect.stringContaining("b99"),
    });
    expect(applyPatches(deck, [{ slideId: "s99", blocks: [] }])).toMatchObject({
      success: false,
      message: expect.stringContaining("s99"),
    });
    expect(
      applyPatches(deck, [
        { slideId: "s02", blocks: [] },
        { slideId: "s02", blocks: [] },
      ]),
    ).toMatchObject({ success: false, message: expect.stringContaining("重") });
  });

  it("反映したあとにデッキの検証を通らなければ、反映しない", () => {
    const result = applyPatches(deck, [
      { slideId: "s02", blocks: [text({ id: "b05" }), text({ id: "b05" })] },
    ]);
    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining("重複"),
    });
  });
});
