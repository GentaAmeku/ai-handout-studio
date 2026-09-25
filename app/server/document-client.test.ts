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
