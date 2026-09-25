import { describe, expect, it } from "vitest";
import { ja } from "../../i18n/ja";
import type { Deck } from "../../schema/deck";
import { deckInfoRows } from "./EditorBar";

// スライドの編集画面の ⓘ に出す行。枚数と状態(下書き/完成)も出す

const t = (
  key: keyof typeof ja,
  vars?: Record<string, string | number>,
): string =>
  vars
    ? Object.entries(vars).reduce(
        (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
        ja[key] as string,
      )
    : ja[key];

const deck = (overrides: Partial<Deck> = {}): Deck =>
  ({
    id: "deck_20260921_001",
    title: "見本",
    template: "cobalt",
    size: { width: 1280, height: 720 },
    status: "draft",
    meta: {
      createdAt: "2026-09-21T00:30:00.000Z",
      updatedAt: "2026-09-21T09:05:00.000Z",
    },
    slides: [
      { id: "s01", layout: "cover", blocks: [] },
      { id: "s02", layout: "content", blocks: [] },
    ],
    ...overrides,
  }) as Deck;

describe("deckInfoRows", () => {
  it("ID・作成日時・更新日時・テンプレート・枚数・状態を出す", () => {
    const rows = deckInfoRows(deck(), t);
    expect(rows).toEqual([
      { label: "ID", value: "deck_20260921_001" },
      { label: "作成日時", value: "2026/09/21 09:30" },
      { label: "更新日時", value: "2026/09/21 18:05" },
      { label: "テンプレート", value: expect.any(String) },
      { label: "枚数", value: "2枚" },
      { label: "状態", value: "作成中" },
    ]);
  });

  it("完成した資料は状態を「完成」と出す", () => {
    const rows = deckInfoRows(deck({ status: "done" }), t);
    expect(rows.find((row) => row.label === "状態")).toEqual({
      label: "状態",
      value: "完成",
    });
  });
});
