// @vitest-environment node
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { SheetAnswers, SheetDocument } from "../src/schema/sheet.ts";
import { sheetScript, sheetScriptHash } from "./sheet-client.ts";
import { sheetBody, sheetView } from "./sheet-render.ts";

// 保存した質問票に埋めるスクリプト。jsdom には clipboard も execCommand も無いので、
// 「回答をコピー」は手で選ぶ欄に落ちる。その中身で Markdown の形を確かめる

const doc: SheetDocument = {
  schemaVersion: 1,
  id: "demo",
  revision: "2",
  title: "配布の進め方を決める",
  questions: [
    {
      id: "where",
      title: "どこに置くか",
      type: "single",
      options: [
        { id: "studio", label: "ai-handout-studio に保存する" },
        { id: "tmp", label: "一時フォルダに置く" },
      ],
      fields: [{ id: "when", label: "いつまでに" }],
    },
    {
      id: "checks",
      title: "何を確かめるか",
      type: "multiple",
      options: [
        { id: "look", label: "見た目" },
        { id: "export", label: "書き出し" },
      ],
    },
    { id: "free", title: "ほかに気になること", type: "text" },
  ],
};

// 案の画像(images visual)を1つ足した質問票。src は data: を直に書く(通常は保存の
// ときに assets/ の相対パスから埋め込まれるが、ここは描画・スクリプトの検査だけなので済ます)
const docWithImages: SheetDocument = {
  ...doc,
  questions: [
    ...doc.questions,
    {
      id: "look",
      title: "見た目はどちらにしますか",
      type: "single",
      options: [
        { id: "a", label: "案A" },
        { id: "b", label: "案B" },
      ],
      visual: {
        type: "images",
        caption: "イメージ",
        items: [
          { src: "data:image/png;base64,AAAA", label: "案A", alt: "案Aの画面" },
        ],
      },
    },
  ],
};

const answers: SheetAnswers = {
  schemaVersion: 1,
  documentId: "demo",
  revision: "2",
  answers: [
    {
      id: "where",
      selected: ["studio"],
      text: "ai-handout-studio に保存する",
      fields: { when: "今日中" },
      reviewed: true,
    },
    {
      id: "checks",
      selected: ["look", "export"],
      text: "書き出しは PDF も見る",
      reviewed: true,
    },
  ],
};

