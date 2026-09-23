import { describe, expect, it } from "vitest";
import { proposalDeck } from "../../server/test-fixtures.ts";
import { knownBlockTypes } from "../schema/block";
import { checkAiDeck, SLIDE_HEIGHT, validateDeck } from "../schema/deck";
import { insertBlock } from "./operations";
import { parts } from "./parts";

const proposal = proposalDeck();

const deck = validateDeck(proposal);

describe("パーツ", () => {
  it("初期10種を1つずつ持つ", () => {
    expect(parts.map((part) => part.type).sort()).toEqual(
      [...knownBlockTypes].sort(),
    );
  });

  it("どのパーツも、足したあと AI 出力用の検証を通り、左右64pxの余白に収まる", () => {
    const withAll = parts.reduce(
      (current, part) => insertBlock(current, "s01", part.create()).deck,
      deck,
    );
    const result = checkAiDeck(withAll);
    expect(result.success ? "" : result.message).toBe("");

    const outside = parts
      .map((part) => part.create())
      .filter(
        (block) =>
          block.x < 64 ||
          block.x + block.w > 1216 ||
          block.y + block.h > SLIDE_HEIGHT,
      )
      .map((block) => block.type);
    expect(outside).toEqual([]);
  });
});
