// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  DocumentBlock,
  DocumentFile,
  DocumentSection,
} from "../src/schema/document";
import { checkDocument } from "../src/schema/document";
import { documentBody } from "./document-render";
import { documentSample, documentSampleBody } from "./document-sample";

const AT = "2026-09-20T00:00:00.000Z";

const doc = (sections: DocumentSection[]): DocumentFile => ({
  id: "doc_test",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "題" },
  toc: "none",
  sections,
});

// ブロック1つだけの文書を描いて、本文(.ds-main の中)を取り出す
const render = (block: DocumentBlock): string => {
  const html = documentBody(
    doc([{ id: "s1", heading: "セクション", blocks: [block] }]),
  );
  const start =
    html.indexOf("<h2>セクション</h2>") + "<h2>セクション</h2>".length;
  return html.slice(start, html.indexOf("</section>", start));
};

describe("documentBody のブロック", () => {
  it("段落は改行ごとに p を分ける", () => {
    expect(render({ id: "b1", type: "text", props: { text: "一\n二" } })).toBe(
      "<p>一</p><p>二</p>",
    );
  });

  it("箇条書きと番号の付く並び", () => {
    expect(
      render({ id: "b1", type: "bullets", props: { items: ["あ", "い"] } }),
    ).toBe("<ul><li>あ</li><li>い</li></ul>");
    expect(
      render({
        id: "b1",
        type: "ordered",
        props: { items: [{ text: "決めた", why: "理由" }, { text: "次" }] },
      }),
    ).toBe(
      '<ol class="ds-ordered"><li>決めた<span class="ds-why">理由</span></li><li>次</li></ol>',
    );
  });

  it("表は行見出しと数値の列に class を付ける", () => {
    expect(
      render({
        id: "b1",
        type: "table",
        props: {
          headers: ["段", "日数"],
          rows: [["調査", "3"]],
          rowLabel: true,
          numeric: [1],
        },
      }),
    ).toBe(
      '<table class="ds-table"><thead><tr><th>段</th><th class="ds-num">日数</th></tr></thead><tbody><tr><td class="ds-rowlabel">調査</td><td class="ds-num">3</td></tr></tbody></table>',
    );
  });

  it("カードは3列のときだけ ds-columns-3 を足す", () => {
    const items = [{ title: "案A", body: "本文" }];
    expect(
      render({ id: "b1", type: "cards", props: { columns: 2, items } }),
    ).toContain('<div class="ds-columns">');
    expect(
      render({ id: "b1", type: "cards", props: { columns: 3, items } }),
    ).toContain('<div class="ds-columns ds-columns-3">');
  });

  it("注意・補足・危険・未決", () => {
    expect(
      render({
        id: "b1",
        type: "notice",
        props: { kind: "warning", text: "条件" },
      }),
    ).toBe(
      '<div class="ds-notice ds-notice-warning"><span class="ds-notice-label">注意</span><p>条件</p></div>',
    );
    // 種類ごとの言い回しは label で変えられる(色は class が決める)
    expect(
      render({
        id: "b1",
        type: "notice",
        props: { kind: "success", label: "確かめた結果", text: "通った" },
      }),
    ).toContain('<span class="ds-notice-label">確かめた結果</span>');
    expect(
      render({ id: "b1", type: "note", props: { text: "補足の中身" } }),
    ).toBe('<div class="ds-note"><strong>補足</strong> — 補足の中身</div>');
    expect(
      render({ id: "b1", type: "alert", props: { text: "戻せない" } }),
    ).toBe('<div class="ds-alert"><strong>危険</strong> — 戻せない</div>');
    expect(render({ id: "b1", type: "open", props: { text: "未決" } })).toBe(
      '<div class="ds-open"><p>未決</p></div>',
    );
  });

  it("引用とコード", () => {
    expect(
      render({
        id: "b1",
        type: "quote",
        props: { text: "引用", source: "出典" },
      }),
    ).toBe(
      '<div class="ds-quote"><p>引用</p><p class="ds-quote-source">出典</p></div>',
    );
    const code = render({
      id: "b1",
      type: "code",
      props: { text: "pnpm test", caption: "検証" },
    });
    expect(code).toMatch(
      /^<p class="ds-label">検証<\/p><div class="ds-code-block"><pre class="ds-code"><code>pnpm test<\/code><\/pre><button [^>]*><svg .*<\/button><\/div>$/,
    );
    // コピーのボタンはアイコンだけ。名前は title と読み上げ用の文字が持ち、スクリプトが動くまで隠す
    expect(code).toContain(
      '<button type="button" class="ds-code-copy" data-code-copy title="コードをコピー" data-copied="コピーしました" data-failed="選択しました。手でコピーしてください" hidden>',
    );
    expect(code).toContain('data-icon="copy"');
    expect(code).toContain('data-icon="check"');
    expect(code).toContain(
      '<span class="ds-code-copy-text" aria-live="polite">コードをコピー</span></button>',
    );
  });

  it("図は .ds-figure-frame の中に生成器の出力を置く", () => {
    expect(
      render({
        id: "b1",
        type: "figure",
        props: { html: '<svg class="ds-node"></svg>', caption: "図 流れ" },
      }),
    ).toBe(
      '<figure class="ds-figure"><div class="ds-figure-frame"><svg class="ds-node"></svg></div><figcaption>図 流れ</figcaption></figure>',
    );
  });

  it("html はそのまま置く(移行の受け皿)", () => {
    expect(
      render({ id: "b1", type: "html", props: { html: "<p>古い本文</p>" } }),
    ).toBe("<p>古い本文</p>");
  });

  it("中身の記号は逃がす", () => {
    expect(render({ id: "b1", type: "text", props: { text: '<b>&"' } })).toBe(
      "<p>&lt;b&gt;&amp;&quot;</p>",
    );
  });
});

