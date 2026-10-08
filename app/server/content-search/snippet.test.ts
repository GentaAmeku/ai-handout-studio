import { describe, expect, it } from "vitest";
import type { SnippetSegment } from "../../src/api/types.ts";
import { bigramsOf, bm25, corpusOf, countGrams } from "./score.ts";
import { flatten, snippetOf } from "./snippet.ts";

// 行の2行目の前後の文と、2文字の重なりの点

const marked = (segments: readonly SnippetSegment[]): string =>
  segments
    .map((segment) => (segment.hit ? `[${segment.text}]` : segment.text))
    .join("");

describe("bigramsOf", () => {
  it("全角と半角・大文字と小文字をそろえ、空白を除いて2字ずつ切る", () => {
    expect(bigramsOf("ＡＩ 資料")).toEqual(["ai", "i資", "資料"]);
  });

  it("1字なら片は無い", () => {
    expect(bigramsOf("あ")).toEqual([]);
  });
});

describe("bm25", () => {
  it("珍しい片を多く含む文書ほど点が高く、片が無い文書は 0", () => {
    const corpus = corpusOf([
      { key: "a", counts: countGrams("メモリの割り当てを下げる") },
      { key: "b", counts: countGrams("メモを残す") },
      { key: "c", counts: countGrams("晩ごはんの献立") },
    ]);
    const scores = bm25(corpus, bigramsOf("メモリ"));
    expect(scores.get("a")).toBeGreaterThan(scores.get("b") ?? 0);
    expect(scores.get("b")).toBeGreaterThan(0);
    expect(scores.get("c")).toBe(0);
  });
});

describe("flatten", () => {
  it("見出しの印・表の縦線・改行をまとめて1行にする", () => {
    expect(flatten("## 結果\n| 方式 | 点 |\n| --- | --- |\n`code`")).toBe(
      "結果 方式 点 code",
    );
  });
});

describe("snippetOf", () => {
  it("打った語がそのまま入っていれば、その字に印を付ける", () => {
    expect(marked(snippetOf("Docker のメモリ割り当て", "メモリ"))).toBe(
      "Docker の[メモリ]割り当て",
    );
  });

  it("NFKC で字数が変わる字(…)が前にあっても、印は元の字の位置に付く", () => {
    expect(marked(snippetOf("…中略…にメモリから集約", "メモリ"))).toBe(
      "…中略…に[メモリ]から集約",
    );
  });

  it("語がそのまま無ければ、3字以上続けて重なった所に印を付ける", () => {
    expect(
      marked(
        snippetOf("毎回読み込む設定を測って減らした", "毎回読み込まれる指示"),
      ),
    ).toBe("[毎回読み込]む設定を測って減らした");
  });

  it("英語の語は単語の切れ目でだけ印を付け、the・an のような語は印にしない", () => {
    expect(
      marked(
        snippetOf(
          "An assistant: the command and the situation",
          "an assistant the",
        ),
      ),
    ).toBe("An [assistant]: the command and the situation");
  });

  it("英語は、語がそのまま無いときも単語の途中には印を付けない", () => {
    expect(
      marked(
        snippetOf("Interviews in the development team", "developer intern"),
      ),
    ).toBe("Interviews in the development team");
  });

  it("2字だけの重なりには印を付けない", () => {
    expect(marked(snippetOf("読むのは共通指示だけ", "毎回読み込まれる"))).toBe(
      "読むのは共通指示だけ",
    );
  });

  it("当たった所の少し前から70字を切り出し、切った側に … を付ける", () => {
    const text = `${"あ".repeat(100)}メモリ${"い".repeat(100)}`;
    const segments = snippetOf(text, "メモリ");
    expect(segments[0]).toEqual({ text: "…", hit: false });
    expect(segments.at(-1)).toEqual({ text: "…", hit: false });
    expect(marked(segments)).toBe(
      `…${"あ".repeat(18)}[メモリ]${"い".repeat(49)}…`,
    );
  });
});
