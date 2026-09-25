import { describe, expect, it } from "vitest";
import { highlight, matchesAll, termsOf } from "./match";

describe("termsOf", () => {
  it("全角の空白も区切りにし、空の語は捨てる", () => {
    expect(termsOf("  提案　Cobalt  ")).toEqual(["提案", "cobalt"]);
    expect(termsOf("   ")).toEqual([]);
  });
});

describe("matchesAll", () => {
  it("大文字と小文字、全角と半角を区別しない", () => {
    expect(matchesAll(termsOf("ai"), ["ＡＩ 入門"])).toBe(true);
    expect(matchesAll(termsOf("ＬＵＭＥＮ"), ["lumen"])).toBe(true);
  });

  it("語は全部を含むものだけが当たる(見るところをまたいでもよい)", () => {
    const fields = ["ご提案書", "cobalt", "deck_001"];
    expect(matchesAll(termsOf("提案 Cobalt"), fields)).toBe(true);
    expect(matchesAll(termsOf("提案 lumen"), fields)).toBe(false);
  });

  it("ひらがなとカタカナは区別する", () => {
    expect(matchesAll(termsOf("てんぷれ"), ["テンプレート"])).toBe(false);
  });

  it("語が無ければ当たらない", () => {
    expect(matchesAll([], ["なんでも"])).toBe(false);
  });
});

describe("highlight", () => {
  it("当たった所だけを印にする", () => {
    expect(highlight("AI が作る資料を整える", termsOf("資料"))).toEqual([
      { text: "AI が作る", hit: false },
      { text: "資料", hit: true },
      { text: "を整える", hit: false },
    ]);
  });

  it("全角の字でも元の字のまま印にし、語ごと・何度でも当てる", () => {
    expect(highlight("ＡＩとai", termsOf("ai"))).toEqual([
      { text: "ＡＩ", hit: true },
      { text: "と", hit: false },
      { text: "ai", hit: true },
    ]);
    expect(highlight("提案の Cobalt", termsOf("cobalt 提案"))).toEqual([
      { text: "提案", hit: true },
      { text: "の ", hit: false },
      { text: "Cobalt", hit: true },
    ]);
  });

  it("当たらなければ1つのまま返す", () => {
    expect(highlight("報告書", termsOf("資料"))).toEqual([
      { text: "報告書", hit: false },
    ]);
  });
});
