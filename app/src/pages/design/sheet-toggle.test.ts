// @vitest-environment node
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sheetScript } from "../../../server/sheet-client";
import { sheetBody, sheetView } from "../../../server/sheet-render";
import { sheetSampleBody } from "../../../server/sheet-sample";
import type { SheetDocument } from "../../schema/sheet";
import { wireSheetToggle } from "./sheet-toggle";

// 編集画面の見本の開閉は、親の画面が静止した見本の DOM に手を入れる。
// 保存した質問票のスクリプト(sheet-client.ts)と同じ開閉になることを確かめる

const doc: SheetDocument = {
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "開閉の確かめ",
  questions: [
    { id: "one", title: "1問目", type: "text" },
    { id: "two", title: "2問目", type: "text" },
  ],
};

const page = (body: string): Document =>
  new JSDOM(`<!doctype html><body>${body}</body>`, {
    runScripts: "outside-only",
  }).window.document;

// 開閉に関わるところだけを取り出す
const state = (page: Document) => {
  const toggle = page.querySelector(".ds-sidebar-toggle");
  return {
    hidden: page.getElementById("question-sidebar")?.hidden,
    collapsed: page
      .querySelector(".ds-board-layout")
      ?.classList.contains("ds-sidebar-collapsed"),
    expanded: toggle?.getAttribute("aria-expanded"),
    label: toggle?.textContent,
  };
};

const press = (page: Document) =>
  page.querySelector<HTMLButtonElement>(".ds-sidebar-toggle")?.click();

describe("見本の一覧の開閉", () => {
  it("静止した見本の「質問一覧を閉じる/開く」で一覧が開閉する", () => {
    const sample = page(sheetSampleBody("focus"));
    wireSheetToggle(sample);
    expect(state(sample)).toEqual({
      hidden: false,
      collapsed: false,
      expanded: "true",
      label: "質問一覧を閉じる",
    });
    press(sample);
    expect(state(sample)).toEqual({
      hidden: true,
      collapsed: true,
      expanded: "false",
      label: "質問一覧を開く",
    });
    press(sample);
    expect(state(sample).hidden).toBe(false);
  });

  it("二度つないでも、1回押して1回だけ開閉する", () => {
    const sample = page(sheetSampleBody("focus"));
    wireSheetToggle(sample);
    wireSheetToggle(sample);
    press(sample);
    expect(state(sample).hidden).toBe(true);
  });

  it("一覧の無い見本(全問・印刷向け)と空の文書では何もしない", () => {
    for (const layout of ["all", "print"] as const) {
      const sample = page(sheetSampleBody(layout));
      expect(() => wireSheetToggle(sample)).not.toThrow();
      expect(sample.querySelector(".ds-sidebar-toggle")).toBeNull();
    }
    expect(() => wireSheetToggle(undefined)).not.toThrow();
    expect(() => wireSheetToggle(page(""))).not.toThrow();
  });

  it("保存した質問票のスクリプトと同じ開閉になる", () => {
    const view = sheetView(doc, undefined);
    const saved = page(sheetBody(view, "focus", true));
    saved.defaultView?.eval(sheetScript("ja").replaceAll("<\\/", "</"));
    const sample = page(sheetBody(view, "focus"));
    wireSheetToggle(sample);
    expect(state(sample)).toEqual(state(saved));
    for (const round of [1, 2, 3]) {
      press(saved);
      press(sample);
      expect(state(sample), `${round} 回目`).toEqual(state(saved));
    }
  });
});