// 埋め込みと同じ形で動かす。<\/ の逃がしだけ戻す。
// clipboard を渡すと成功の道、渡さないと手で選ぶ欄に落ちる道を通る
const run = (copied?: string[]): Document => {
  const dom = new JSDOM(
    `<!doctype html><body>${sheetBody(sheetView(doc, answers), "focus", true)}</body>`,
    { runScripts: "outside-only" },
  );
  if (copied) {
    Object.defineProperty(dom.window.navigator, "clipboard", {
      value: {
        writeText: (text: string) => {
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
  }
  dom.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
  return dom.window.document;
};

// 開き直しを真似る。localStorage を使えるオリジンで描き、前のページの中身を写してからスクリプトを動かす。
// run() は url を渡さないので localStorage に触れると落ちるページになり、残せないときの道を通る
const open = (body: string, from?: Storage): JSDOM => {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  const keys = from
    ? Array.from({ length: from.length }, (_, index) => from.key(index))
    : [];
  keys.forEach((key) => {
    if (key && from)
      dom.window.localStorage.setItem(key, from.getItem(key) ?? "");
  });
  dom.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
  return dom;
};

// 画像の拡大の検査に使う。jsdom は <dialog> の showModal/close を実装していないので、
// open 属性の出し入れと close イベントだけの最小限で補う(deck-list の検査と同じやり方)
const runImages = (base: "focus" | "all" | "print" = "focus"): JSDOM => {
  const dom = new JSDOM(
    `<!doctype html><body>${sheetBody(sheetView(docWithImages, undefined), base, true)}</body>`,
    { runScripts: "outside-only" },
  );
  dom.window.HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
  ) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
  dom.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
  return dom;
};

const pick = <T extends Element>(page: Document, selector: string): T => {
  const found = page.querySelector<T>(selector);
  if (!found) throw new Error(`見つからない: ${selector}`);
  return found;
};

const copied = (page: Document): string => {
  pick<HTMLButtonElement>(page, "[data-copy]").click();
  return pick<HTMLTextAreaElement>(page, "[data-copy-text]").value;
};

describe("質問票のスクリプト", () => {
  it("回答を質問票スキルと同じ形の Markdown にまとめる", () => {
    const text = copied(run());
    expect(text).toContain("# 配布の進め方を決める");
    expect(text).toContain("質問群: demo / 版: 2");
    // 単一回答は回答文が正本
    expect(text).toContain(
      "## どこに置くか (where)\n回答: ai-handout-studio に保存する\nいつまでに: 今日中",
    );
    // 複数選択は選んだ項目名を並べ、自由記入は補足に回す
    expect(text).toContain(
      "## 何を確かめるか (checks)\n回答: 見た目 / 書き出し\n補足: 書き出しは PDF も見る",
    );
    // 答えていない質問も落とさない
    expect(text).toContain("## ほかに気になること (free)\n回答: (未記入)");
  });

  it("画面で直した回答を拾う", () => {
    const page = run();
    pick<HTMLTextAreaElement>(page, '[data-question="0"] [data-note]').value =
      "studio に保存して、書き出しも試す";
    pick<HTMLInputElement>(
      page,
      'input[name="checks"][value="export"]',
    ).checked = false;
    expect(copied(page)).toContain(
      "## どこに置くか (where)\n回答: studio に保存して、書き出しも試す",
    );
    expect(copied(page)).toContain("## 何を確かめるか (checks)\n回答: 見た目");
  });

  it("何も入っていない質問票で選択肢を選ぶと、回答文に入ってコピーに出る", () => {
    const blank = new JSDOM(
      `<!doctype html><body>${sheetBody(sheetView({ ...doc, questions: doc.questions.map((q) => (q.id === "where" ? { ...q, recommended: ["studio"] } : q)) }, undefined), "focus", true)}</body>`,
      { runScripts: "outside-only" },
    );
    blank.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
    const page = blank.window.document;
    const radio = pick<HTMLInputElement>(
      page,
      'input[name="where"][value="tmp"]',
    );
    radio.checked = true;
    radio.dispatchEvent(new blank.window.Event("change"));
    expect(
      pick<HTMLTextAreaElement>(page, '[data-question="0"] [data-note]').value,
    ).toBe("一時フォルダに置く");
    const recommended = pick<HTMLInputElement>(
      page,
      'input[name="where"][value="studio"]',
    );
    recommended.checked = true;
    recommended.dispatchEvent(new blank.window.Event("change"));
    expect(copied(page)).toContain(
      "## どこに置くか (where)\n回答: ai-handout-studio に保存する（推奨）",
    );
  });

  it("label の末尾に (推奨) を書いた推奨の選択肢を選んでも、回答文の（推奨）は1回だけ", () => {
    const blank = new JSDOM(
      `<!doctype html><body>${sheetBody(
        sheetView(
          {
            ...doc,
            questions: doc.questions.map((q) =>
              q.id === "where"
                ? {
                    ...q,
                    options: [
                      {
                        id: "studio",
                        label: "ai-handout-studio に保存する(推奨)",
                      },
                      { id: "tmp", label: "一時フォルダに置く" },
                    ],
                    recommended: ["studio"],
                  }
                : q,
            ),
          },
          undefined,
        ),
        "focus",
        true,
      )}</body>`,
      { runScripts: "outside-only" },
    );
    blank.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
    const page = blank.window.document;
    const recommended = pick<HTMLInputElement>(
      page,
      'input[name="where"][value="studio"]',
    );
    recommended.checked = true;
    recommended.dispatchEvent(new blank.window.Event("change"));
    expect(
      pick<HTMLTextAreaElement>(page, '[data-question="0"] [data-note]').value,
    ).toBe("ai-handout-studio に保存する(推奨)");
  });

  it("答えると、質問一覧の状態と入力済みの数が変わる", () => {
    const blank = new JSDOM(
      `<!doctype html><body>${sheetBody(sheetView(doc, undefined), "focus", true)}</body>`,
      { runScripts: "outside-only" },
    );
    blank.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
    const page = blank.window.document;
    const status = (index: number): string =>
      pick(page, `[data-go="${index}"] .ds-status`).textContent ?? "";
    const counts = (): string[] =>
      Array.from(page.querySelectorAll("[data-done-count]")).map(
        (node) => node.textContent ?? "",
      );
    expect(status(0)).toBe("未入力");
    expect(counts()).toEqual(["0", "0"]);
    const radio = pick<HTMLInputElement>(
      page,
      'input[name="where"][value="tmp"]',
    );
    radio.checked = true;
    radio.dispatchEvent(new blank.window.Event("change", { bubbles: true }));
    expect(status(0)).toBe("✓ 入力済み");
    expect(counts()).toEqual(["1", "1"]);
    const free = pick<HTMLTextAreaElement>(
      page,
      '[data-question="2"] [data-note]',
    );
    free.value = "特になし";
    free.dispatchEvent(new blank.window.Event("input", { bubbles: true }));
    expect(status(2)).toBe("✓ 入力済み");
    expect(counts()).toEqual(["2", "2"]);
    free.value = "";
    free.dispatchEvent(new blank.window.Event("input", { bubbles: true }));
    expect(status(2)).toBe("未入力");
    expect(counts()).toEqual(["1", "1"]);
  });

  it("回答文を消しても、選んだ項目名で補う", () => {
    const page = run();
    pick<HTMLTextAreaElement>(page, '[data-question="0"] [data-note]').value =
      "";
    expect(copied(page)).toContain(
      "## どこに置くか (where)\n回答: ai-handout-studio に保存する",
    );
  });

  it("最後の質問では、次へのところに回答をコピーが出る", () => {
    const page = run();
    const next = pick<HTMLButtonElement>(page, '[data-move="next"]');
    const end = pick<HTMLButtonElement>(page, "[data-at-end]");
    expect(next.hidden).toBe(false);
    expect(end.hidden).toBe(true);
    next.click();
    expect(end.hidden).toBe(true);
    next.click();
    // 3問目(最後)まで進んだら入れ替わる
    expect(next.hidden).toBe(true);
    expect(end.hidden).toBe(false);
    pick<HTMLButtonElement>(page, '[data-move="prev"]').click();
    expect(next.hidden).toBe(false);
    expect(end.hidden).toBe(true);
  });

  it("コピーできたら、押したボタンの文字で知らせる", async () => {
    const clipboard: string[] = [];
    const page = run(clipboard);
    const button = pick<HTMLButtonElement>(page, "[data-at-end]");
    button.click();
    await Promise.resolve();
    expect(clipboard[0]).toContain("# 配布の進め方を決める");
    expect(button.textContent).toBe("コピーしました");
    // 帯は3つの列で組むので、出る要素は 前へ・進み具合・右端のボタン の3つに保つ。
    // 吹き出しは浮かせて列を取らない
    const shown = Array.from(pick(page, ".ds-page-navigation").children).filter(
      (node) =>
        !node.hasAttribute("hidden") && !node.hasAttribute("data-copy-status"),
    );
    expect(shown.length).toBe(3);
    expect(page.querySelector("[data-copy-text]")).toBe(null);
  });

  it("コピーの結果は画面下の帯の吹き出しに出し、見出しの帯には出さない", async () => {
    const page = run([]);
    pick<HTMLButtonElement>(page, "[data-at-end]").click();
    await Promise.resolve();
    const tip = pick(page, ".ds-page-navigation > [data-copy-status]");
    expect(tip.classList.contains("ds-copy-tip")).toBe(true);
    expect(tip.textContent).toMatch(/^✓ コピーしました\(\d+ 行\)。/);
    expect(page.querySelector(".ds-board-heading [data-copy-status]")).toBe(
      null,
    );
  });

  // clipboard が無い(http のスマホ)か断られた(許可が denied)ときの道
  const legacy = (
    works: boolean,
    clipboard?: "reject",
  ): { page: Document; copied: string[] } => {
    const dom = new JSDOM(
      `<!doctype html><body>${sheetBody(sheetView(doc, answers), "focus", true)}</body>`,
      { runScripts: "outside-only" },
    );
    const copied: string[] = [];
    const page = dom.window.document;
    Object.defineProperty(page, "execCommand", {
      value: (command: string) => {
        // 呼ばれた時点で、画面に出さない欄の中身が全部選ばれているか
        const area =
          page.querySelector<HTMLTextAreaElement>("textarea[readonly]");
        if (
          command === "copy" &&
          area &&
          area.selectionEnd === area.value.length
        )
          copied.push(area.value);
        return works;
      },
    });
    if (clipboard) {
      Object.defineProperty(dom.window.navigator, "clipboard", {
        value: {
          writeText: () => Promise.reject(new Error("NotAllowedError")),
        },
      });
    }
    dom.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
    return { page, copied };
  };

  const status = (page: Document): string =>
    pick(page, "[data-copy-status]").textContent ?? "";

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  for (const clipboard of [undefined, "reject"] as const) {
    const way = clipboard ? "clipboard が断られても" : "clipboard が無くても";

    it(`${way}、execCommand でコピーできれば成功と伝える`, async () => {
      const { page, copied } = legacy(true, clipboard);
      const button = pick<HTMLButtonElement>(page, "[data-at-end]");
      button.click();
      await settle();
      expect(copied[0]).toContain("# 配布の進め方を決める");
      const lines = (copied[0] ?? "").split("\n").length;
      expect(status(page)).toBe(
        `✓ コピーしました(${lines} 行)。会話に貼り付けてください。`,
      );
      expect(button.textContent).toBe("コピーしました");
      // 選ぶための欄は片づき、手で写す欄も保存のリンクも出ない
      expect(page.querySelectorAll("textarea[readonly]").length).toBe(0);
      expect(page.querySelector("[data-copy-text]")).toBe(null);
      expect(page.querySelector("[data-download]")).toBe(null);
    });

    it(`${way}、execCommand も効かなければ欄とファイルで保存を出す`, async () => {
      const { page } = legacy(false, clipboard);
      pick<HTMLButtonElement>(page, "[data-copy]").click();
      await settle();
      expect(status(page)).toBe(
        "コピーできませんでした。下の欄から写してください。",
      );
      // 欄は画面下の帯のすぐ後ろに置き、見出しの帯には入れない
      const box = pick(page, ".ds-page-navigation + [data-copy-fallback]");
      expect(box.querySelector("p")?.textContent).toBe(
        "コピーできませんでした。下の欄を長押しして「すべて選択」→「コピー」してください。",
      );
      expect(page.querySelector(".ds-board-heading [data-copy-text]")).toBe(
        null,
      );
      const area = pick<HTMLTextAreaElement>(page, "[data-copy-text]");
      expect(area.value).toContain("# 配布の進め方を決める");
      expect(area.hasAttribute("readonly")).toBe(false);
      expect(area.rows).toBe(6);
      const link = pick<HTMLAnchorElement>(page, "[data-download]");
      expect(link.textContent).toBe("ファイルで保存");
      expect(link.getAttribute("download")).toBe("answers-demo.md");
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("data:text/markdown;charset=utf-8,")).toBe(true);
      expect(decodeURIComponent(href.split(",").slice(1).join(","))).toBe(
        area.value,
      );
      // 2度押しても欄とリンクは1つずつ
      pick<HTMLButtonElement>(page, "[data-copy]").click();
      await settle();
      expect(page.querySelectorAll("[data-copy-text]").length).toBe(1);
      expect(page.querySelectorAll("[data-download]").length).toBe(1);
    });
  }

  it("1問ずつは質問一覧を開いて始まり、閉じる・開くで開閉する", () => {
    const page = run();
    const sidebar = pick<HTMLElement>(page, "#question-sidebar");
    const toggle = pick<HTMLButtonElement>(page, ".ds-sidebar-toggle");
    const layout = pick(page, ".ds-board-layout");
    expect(sidebar.hidden).toBe(false);
    expect(layout.classList.contains("ds-sidebar-collapsed")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("質問一覧を閉じる");
    toggle.click();
    expect(sidebar.hidden).toBe(true);
    expect(layout.classList.contains("ds-sidebar-collapsed")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("質問一覧を開く");
    toggle.click();
    expect(sidebar.hidden).toBe(false);
    expect(toggle.textContent).toBe("質問一覧を閉じる");
  });

  it("overview は1問ずつと同じに描く", () => {
    const view = sheetView(doc, answers);
    for (const interactive of [true, false]) {
      expect(sheetBody(view, "overview", interactive)).toBe(
        sheetBody(view, "focus", interactive),
      );
    }
  });

  it("入力は開き直しても残り、見ていた質問も戻る", () => {
    const body = sheetBody(sheetView(doc, undefined), "focus", true);
    const first = open(body);
    const page = first.window.document;
    const radio = pick<HTMLInputElement>(
      page,
      'input[name="where"][value="tmp"]',
    );
    radio.checked = true;
    radio.dispatchEvent(new first.window.Event("change", { bubbles: true }));
    const when = pick<HTMLInputElement>(page, '[data-field="when"]');
    when.value = "明日";
    when.dispatchEvent(new first.window.Event("input", { bubbles: true }));
    pick<HTMLButtonElement>(page, '[data-move="next"]').click();
    const look = pick<HTMLInputElement>(
      page,
      'input[name="checks"][value="look"]',
    );
    look.checked = true;
    look.dispatchEvent(new first.window.Event("change", { bubbles: true }));

    const again = open(body, first.window.localStorage).window.document;
    expect(
      pick<HTMLInputElement>(again, 'input[name="where"][value="tmp"]').checked,
    ).toBe(true);
    expect(
      pick<HTMLTextAreaElement>(again, '[data-question="0"] [data-note]').value,
    ).toBe("一時フォルダに置く");
    expect(pick<HTMLInputElement>(again, '[data-field="when"]').value).toBe(
      "明日",
    );
    expect(
      pick<HTMLInputElement>(again, 'input[name="checks"][value="look"]')
        .checked,
    ).toBe(true);
    expect(pick<HTMLElement>(again, '[data-question="1"]').hidden).toBe(false);
    expect(pick(again, "[data-progress]").textContent).toBe("質問 2 / 3");
    // 質問一覧の状態と入力済みの数も、戻した入力で数え直す
    expect(pick(again, '[data-go="1"] .ds-status').textContent).toBe(
      "✓ 入力済み",
    );
    expect(copied(again)).toContain(
      "## どこに置くか (where)\n回答: 一時フォルダに置く\nいつまでに: 明日",
    );
  });

  it("残した入力は記録した回答より優先し、版が変わったら戻さない", () => {
    const body = sheetBody(sheetView(doc, answers), "focus", true);
    const first = open(body);
    const note = pick<HTMLTextAreaElement>(
      first.window.document,
      '[data-question="0"] [data-note]',
    );
    note.value = "やはり一時フォルダに置く";
    note.dispatchEvent(new first.window.Event("input", { bubbles: true }));
    const stored = first.window.localStorage;

    const same = open(body, stored).window.document;
    expect(
      pick<HTMLTextAreaElement>(same, '[data-question="0"] [data-note]').value,
    ).toBe("やはり一時フォルダに置く");

    const revised = open(
      sheetBody(sheetView({ ...doc, revision: "3" }, undefined), "focus", true),
      stored,
    ).window.document;
    expect(
      pick<HTMLTextAreaElement>(revised, '[data-question="0"] [data-note]')
        .value,
    ).toBe("");
  });

  it("全問を並べる形では、開き直しても質問を隠さない", () => {
    const body = sheetBody(sheetView(doc, undefined), "all", true);
    const first = open(body);
    const free = pick<HTMLTextAreaElement>(
      first.window.document,
      '[data-question="2"] [data-note]',
    );
    free.value = "特になし";
    free.dispatchEvent(new first.window.Event("input", { bubbles: true }));

    const again = open(body, first.window.localStorage).window.document;
    expect(
      Array.from(again.querySelectorAll<HTMLElement>("[data-question]")).map(
        (section) => section.hidden,
      ),
    ).toEqual([false, false, false]);
    expect(
      pick<HTMLTextAreaElement>(again, '[data-question="2"] [data-note]').value,
    ).toBe("特になし");
  });

  it("前へ・次へで質問が移る", () => {
    const page = run();
    const first = pick<HTMLElement>(page, '[data-question="0"]');
    const second = pick<HTMLElement>(page, '[data-question="1"]');
    expect(first.hidden).toBe(false);
    pick<HTMLButtonElement>(page, '[data-move="next"]').click();
    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(false);
    expect(pick(page, "[data-progress]").textContent).toBe("質問 2 / 3");
  });

  describe("共有用の束", () => {
    it("sheetBody の share=true で <main> に data-share の印が付く", () => {
      expect(sheetBody(sheetView(doc, answers), "focus", true, true)).toContain(
        'data-share=""',
      );
      // 通常の保存(share を渡さない)には付かない
      expect(sheetBody(sheetView(doc, answers), "focus", true)).not.toContain(
        "data-share",
      );
    });

    it("コピーに失敗しても、束では「ファイルで保存」を出さない(手で写す欄だけ)", async () => {
      const dom = new JSDOM(
        `<!doctype html><body>${sheetBody(sheetView(doc, answers), "focus", true, true)}</body>`,
        { runScripts: "outside-only" },
      );
      const page = dom.window.document;
      // clipboard も execCommand も無い(コピーできないブラウザを装う)
      Object.defineProperty(page, "execCommand", { value: undefined });
      dom.window.eval(sheetScript("ja").replaceAll("<\\/", "</"));
      pick<HTMLButtonElement>(page, "[data-copy]").click();
      await settle();
      expect(status(page)).toBe(
        "コピーできませんでした。下の欄から写してください。",
      );
      const area = pick<HTMLTextAreaElement>(page, "[data-copy-text]");
      expect(area.value).toContain("# 配布の進め方を決める");
      expect(page.querySelector("[data-download]")).toBe(null);
    });
  });

  describe("画面の文言の言語", () => {
    it("英語の資料は英語のボタン・見出し・Markdown の言い回しになる", async () => {
      const enDoc = { ...doc, lang: "en" as const };
      const dom = new JSDOM(
        `<!doctype html><body>${sheetBody(sheetView(enDoc, answers, 0, "en"), "focus", true)}</body>`,
        { runScripts: "outside-only" },
      );
      const page = dom.window.document;
      dom.window.eval(sheetScript("en").replaceAll("<\\/", "</"));
      expect(pick(page, ".ds-sidebar-toggle").textContent).toBe(
        "Close question list",
      );
      const text = copied(page);
      expect(text).toContain(`# ${enDoc.title}`);
      expect(text).toContain("Question set: demo / rev: 2");
      expect(text).toContain("Answer: ");
      expect(text).not.toContain("質問群");
      expect(text).not.toContain("回答:");
    });

    it("言語ごとにスクリプトの指紋(CSP の hash)が違う", () => {
      expect(sheetScriptHash("ja")).not.toBe(sheetScriptHash("en"));
      expect(sheetScriptHash("ja")).toBe(sheetScriptHash("ja"));
    });
  });
});

describe("案の画像の拡大", () => {
  it("押すと <dialog> に同じ画像を1枚だけ出す", () => {
    const dom = runImages();
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    expect(img.getAttribute("role")).toBe("button");
    expect(img.tabIndex).toBe(0);
    img.click();
    const dialog = pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    const zoomed = pick<HTMLImageElement>(page, ".ds-image-zoom-img");
    expect(zoomed.src).toBe(img.src);
    // ページ全体に同じ画像がもう1枚(拡大の分)だけ増えている。二重に埋め込んではいない
    expect(page.querySelectorAll(`img[src="${img.src}"]`).length).toBe(2);
  });

  it("Tab で選んで Enter でも開ける", () => {
    const dom = runImages();
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    img.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(
      pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog").hasAttribute(
        "open",
      ),
    ).toBe(true);
  });

  it("閉じるボタンで閉じ、フォーカスが元の画像に戻る", () => {
    const dom = runImages();
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    img.click();
    const dialog = pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog");
    pick<HTMLButtonElement>(page, ".ds-image-zoom-dialog button").click();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(page.activeElement).toBe(img);
  });

  it("Esc で閉じ、フォーカスが元の画像に戻る", () => {
    const dom = runImages();
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    img.click();
    const dialog = pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog");
    dialog.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(page.activeElement).toBe(img);
  });

  it("外側(::backdrop 相当)のクリックで閉じる", () => {
    const dom = runImages();
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    img.click();
    const dialog = pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog");
    dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("ダイアログの中の部品を押しても閉じない", () => {
    const dom = runImages();
    const page = dom.window.document;
    pick<HTMLImageElement>(page, ".ds-images-item img").click();
    const dialog = pick<HTMLDialogElement>(page, ".ds-image-zoom-dialog");
    pick<HTMLImageElement>(page, ".ds-image-zoom-img").dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("印刷では何も変えない(押せる印もダイアログも無い)", () => {
    const dom = runImages("print");
    const page = dom.window.document;
    const img = pick<HTMLImageElement>(page, ".ds-images-item img");
    expect(img.getAttribute("role")).toBe(null);
    expect(img.tabIndex).toBe(-1);
    expect(page.querySelector(".ds-image-zoom-dialog")).toBe(null);
  });

  it("閉じるボタンの名前は質問票の言語に合わせる", () => {
    const dom = new JSDOM(
      `<!doctype html><body>${sheetBody(sheetView({ ...docWithImages, lang: "en" }, undefined, 0, "en"), "focus", true)}</body>`,
      { runScripts: "outside-only" },
    );
    dom.window.HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    };
    dom.window.eval(sheetScript("en").replaceAll("<\\/", "</"));
    const page = dom.window.document;
    pick<HTMLImageElement>(page, ".ds-images-item img").click();
    expect(
      pick<HTMLButtonElement>(page, ".ds-image-zoom-dialog button").textContent,
    ).toBe("Close image");
  });
});
