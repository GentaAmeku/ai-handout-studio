// @vitest-environment node
import { describe, expect, it } from "vitest";
import { highlightCode, isKnownCodeLanguage } from "./code-highlight";

// 色分けした HTML から字だけを取り出す(コピーのボタンが拾う textContent と同じ)
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

const classesOf = (html: string): string[] => [
  ...new Set(
    [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) =>
      (match[1] ?? "").split(" "),
    ),
  ),
];

const TS = [
  "export class Store {",
  "  // 件数を数える",
  "  count(id: string): number { return this.rows.filter((r) => r.id === id).length; }",
  "}",
].join("\n");

describe("コードの色分け", () => {
  it("lang の言語で色分けし、class は ds-hl- で始まるものだけにする", () => {
    const html = highlightCode(TS, "ts");
    expect(html).toContain('<span class="ds-hl-keyword">export</span>');
    expect(html).toContain(
      '<span class="ds-hl-comment">// 件数を数える</span>',
    );
    // 下位の分類(title.class)も頭を付けて出す
    expect(html).toContain('class="ds-hl-title ds-hl-title-class"');
    expect(
      classesOf(html).filter((name) => !name.startsWith("ds-hl-")),
    ).toEqual([]);
  });

  it("色分けしても字は変わらない(コピーで同じ字が取れる)", () => {
    const text = 'const html = "<b>&</b>";\n\tif (a < b && c > d) {}';
    expect(textOf(highlightCode(text, "ts"))).toBe(text);
    expect(textOf(highlightCode(text))).toBe(text);
  });

  it('本文の < > & " は字のまま逃がし、タグにしない', () => {
    const html = highlightCode('<script>alert("x")</script>', "ts");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;");
  });

  it("言語の名前は別名と大文字を受ける", () => {
    expect(isKnownCodeLanguage("TS")).toBe(true);
    expect(isKnownCodeLanguage(" yml ")).toBe(true);
    expect(isKnownCodeLanguage("sh")).toBe(true);
    expect(isKnownCodeLanguage("cobol")).toBe(false);
    expect(highlightCode("echo 1", "Bash")).toContain("ds-hl-built_in");
  });

  it("知らない言語は色分けせず、字のまま出す", () => {
    expect(highlightCode("IDENTIFICATION DIVISION.", "cobol")).toBe(
      "IDENTIFICATION DIVISION.",
    );
  });

  it("lang が無ければ自動で見分ける。差分は追加と削除の行に分かれる", () => {
    const html = highlightCode(
      "@@ -1,2 +1,2 @@\n context\n-const a = 1;\n+const a = 2;",
    );
    expect(html).toContain('<span class="ds-hl-deletion">-const a = 1;</span>');
    expect(html).toContain('<span class="ds-hl-addition">+const a = 2;</span>');
  });

  it("lang が無くても、差分の頭(@@・diff --git)があれば差分として出す", () => {
    const html = highlightCode(
      "@@ -476,2 +476,2 @@\n \tconst title = q.title;\n-\tconst a = response.answers.find((item) => item.id === q.id);\n+\tconst a = byId.get(q.id);",
    );
    expect(html).toContain('class="ds-hl-deletion"');
    expect(html).toContain('class="ds-hl-addition"');
    expect(highlightCode("diff --git a/x.ts b/x.ts\n+const a = 1;")).toContain(
      'class="ds-hl-addition"',
    );
  });

  it("見分けの弱い短い出力や日本語の文は、色を付けずに出す", () => {
    expect(highlightCode("$ pnpm test\n✓ 128 passed")).toBe(
      "$ pnpm test\n✓ 128 passed",
    );
    expect(highlightCode("回答の返却です。外部操作の承認は含みません。")).toBe(
      "回答の返却です。外部操作の承認は含みません。",
    );
  });
});
