// @vitest-environment node
// 図の生成器(design/figure/render.mjs)をファイルから読むので node で回す
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "../../../design/figure/render.mjs";
import { documentSample } from "../../server/document-sample";
import {
  checkDocument,
  checkDocumentBody,
  DOCUMENT_BODY_DEPTH_LIMIT,
  DOCUMENT_BODY_LIMIT,
} from "./document";

const ok = '<div class="ds-page"><h1>題</h1><p class="ds-lede">本文</p></div>';

describe("checkDocumentBody", () => {
  it(".ds-* の部品だけで組んだ断片を通す", () => {
    expect(checkDocumentBody(ok)).toEqual({ success: true });
    expect(
      checkDocumentBody('<figure class="ds-figure"><svg><g/></svg></figure>'),
    ).toEqual({ success: true });
    // 画像は本文に埋め込む
    expect(
      checkDocumentBody('<img src="data:image/png;base64,AA" alt="">'),
    ).toEqual({ success: true });
    // 表・リスト・強調・コード・外へのリンク
    expect(
      checkDocumentBody(
        [
          '<table class="ds-table"><thead><tr><th scope="col">項目</th></tr></thead>',
          '<tbody><tr><td colspan="2">値</td></tr></tbody></table>',
          '<ul class="ds-list"><li><strong>要点</strong>と<em>補足</em></li></ul>',
          '<pre class="ds-code"><code>pnpm test</code></pre>',
          '<p><a href="https://example.com/a?b=1&amp;c=2">外</a>',
          '<a href="#s01">中</a><a href="mailto:a@example.com">便</a></p>',
          '<h2 id="s01" aria-label="見出し" title="題">節</h2>',
        ].join(""),
      ),
    ).toEqual({ success: true });
  });

  it("図の形・矢印・切り抜き・動きと、埋め込んだ画像を通す", () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50" role="img" aria-label="図" font-family="\'Noto Sans JP\',sans-serif">',
      '<defs><marker id="f1-head" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><polygon points="0 0, 8 4, 0 8" fill="#333"/></marker>',
      '<clipPath id="f1-clip"><rect width="10" height="10"/></clipPath></defs>',
      "<title>図</title>",
      '<g class="ds-node"><rect x="1" y="1" width="20" height="10" rx="4" fill="none" stroke="#999" stroke-width="1"/>',
      '<text x="10" y="8" text-anchor="middle" font-size="12" clip-path="url(#f1-clip)"><tspan>文字</tspan></text></g>',
      '<line class="ds-link" x1="0" y1="0" x2="10" y2="10" marker-end="url(#f1-head)"/>',
      '<path d="M0 0 L10 10" stroke-dasharray="4 2"><animate attributeName="stroke-dashoffset" values="6;0" dur="1s" repeatCount="indefinite"/></path>',
      '<circle cx="5" cy="5" r="2"><animateMotion path="M0 0 L10 0" dur="2s" repeatCount="indefinite" calcMode="linear"/></circle>',
      '<image href="data:image/jpeg;base64,AA" width="10" height="10"/>',
      "</svg>",
    ].join("");
    expect(checkDocumentBody(svg)).toEqual({ success: true });
  });

  it("図の生成器の出力を通す", () => {
    const dir = fileURLToPath(
      new URL("../../../design/figure/examples/", import.meta.url),
    );
    const inputs = readdirSync(dir)
      .filter((name) => name.endsWith(".json") && name !== "broken.json")
      .map((name) => JSON.parse(readFileSync(`${dir}${name}`, "utf8")));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      for (const lang of ["ja", "en"] as const) {
        expect(checkDocumentBody(render(input, lang).svg)).toEqual({
          success: true,
        });
      }
    }
  });

  it("見本の文書を通す", () => {
    for (const lang of ["ja", "en"] as const) {
      expect(checkDocument(documentSample(lang)).success).toBe(true);
    }
  });

  const rejected = (html: string): string => {
    const result = checkDocumentBody(html);
    return result.success ? "" : result.message;
  };

  it("ページの枠・スクリプト・入力部品は拒む", () => {
    expect(rejected("")).toContain("空");
    expect(rejected("<html><body>x</body></html>")).toContain("<html>");
    expect(rejected("<style>p{color:red}</style>")).toContain("<style>");
    expect(rejected('<script src="x.js"></script>')).toContain("<script>");
    expect(rejected('<button type="button">送信</button>')).toContain(
      "<button>",
    );
    expect(rejected("<svg><script>x()</script></svg>")).toContain("<script>");
    expect(rejected("<svg><foreignObject></foreignObject></svg>")).toContain(
      "<foreignObject>",
    );
    expect(rejected("<math><mi>x</mi></math>")).toContain("<math>");
  });

  it("外への参照と、部品の外の class を拒む", () => {
    expect(rejected('<p onclick="x()">a</p>')).toContain("on…");
    expect(rejected('<a href="javascript:x()">a</a>')).toContain("javascript:");
    expect(rejected('<img src="https://example.com/a.png" alt="">')).toContain(
      "data:",
    );
    expect(rejected('<p class="lede">a</p>')).toContain("lede");
    expect(rejected('<p class="ds-lede fancy">a</p>')).toContain("fancy");
  });

  // 禁止リストの検査を、試してすり抜けた書き方(plans/share.md §8.1)
  it.each([
    ["<svg/onload=alert(1)>", "on…"],
    ["<details/open/ontoggle=alert(1)>", "on…"],
    ["<a href='javascript:alert(1)'>a</a>", "javascript:"],
    ["<a href=javascript:alert(1)>a</a>", "javascript:"],
    ['<a href="java&#115;cript:alert(1)">a</a>', "javascript:"],
    ['<svg><image href="https://example.com/a.png"/></svg>', "data:"],
    ['<img srcset="https://example.com/a.png 1x" alt="">', "srcset"],
    ['<div style="background:url(https://example.com/a.png)">a</div>', "style"],
    ["<img src='https://example.com/a.png' alt=''>", "data:"],
    ['<video poster="https://example.com/a.png"></video>', "<video>"],
    ["<p>a</p><!-- 公開先では読める -->", "コメント"],
  ])("すり抜けていた %s を拒む", (html, message) => {
    expect(rejected(html)).toContain(message);
  });

  it("外へのリンクと、その外の行き先・画像の形式を見分ける", () => {
    expect(rejected('<a href="https://example.com/">a</a>')).toBe("");
    expect(rejected('<a href="http://example.com/">a</a>')).toBe("");
    expect(rejected('<a href=" https://example.com/">a</a>')).toBe("");
    expect(rejected('<a href="//example.com/">a</a>')).toContain("https:");
    expect(rejected('<a href="data:text/html,x">a</a>')).toContain("https:");
    expect(rejected('<a href="java\tscript:x()">a</a>')).toContain("https:");
    expect(
      rejected('<svg><a href="javascript:x()"><text>a</text></a></svg>'),
    ).toContain("https:");
    expect(
      rejected('<img src="data:image/svg+xml;base64,AA" alt="">'),
    ).toContain("svg+xml");
    expect(
      rejected('<svg><image href="data:image/svg+xml,<svg/>"/></svg>'),
    ).toContain("svg+xml");
    expect(rejected('<img src="data:image/webp;base64,AA" alt="">')).toBe("");
    expect(
      rejected('<svg><image xlink:href="https://example.com/a.png"/></svg>'),
    ).toContain("xlink:href");
    expect(rejected('<p src="data:image/png;base64,AA">a</p>')).toContain(
      "src",
    );
  });

  it("図の属性から外を読む書き方を拒む", () => {
    expect(
      rejected('<svg><rect fill="url(https://example.com/p.svg#a)"/></svg>'),
    ).toContain("url()");
    expect(rejected('<svg><rect fill="u\\72l(https://x)"/></svg>')).toContain(
      "\\",
    );
    expect(
      rejected(
        '<svg><a href="#a"><animate attributeName="href" values="javascript:x()"/><text>a</text></a></svg>',
      ),
    ).toContain("href");
    expect(
      rejected('<svg><use href="https://example.com/a.svg#x"/></svg>'),
    ).toContain("<use>");
    expect(
      rejected('<svg><g href="https://example.com/"></g></svg>'),
    ).toContain("#id");
  });

  it("閉じていないタグや引用符で終わる本文を拒む", () => {
    expect(rejected('<p><img alt="a')).toContain("閉じていない");
    expect(rejected("<p>a</p><img")).toContain("閉じていない");
    expect(rejected('<svg viewBox="0 0 1 1"><g></g>')).toContain("</svg>");
  });

  it("深い入れ子でも落ちずに判定する", () => {
    // 上限までは通し、超えたら解析の途中で止めて拒む(解析の時間は深さの2乗で伸びるので、待たずに返す)
    expect(rejected(`${"<div>".repeat(DOCUMENT_BODY_DEPTH_LIMIT)}a`)).toBe("");
    expect(
      rejected(`${"<div>".repeat(DOCUMENT_BODY_DEPTH_LIMIT + 1)}a`),
    ).toContain("入れ子が深すぎる");
    expect(rejected(`${"<div>".repeat(20_000)}a`)).toContain(
      "入れ子が深すぎる",
    );
    expect(rejected(`<svg>${"<g>".repeat(20_000)}</svg>`)).toContain(
      "入れ子が深すぎる",
    );
    // 深くない要素は、何万あっても通す
    expect(rejected(`<p>${"<br>".repeat(200_000)}</p>`)).toBe("");
  });

  it("大きすぎる本文は拒む", () => {
    expect(rejected(`${ok}${"あ".repeat(DOCUMENT_BODY_LIMIT)}`)).toContain(
      "大きすぎる",
    );
  });
});

