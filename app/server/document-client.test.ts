// @vitest-environment node
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { DocumentFile } from "../src/schema/document.ts";
import { documentScript, documentScriptHash } from "./document-client.ts";
import { documentBody } from "./document-render.ts";

// HTML 資料に埋めるスクリプト。コードブロックの「コピー」を動かす。
// jsdom には execCommand が無いので、clipboard を渡さないとコードを選ぶ道に落ちる

const AT = "2026-09-20T00:00:00.000Z";

const doc: DocumentFile = {
  id: "doc_test",
  title: "手順",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "手順" },
  toc: "none",
  sections: [
    {
      id: "s1",
      heading: "動かす",
      blocks: [
        {
          id: "b1",
          type: "code",
          props: { text: "pnpm install\npnpm dev <port>", caption: "準備" },
        },
        { id: "b2", type: "code", props: { text: "pnpm test" } },
      ],
    },
  ],
};

// 埋め込みと同じ形で動かす。<\/ の逃がしだけ戻す。
// clipboard を渡すと成功の道、渡さないと選ぶ道を通る
const run = (copied?: string[], reject = false): Document => {
  const dom = new JSDOM(`<!doctype html><body>${documentBody(doc)}</body>`, {
    runScripts: "outside-only",
  });
  if (copied) {
    Object.defineProperty(dom.window.navigator, "clipboard", {
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return reject
            ? Promise.reject(new Error("denied"))
            : Promise.resolve();
        },
      },
    });
  }
  dom.window.eval(documentScript().replaceAll("<\\/", "</"));
  return dom.window.document;
};

const buttons = (page: Document): HTMLButtonElement[] =>
  Array.from(page.querySelectorAll<HTMLButtonElement>("[data-code-copy]"));

describe("HTML 資料のスクリプト", () => {
  it("描いた時点のボタンは隠れていて、スクリプトが動くと出る", () => {
    const before = new JSDOM(
      `<!doctype html><body>${documentBody(doc)}</body>`,
    );
    expect(
      Array.from(
        before.window.document.querySelectorAll<HTMLButtonElement>(
          "[data-code-copy]",
        ),
      ).map((button) => button.hidden),
    ).toEqual([true, true]);
    expect(buttons(run()).map((button) => button.hidden)).toEqual([
      false,
      false,
    ]);
  });

  it("押したコードブロックの中身だけを、逃がした文字を戻してコピーする", async () => {
    const copied: string[] = [];
    const page = run(copied);
    const [first, second] = buttons(page);
    first?.click();
    second?.click();
    expect(copied).toEqual(["pnpm install\npnpm dev <port>", "pnpm test"]);
    await Promise.resolve();
    // アイコンがチェックに替わり、読み上げとツールチップも替わる
    expect(first?.dataset.state).toBe("copied");
    expect(first?.title).toBe("コピーしました");
    expect(first?.textContent).toBe("コピーしました");
    expect(second?.dataset.state).toBe("copied");
  });

  it("どの道でもコピーできなければ、コードを選んで知らせる", async () => {
    const page = run([], true);
    const [first] = buttons(page);
    first?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first?.dataset.state).toBe("failed");
    expect(first?.title).toBe("選択しました。手でコピーしてください");
    expect(page.getSelection()?.toString()).toBe(
      "pnpm install\npnpm dev <port>",
    );
  });

  it("目次の無い資料では、読んでいる位置を付けない", () => {
    expect(run().querySelectorAll("[aria-current]").length).toBe(0);
  });
});

describe("読んでいる位置", () => {
  const chapters: DocumentFile = {
    ...doc,
    toc: "auto",
    sections: [
      { id: "s1", heading: "準備", level: 2, blocks: [] },
      { id: "s1-a", heading: "入れる", level: 3, blocks: [] },
      { id: "s2", heading: "動かす", level: 2, blocks: [] },
    ],
  };

  // jsdom は配置を持たないので、見出しの上端(画面の上からの距離)を渡してスクロールさせる
  const open = () => {
    const dom = new JSDOM(
      `<!doctype html><body>${documentBody(chapters)}</body>`,
      { runScripts: "outside-only" },
    );
    const page = dom.window.document;
    const tops = new Map<string, number>();
    for (const id of ["s1", "s1-a", "s2"]) {
      const target = page.getElementById(id);
      if (!target) throw new Error(id);
      target.getBoundingClientRect = () =>
        ({ top: tops.get(id) ?? 0 }) as DOMRect;
    }
    const scrollTo = (next: Record<string, number>) => {
      for (const [id, top] of Object.entries(next)) tops.set(id, top);
      dom.window.dispatchEvent(new dom.window.Event("scroll"));
    };
    scrollTo({ s1: 300, "s1-a": 900, s2: 1500 });
    dom.window.eval(documentScript().replaceAll("<\\/", "</"));
    const current = () =>
      Array.from(page.querySelectorAll(".ds-toc a[aria-current]")).map(
        (link) => [
          link.getAttribute("href"),
          link.getAttribute("aria-current"),
        ],
      );
    return { scrollTo, current };
  };

  it("読み始めは最初の章に付け、スクロールに合わせて章・節の目次のリンクへ移す", () => {
    const { scrollTo, current } = open();
    expect(current()).toEqual([["#s1", "location"]]);
    scrollTo({ s1: -400, "s1-a": 40, s2: 600 });
    expect(current()).toEqual([["#s1-a", "location"]]);
    scrollTo({ s1: -1200, "s1-a": -700, s2: 80 });
    expect(current()).toEqual([["#s2", "location"]]);
    scrollTo({ s1: 300, "s1-a": 900, s2: 1500 });
    expect(current()).toEqual([["#s1", "location"]]);
  });
});

