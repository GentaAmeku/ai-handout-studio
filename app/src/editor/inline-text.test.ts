import { describe, expect, it } from "vitest";
import type { Block } from "../schema/block";
import { inlineTextOf, withInlineText } from "./inline-text";

const base = { id: "b01", x: 0, y: 0, w: 100, h: 100 };

const heading: Block = {
  ...base,
  type: "heading",
  props: { kicker: "章", text: "見出し", level: 1 },
};
const bullets: Block = {
  ...base,
  type: "bullets",
  props: { items: ["一つ目", "二つ目"], marker: "number" },
};
const table: Block = {
  ...base,
  type: "table",
  props: { headers: ["a"], rows: [["b"]] },
};

describe("その場の文言編集", () => {
  it("見出しは text だけを直し、kicker と level は残す", () => {
    expect(inlineTextOf(heading)).toBe("見出し");
    expect(withInlineText(heading, "新しい\n見出し")).toEqual({
      ...heading,
      props: { kicker: "章", text: "新しい\n見出し", level: 1 },
    });
  });

  it("箇条書きは1行を1項目にし、空の行を捨てる", () => {
    expect(inlineTextOf(bullets)).toBe("一つ目\n二つ目");
    expect(withInlineText(bullets, "  A \n\nB\n")).toEqual({
      ...bullets,
      props: { items: ["A", "B"], marker: "number" },
    });
  });

  it("対象外の type は文言を持たず、変えない", () => {
    expect(inlineTextOf(table)).toBeUndefined();
    expect(withInlineText(table, "x")).toBe(table);
  });
});