const AT = "2026-09-20T00:00:00.000Z";

const documentOf = (sections: unknown) => ({
  id: "doc_20260920_001",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "題" },
  toc: "auto",
  sections,
});

const rejectedDocument = (input: unknown): string => {
  const result = checkDocument(input);
  return result.success ? "" : result.message;
};

describe("checkDocument", () => {
  it("セクションとブロックの並びを読む", () => {
    const result = checkDocument(
      documentOf([
        {
          id: "s01",
          heading: "決まったこと",
          level: 2,
          blocks: [
            { id: "b01", type: "text", props: { text: "本文" } },
            {
              id: "b02",
              type: "notice",
              props: { kind: "warning", text: "条件" },
            },
          ],
        },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("知らないキーと知らないブロックは拒む", () => {
    expect(rejectedDocument({ ...documentOf([]), width: 800 })).toContain(
      "width",
    );
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "text",
                props: { text: "本文", color: "#fff" },
              },
            ],
          },
        ]),
      ),
    ).toContain("color");
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [{ id: "b01", type: "chart", props: {} }],
          },
        ]),
      ),
    ).not.toBe("");
  });

  it("図と html の中身は本文と同じ検査を通す", () => {
    expect(
      checkDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "figure",
                props: { html: '<svg class="ds-node"></svg>' },
              },
            ],
          },
        ]),
      ).success,
    ).toBe(true);
    expect(
      rejectedDocument(
        documentOf([
          {
            id: "s01",
            heading: "セクション",
            blocks: [
              {
                id: "b01",
                type: "html",
                props: { html: '<p class="lede">a</p>' },
              },
            ],
          },
        ]),
      ),
    ).toContain("lede");
  });

  it("id の重複は拒む", () => {
    expect(
      rejectedDocument(
        documentOf([
          { id: "s01", heading: "セクション", blocks: [] },
          { id: "s01", heading: "別のセクション", blocks: [] },
        ]),
      ),
    ).toContain("重複");
  });
});
