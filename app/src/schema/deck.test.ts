import { describe, expect, it } from "vitest";
import { checkDeck, validateDeck } from "./deck";

const baseDeck = (blocks: unknown[] = [], slideOverrides = {}) => ({
  id: "deck_20260915_001",
  title: "ご提案書",
  theme: "default",
  size: { width: 1280, height: 720 },
  status: "draft",
  meta: {
    audience: "勉強会",
    tags: ["提案"],
    createdAt: "2026-09-15T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
  },
  slides: [
    {
      id: "s01",
      layout: "content",
      notes: "",
      background: "default",
      blocks,
      ...slideOverrides,
    },
  ],
});

const heading = {
  id: "b01",
  type: "heading",
  x: 64,
  y: 48,
  w: 980,
  h: 72,
  props: { kicker: "ミッション・ビジョン", text: "見出し", level: 1 },
};

const failureMessage = (input: unknown) => {
  const result = checkDeck(input);
  return result.success ? "" : result.message;
};

describe("validateDeck", () => {
  it("設計書の例に沿ったデッキを通す", () => {
    const deck = validateDeck(baseDeck([heading]));
    expect(deck.slides[0]?.blocks[0]).toEqual(heading);
  });

  it("1280x720 以外のサイズを弾く", () => {
    const input = { ...baseDeck(), size: { width: 1920, height: 1080 } };
    expect(() => validateDeck(input)).toThrow();
  });

  it("props に色を書いたブロックを弾く", () => {
    const colored = {
      ...heading,
      props: { ...heading.props, color: "#ff0000" },
    };
    expect(failureMessage(baseDeck([colored]))).toMatch(/color/);
  });

  it("ブロック直下の余分なキーを弾く", () => {
    const styled = { ...heading, style: { fontFamily: "serif" } };
    expect(checkDeck(baseDeck([styled])).success).toBe(false);
  });

  it("既知の type で props が壊れていれば、壊れた項目を示して弾く", () => {
    const broken = { ...heading, props: { level: 1 } };
    const message = failureMessage(baseDeck([broken]));
    expect(message).toMatch(/text/);
    expect(message).toMatch(/slides\[0\]\.blocks\[0\]\.props\.text/);
  });

  it("未知の type は通す", () => {
    const future = {
      id: "b02",
      type: "timeline",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      props: { anything: true },
    };
    const deck = validateDeck(baseDeck([future]));
    expect(deck.slides[0]?.blocks[0]?.type).toBe("timeline");
  });

  it.each([
    "https://example.com/a.png",
    "/assets/a.png",
    "assets/../secret.png",
    "images/a.png",
  ])("assets/ 相対でない画像パス %s を弾く", (src) => {
    const image = {
      id: "b03",
      type: "image",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      props: { src },
    };
    expect(checkDeck(baseDeck([image])).success).toBe(false);
  });

  it("表の列数が揃わない行を弾く", () => {
    const table = {
      id: "b04",
      type: "table",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      props: { headers: ["項目", "内容"], rows: [["a", "b"], ["c"]] },
    };
    expect(failureMessage(baseDeck([table]))).toMatch(/列数/);
  });

  it("スライドとブロックをまたいで id の重複を弾く", () => {
    const input = baseDeck([{ ...heading, id: "s01" }]);
    expect(failureMessage(input)).toMatch(/s01.*重複/);
  });

  it("layout がカタログ外なら弾く", () => {
    expect(checkDeck(baseDeck([], { layout: "hero" })).success).toBe(false);
  });

  it("背景に色コードを書いたら弾く", () => {
    expect(checkDeck(baseDeck([], { background: "#fff" })).success).toBe(false);
  });
});
