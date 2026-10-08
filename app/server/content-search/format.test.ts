import { describe, expect, it } from "vitest";
import { formatContentHits } from "./format.ts";

// ai-handout-studio search の出力

describe("formatContentHits", () => {
  it("1件を区分・ID・題名、場所、前後の文の3行にする", () => {
    expect(
      formatContentHits("メモリ", [
        {
          kind: "sheet",
          id: "sheet_20260930_004",
          title: "Mac の空き容量を戻す",
          place: { type: "question", number: 4 },
          snippet: [
            { text: "…スワップで、", hit: false },
            { text: "メモリ", hit: true },
            { text: " 16GB…", hit: false },
          ],
        },
        {
          kind: "slide",
          id: "deck_20260922_002",
          title: "AI が作る資料を整える場所",
          place: { type: "slide", number: 3, slideId: "s3" },
          snippet: [{ text: "メモリ", hit: true }],
        },
      ]),
    ).toBe(
      [
        "「メモリ」の中身の当たり 2 件(近い順)",
        "1. sheet_20260930_004 質問票 Mac の空き容量を戻す",
        "   場所: Q4",
        "   …スワップで、メモリ 16GB…",
        "2. deck_20260922_002 スライド AI が作る資料を整える場所",
        "   場所: スライド 3",
        "   メモリ",
      ].join("\n"),
    );
  });

  it("当たりが無ければそう伝える", () => {
    expect(formatContentHits("量子計算", [])).toBe(
      "「量子計算」の中身に当たる資料は見つからなかった",
    );
  });
});