describe("埋め込みの形", () => {
  it("指紋は埋める中身の sha256", () => {
    expect(documentScriptHash()).toBe(
      `'sha256-${createHash("sha256").update(documentScript()).digest("base64")}'`,
    );
    expect(documentScript()).not.toContain("</");
  });
});

describe("章ごとに読む", () => {
  const paged: DocumentFile = {
    ...doc,
    toc: "auto",
    paging: "chapter",
    head: { title: "手順", lede: "始めから終わりまで" },
    sections: [
      { id: "s1", heading: "準備", level: 2, blocks: [] },
      { id: "s1-a", heading: "入れる", level: 3, blocks: [] },
      { id: "s2", heading: "動かす", level: 2, blocks: [] },
      { id: "s3", heading: "片付ける", level: 2, blocks: [] },
    ],
  };

  // jsdom は配置も移動も持たないので、scrollTo と scrollIntoView は呼ばれた先だけを控える
  const open = (
    hash = "",
    body = documentBody(paged),
  ): {
    page: Document;
    go: (next: string) => void;
    scrolled: string[];
  } => {
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
      runScripts: "outside-only",
      url: `https://example.test/doc.html${hash}`,
    });
    const scrolled: string[] = [];
    dom.window.scrollTo = () => {
      scrolled.push("top");
    };
    dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(
      this: HTMLElement,
    ) {
      scrolled.push(this.id);
    };
    dom.window.eval(documentScript().replaceAll("<\\/", "</"));
    const go = (next: string) => {
      dom.window.location.hash = next;
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
    };
    return { page: dom.window.document, go, scrolled };
  };

  const hidden = (page: Document): string[] =>
    Array.from(page.querySelectorAll(".ds-main > section[data-paging-hidden]"))
      .map((section) => section.id)
      .sort();

  const pager = (page: Document): string[][] =>
    Array.from(page.querySelectorAll(".ds-pager a")).map((link) => [
      link.getAttribute("href") ?? "",
      link.textContent ?? "",
    ]);

  const currentChapter = (page: Document): (string | null)[] =>
    Array.from(
      page.querySelectorAll(".ds-toc > ol > li[data-current] > a"),
    ).map((link) => link.getAttribute("href"));

  it("開くと1章目だけを見せ、次へと、目次の上の「すべての章を表示」を置く", () => {
    const { page, scrolled } = open();
    const root = page.querySelector(".ds-page");
    expect(root?.hasAttribute("data-paging-active")).toBe(true);
    expect(root?.getAttribute("data-paging-index")).toBe("1");
    expect(hidden(page)).toEqual(["s2", "s3"]);
    expect(pager(page)).toEqual([["#s2", "次へ動かす"]]);
    expect(currentChapter(page)).toEqual(["#s1"]);
    const toggle = page.querySelector(".ds-toc > .ds-paging-toggle");
    expect(toggle?.textContent).toBe("すべての章を表示");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    // # の無いときは移らない
    expect(scrolled).toEqual([]);
  });

  it("#章 で章を切り替えて上端へ、#節 ならその節の章を開いて節へ移る", () => {
    const { page, go, scrolled } = open("#s3");
    expect(hidden(page)).toEqual(["s1", "s2"]);
    expect(
      page.querySelector(".ds-page")?.getAttribute("data-paging-index"),
    ).toBe("3");
    expect(pager(page)).toEqual([["#s2", "前へ動かす"]]);
    expect(scrolled).toEqual(["top"]);
    go("#s1-a");
    expect(hidden(page)).toEqual(["s2", "s3"]);
    expect(currentChapter(page)).toEqual(["#s1"]);
    expect(scrolled.at(-1)).toBe("s1-a");
    go("#s2");
    expect(hidden(page)).toEqual(["s1", "s3"]);
    expect(pager(page)).toEqual([
      ["#s1", "前へ準備"],
      ["#s3", "次へ片付ける"],
    ]);
  });

  it("「すべての章を表示」で全章を流し、もう一度押すと章ごとに戻る", () => {
    const { page } = open("#s2");
    const toggle = page.querySelector<HTMLButtonElement>(".ds-paging-toggle");
    toggle?.click();
    expect(hidden(page)).toEqual([]);
    expect(
      page.querySelector(".ds-page")?.hasAttribute("data-paging-active"),
    ).toBe(false);
    expect(page.querySelector<HTMLElement>(".ds-pager")?.hidden).toBe(true);
    expect(currentChapter(page)).toEqual([]);
    expect(toggle?.textContent).toBe("章ごとに表示");
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    toggle?.click();
    expect(hidden(page)).toEqual(["s1", "s3"]);
    expect(toggle?.textContent).toBe("すべての章を表示");
  });

  it("読んでいる位置は、表示している章の中だけで数える", () => {
    // jsdom では見出しの上端がどれも 0(線を越えている)。隠した章まで数えると最後の章に付く
    const { page } = open("#s2");
    expect(
      Array.from(page.querySelectorAll(".ds-toc a[aria-current]")).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["#s2"]);
  });

  it("目次が無ければ、切り替えは本文の上に置く", () => {
    const { page } = open("", documentBody({ ...paged, toc: "none" }));
    expect(
      page.querySelector(".ds-main > .ds-paging-toggle")?.textContent,
    ).toBe("すべての章を表示");
    expect(hidden(page)).toEqual(["s2", "s3"]);
  });

  it("paging の無い資料と、編集中のプレビュー(paging を切った描画)では何もしない", () => {
    for (const body of [
      documentBody({ ...paged, paging: undefined }),
      documentBody(paged, undefined, new Map(), "ja", false),
    ]) {
      const { page } = open("#s2", body);
      expect(page.querySelector(".ds-page")?.hasAttribute("data-paging")).toBe(
        false,
      );
      expect(hidden(page)).toEqual([]);
      expect(page.querySelector(".ds-pager")).toBe(null);
      expect(page.querySelector(".ds-paging-toggle")).toBe(null);
    }
  });

  it("文言は資料の言語で出る", () => {
    const { page } = open("", documentBody(paged, undefined, new Map(), "en"));
    expect(page.querySelector(".ds-paging-toggle")?.textContent).toBe(
      "Show all chapters",
    );
    expect(pager(page)).toEqual([["#s2", "Next動かす"]]);
  });
});

