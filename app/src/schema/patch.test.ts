import { describe, expect, it } from "vitest";
import { checkPatch } from "./patch";

const block = (extra: object = {}) => ({
  type: "text",
  x: 64,
  y: 176,
  w: 560,
  h: 96,
  props: { text: "本文" },
  ...extra,
});

describe("checkPatch", () => {
  it("1スライド分のパッチを受け取る。新しいブロックは id が無くてよい", () => {
    const result = checkPatch({
      slideId: "s04",
      blocks: [block(), block({ id: "b12" })],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.patches).toHaveLength(1);
  });

  it("デッキ全体はスライドごとのパッチの集まりとして受け取る", () => {
    const result = checkPatch({
      patches: [
        { slideId: "s01", blocks: [] },
        { slideId: "s02", blocks: [block()] },
      ],
    });
    expect(
      result.success && result.patches.map((patch) => patch.slideId),
    ).toEqual(["s01", "s02"]);
  });

  it("カタログ外の type、使えないアイコン、余分なキーを弾く", () => {
    expect(
      checkPatch({ slideId: "s04", blocks: [block({ type: "timeline" })] })
        .success,
    ).toBe(false);
    expect(
      checkPatch({
        slideId: "s04",
        blocks: [
          {
            type: "card-grid",
            x: 64,
            y: 176,
            w: 560,
            h: 96,
            props: {
              columns: 2,
              items: [{ title: "a", body: "b", icon: "rainbow" }],
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      checkPatch({ slideId: "s04", blocks: [block({ color: "#fff" })] })
        .success,
    ).toBe(false);
    expect(checkPatch({ slideId: "s04" }).success).toBe(false);
  });
});
