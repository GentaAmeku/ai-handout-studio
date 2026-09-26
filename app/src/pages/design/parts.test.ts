import { describe, expect, it } from "vitest";
import { partSlides } from "./parts";

const shapeOf = (slides: ReturnType<typeof partSlides>) =>
  slides.map((slide) =>
    slide.blocks.map(({ id, type, x, y, w, h }) => ({ id, type, x, y, w, h })),
  );

describe("部品一覧", () => {
  it("英語は日本語と同じ並び・座標で、日本語が残らない", () => {
    expect(shapeOf(partSlides("en"))).toEqual(shapeOf(partSlides("ja")));
    expect(JSON.stringify(partSlides("en"))).not.toMatch(/[぀-ヿ一-鿿]/);
  });
});
