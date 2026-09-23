// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SheetDocument, SheetQuestion } from "../src/schema/sheet.ts";
import {
  checkSheetFile,
  isSheetInput,
  recommendedMark,
  sheetWarnings,
} from "./sheet-check.ts";
import { sheetBody, sheetView } from "./sheet-render.ts";

// 作者が label に (推奨) を書いても、画面の「（推奨）」は1回だけ

const questionOf = (labels: readonly string[]): SheetQuestion => ({
  id: "aura",
  title: "オーラの出し方",
  type: "single",
  options: labels.map((label, index) => ({ id: `o${index}`, label })),
  recommended: ["o0"],
});

const sheet = (labels: readonly string[]): SheetDocument => ({
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "推奨の出し方",
  questions: [questionOf(labels)],
});

describe("推奨の印", () => {
  const question = (label: string) => questionOf([label, "ほかの案"]);

  it("label に無ければ「（推奨）」を足す", () => {
    const q = question("瞳は変えない");
    expect(recommendedMark(q, { id: "o0", label: "瞳は変えない" })).toBe(
      "（推奨）",
    );
    expect(recommendedMark(q, { id: "o1", label: "ほかの案" })).toBe("");
  });

  it("label の末尾に半角・全角の (推奨) があれば足さない", () => {
    [
      "瞳は変えない(推奨)",
      "瞳は変えない（推奨）",
      "瞳は変えない(推奨) ",
    ].forEach((label) => {
      expect(recommendedMark(question(label), { id: "o0", label })).toBe("");
    });
  });

  it("label の途中の「推奨」は対象にしない", () => {
    const label = "推奨値のまま使う";
    expect(recommendedMark(question(label), { id: "o0", label })).toBe(
      "（推奨）",
    );
  });

  it("選択肢と印刷の一覧で「（推奨）」が二重にならない", () => {
    const view = sheetView(
      sheet(["瞳は変えない(推奨)", "ほかの案"]),
      undefined,
    );
    const focus = sheetBody(view, "focus", true);
    const print = sheetBody(view, "print");
    expect(focus).toContain("<span>瞳は変えない(推奨)</span>");
    expect(print).toContain("<li>瞳は変えない(推奨)</li>");
    [focus, print].forEach((html) => {
      expect(html).not.toContain("(推奨)（推奨）");
    });
  });

  it("label に無ければ今までどおり選択肢と印刷の一覧に付く", () => {
    const view = sheetView(sheet(["瞳は変えない", "ほかの案"]), undefined);
    expect(sheetBody(view, "focus", true)).toContain(
      "<span>瞳は変えない（推奨）</span>",
    );
    expect(sheetBody(view, "print")).toContain(
      '<li>瞳は変えない<span class="ds-subtle">（推奨）</span></li>',
    );
  });
});

describe("質問 JSON の警告", () => {
  it("label に (推奨)・（推奨） を含む選択肢に警告を出す", () => {
    expect(
      sheetWarnings(sheet(["瞳は変えない(推奨)", "ほかの案（推奨）"])),
    ).toEqual([
      "質問 aura: 選択肢 o0 の label に (推奨) がある。推奨は recommended で示す。label に (推奨) を書かない",
      "質問 aura: 選択肢 o1 の label に (推奨) がある。推奨は recommended で示す。label に (推奨) を書かない",
    ]);
  });

  it("label に無い質問や「推奨値」には警告を出さない", () => {
    expect(sheetWarnings(sheet(["瞳は変えない", "推奨値のまま使う"]))).toEqual(
      [],
    );
  });

  it("check は質問 JSON を見分け、形が合えば警告つきで合格にする", () => {
    const input = sheet(["瞳は変えない(推奨)", "ほかの案"]);
    expect(isSheetInput(input)).toBe(true);
    expect(isSheetInput({ slides: [] })).toBe(false);
    expect(checkSheetFile(input)).toMatchObject({
      ok: true,
      warnings: [expect.stringContaining("選択肢 o0")],
    });
    expect(checkSheetFile({ ...input, questions: [] })).toMatchObject({
      ok: false,
    });
  });
});