describe("documentBody の骨格", () => {
  const sections: DocumentSection[] = [
    { id: "s1", heading: "セクション1", level: 2, blocks: [] },
    { id: "s1-a", heading: "小セクション", level: 3, blocks: [] },
    { id: "s2", heading: "セクション2", level: 2, blocks: [] },
  ];

  it("level 3 のセクションは直前のセクションの中に、セクションの id を付けた h3 として入る", () => {
    expect(documentBody(doc(sections))).toContain(
      '<section id="s1"><h2>セクション1</h2><h3 id="s1-a">小セクション</h3></section><section id="s2"><h2>セクション2</h2></section>',
    );
  });

  it("目次は auto のときだけ出し、h3 のセクションは章の li の中に入れ子の ol で出す", () => {
    expect(documentBody(doc(sections))).not.toContain("ds-toc");
    const html = documentBody({ ...doc(sections), toc: "auto" });
    expect(html).toContain(
      '<ol><li><a href="#s1">セクション1</a><ol><li><a href="#s1-a">小セクション</a></li></ol></li><li><a href="#s2">セクション2</a></li></ol>',
    );
  });

  it("先頭が level 3 のセクションは章として扱い、目次の入れ子にしない", () => {
    const html = documentBody({
      ...doc([
        { id: "s0", heading: "前置き", level: 3, blocks: [] },
        ...sections,
      ]),
      toc: "auto",
    });
    expect(html).toContain('<section id="s0"><h3>前置き</h3></section>');
    expect(html).toContain(
      '<ol><li><a href="#s0">前置き</a></li><li><a href="#s1">',
    );
  });

  it("DOM に足すのは h3 の id と目次の入れ子だけで、class は増やさない", () => {
    const html = documentBody({ ...doc(sections), toc: "auto" });
    expect(html.match(/class="[^"]*"/g)).toEqual(
      documentBody({
        ...doc(sections.filter((s) => s.level !== 3)),
        toc: "auto",
      }).match(/class="[^"]*"/g),
    );
  });

  it("署名・要約・脇・下端は持つときだけ出す", () => {
    expect(documentBody(doc([]))).toBe(
      '<div class="ds-page"><div class="ds-head"><h1>題</h1></div><div class="ds-cols"><main class="ds-main"></main></div></div>',
    );
    const full = documentBody({
      ...doc([]),
      signature: { org: "組織", note: "設計書 / 2026-09-20" },
      head: { title: "題", lede: "要旨" },
      summary: { text: "結論" },
      aside: { label: "用語", glossary: [{ term: "語", description: "意味" }] },
      foot: { org: "組織", showPage: true },
    });
    expect(full).toContain(
      '<div class="ds-signature"><span>組織</span><span>設計書 / 2026-09-20</span></div>',
    );
    expect(full).toContain('<p class="ds-lede">要旨</p>');
    expect(full).toContain(
      '<div class="ds-summary"><div class="ds-label">要約</div><p>結論</p></div>',
    );
    expect(full).toContain(
      '<aside class="ds-aside"><span class="ds-label">用語</span><dl class="ds-glossary"><dt>語</dt><dd>意味</dd></dl></aside>',
    );
    expect(full).toContain(
      '<div class="ds-foot"><span>組織</span><span>1 / 1</span></div>',
    );
  });
});

