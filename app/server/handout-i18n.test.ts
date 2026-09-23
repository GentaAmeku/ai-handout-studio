import { describe, expect, it } from "vitest";
import { HANDOUT_STRINGS } from "./handout-i18n";

// 画面の文言の辞書。ja と en のキーがそろっていることだけを確かめる
// (実際に日本語が残らないことは sheet-render.test.ts・document-render.test.ts で確かめる)

describe("HANDOUT_STRINGS", () => {
  it("ja と en の sheet のキーがそろっている", () => {
    expect(Object.keys(HANDOUT_STRINGS.en.sheet).sort()).toEqual(
      Object.keys(HANDOUT_STRINGS.ja.sheet).sort(),
    );
  });

  it("ja と en の document のキーがそろっている", () => {
    expect(Object.keys(HANDOUT_STRINGS.en.document).sort()).toEqual(
      Object.keys(HANDOUT_STRINGS.ja.document).sort(),
    );
  });

  it("noticeWord・noticeLabel は success・info・warning がそろっている", () => {
    expect(Object.keys(HANDOUT_STRINGS.en.sheet.noticeWord).sort()).toEqual(
      Object.keys(HANDOUT_STRINGS.ja.sheet.noticeWord).sort(),
    );
    expect(Object.keys(HANDOUT_STRINGS.en.document.noticeLabel).sort()).toEqual(
      Object.keys(HANDOUT_STRINGS.ja.document.noticeLabel).sort(),
    );
  });

  it("どの言語の文言も空文字にしていない", () => {
    for (const lang of ["ja", "en"] as const) {
      const sheet = HANDOUT_STRINGS[lang].sheet;
      expect(sheet.copyAnswers.length).toBeGreaterThan(0);
      expect(sheet.questionCounter(1, 3).length).toBeGreaterThan(0);
      expect(sheet.requiredWhen(["A"]).length).toBeGreaterThan(0);
      expect(sheet.printMeta("demo", "1", 3).length).toBeGreaterThan(0);
      expect(sheet.doneOfTotalSuffix(3).length).toBeGreaterThan(0);
      const doc = HANDOUT_STRINGS[lang].document;
      expect(doc.tocLabel.length).toBeGreaterThan(0);
      expect(doc.summaryLabel.length).toBeGreaterThan(0);
    }
  });
});