describe("表の列の幅", () => {
  const withTables = (headers: string[][]): DocumentFile => ({
    ...doc,
    sections: [
      {
        id: "s1",
        heading: "比べる",
        blocks: headers.map((row, index) => ({
          id: `t${index}`,
          type: "table" as const,
          props: { headers: row, rows: [row.map(() => "x")] },
        })),
      },
    ],
  });

  const open = (body: string): Document => {
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
      runScripts: "outside-only",
    });
    dom.window.eval(documentScript().replaceAll("<\\/", "</"));
    return dom.window.document;
  };

  const handles = (page: Document) =>
    Array.from(page.querySelectorAll<HTMLElement>("table.ds-table")).map(
      (table) =>
        Array.from(table.querySelectorAll("thead th")).map(
          (cell) => cell.querySelectorAll(".ds-col-resize").length,
        ),
    );

  it("列の境目ごとに取っ手を置く。1列の表には置かない", () => {
    const page = open(
      documentBody(withTables([["名前", "値", "備考"], ["項目"]])),
    );
    expect(handles(page)).toEqual([[1, 1, 0], [0]]);
    const handle = page.querySelector<HTMLElement>(".ds-col-resize");
    expect(handle?.getAttribute("role")).toBe("separator");
    expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle?.getAttribute("aria-label")).toBe("列の幅を変える");
    expect(handle?.tabIndex).toBe(0);
  });

  it("描いた時点では取っ手が無く、名前は資料の言語で出る", () => {
    const body = documentBody(
      withTables([["name", "value"]]),
      undefined,
      new Map(),
      "en",
    );
    expect(
      new JSDOM(body).window.document.querySelector(".ds-col-resize"),
    ).toBe(null);
    expect(
      open(body).querySelector(".ds-col-resize")?.getAttribute("aria-label"),
    ).toBe("Resize column");
  });
});