describe("documentBody の組織名", () => {
  // 署名の組織名は資料に書いた値を優先し、空なら設定の組織名
  it("署名が無くても、設定の組織名があれば署名の行に出す", () => {
    expect(documentBody(doc([]), "○○株式会社")).toContain(
      '<div class="ds-page"><div class="ds-signature"><span>○○株式会社</span></div>',
    );
  });

  it("資料に組織名を書いてあればそちらを出し、空なら設定の組織名を出す", () => {
    const signed = (org: string): DocumentFile => ({
      ...doc([]),
      signature: { org, note: "設計書" },
    });
    expect(documentBody(signed("自組織"), "○○株式会社")).toContain(
      '<div class="ds-signature"><span>自組織</span><span>設計書</span></div>',
    );
    expect(documentBody(signed(""), "○○株式会社")).toContain(
      '<div class="ds-signature"><span>○○株式会社</span><span>設計書</span></div>',
    );
    expect(documentBody(signed(""))).toContain(
      '<div class="ds-signature"><span>設計書</span></div>',
    );
  });
});

// 資料の言語。既定(lang を渡さない)は今までどおり ja
describe("documentBody の言語", () => {
  const full: DocumentFile = {
    ...doc([{ id: "s1", heading: "セクション", level: 2, blocks: [] }]),
    toc: "auto",
    summary: { text: "結論" },
  };

  it("lang を渡さなければ今までどおり ja で描く", () => {
    const html = documentBody(full, undefined, new Map());
    expect(html).toContain(">目次<");
    expect(html).toContain(">要約<");
  });

  it("lang: en は画面の文言だけ英語にし、利用者の中身(見出し・要約の文)は訳さない", () => {
    const html = documentBody(full, undefined, new Map(), "en");
    expect(html).not.toContain("目次");
    expect(html).not.toContain("要約");
    expect(html).toContain(">Contents<");
    expect(html).toContain(">Summary<");
    // 利用者の中身はそのまま
    expect(html).toContain(">セクション<");
    expect(html).toContain(">結論<");
  });

  it("画像が見つからないときの文言も言語に合わせる", () => {
    const withImage = doc([
      {
        id: "s1",
        heading: "セクション",
        blocks: [
          {
            id: "b1",
            type: "image",
            props: { src: "assets/missing.jpg", alt: "alt" },
          },
        ],
      },
    ]);
    expect(documentBody(withImage)).toContain(
      "画像が見つからない: assets/missing.jpg",
    );
    expect(documentBody(withImage, undefined, new Map(), "en")).toContain(
      "Image not found: assets/missing.jpg",
    );
  });
});

describe("文書の見本", () => {
  // 見本は document.json から描く。手で直したり、描画を変えて design:build を忘れたら落ちる
  it("design/samples/document.html の本文と一致する", async () => {
    const path = fileURLToPath(
      new URL("../../design/samples/document.html", import.meta.url),
    );
    const html = await readFile(path, "utf8");
    const body = html.slice(
      html.indexOf("<body>\n") + "<body>\n".length,
      html.indexOf("\n</body>"),
    );
    expect(body).toBe(documentSampleBody());
  });

  it("見本の中身はスキーマを通る", () => {
    expect(
      checkDocument(JSON.parse(JSON.stringify(documentSample()))),
    ).toMatchObject({
      success: true,
    });
  });
});
