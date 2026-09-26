// @vitest-environment node
import { describe, expect, it } from "vitest";
import { documentSample } from "./document-sample.ts";
import { japaneseStrings, localizeSample } from "./sample-i18n.ts";
import { sheetSample } from "./sheet-sample.ts";

describe("localizeSample", () => {
  it("表にある文だけを置き換え、形はそのまま残す", () => {
    const text = new Map([
      ["題", "Title"],
      ["項目", "Item"],
    ]);
    expect(
      localizeSample(
        { title: "題", items: ["項目", "そのまま"], count: 2, done: null },
        text,
      ),
    ).toEqual({
      title: "Title",
      items: ["Item", "そのまま"],
      count: 2,
      done: null,
    });
  });
});

// 日本語の見本の文を変えて英語の表を合わせ忘れると、英語の見本に日本語が残る
describe("英語の見本", () => {
  it("文書の見本に日本語が残らない", () => {
    expect(japaneseStrings(documentSample("en"))).toEqual([]);
  });

  it("質問票の見本と入力済みの回答に日本語が残らない", () => {
    expect(japaneseStrings(sheetSample("en"))).toEqual([]);
  });

  it("未記入の印([[要確認]])は日本語として数えない", () => {
    expect(japaneseStrings(["[[要確認]] (Date)", "日付"])).toEqual(["日付"]);
  });
});
