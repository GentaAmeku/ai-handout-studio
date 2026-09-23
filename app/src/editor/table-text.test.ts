import { describe, expect, it } from "vitest";
import { headersToText, rowsToText, textToTable } from "./table-text";

describe("表の文字列変換", () => {
  it("「|」区切りと往復できる", () => {
    const headers = ["フェーズ", "期間"];
    const rows = [
      ["現状把握", "2週間"],
      ["実行", ""],
    ];
    expect(textToTable(headersToText(headers), rowsToText(rows))).toEqual({
      headers,
      rows,
    });
  });

  it("行の列数を見出しに合わせ、空の行を捨て、見出しが空なら1列にする", () => {
    expect(textToTable("A | B | C", "1 | 2\n\n1 | 2 | 3 | 4")).toEqual({
      headers: ["A", "B", "C"],
      rows: [
        ["1", "2", ""],
        ["1", "2", "3"],
      ],
    });
    expect(textToTable(" | ", "x")).toEqual({
      headers: ["項目"],
      rows: [["x"]],
    });
  });
});
