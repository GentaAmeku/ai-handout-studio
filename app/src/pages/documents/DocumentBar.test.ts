import { describe, expect, it } from "vitest";
import { ja } from "../../i18n/ja";
import { documentInfoRows } from "./DocumentBar";

// HTML 資料の編集画面の ⓘ に出す行

const t = (key: keyof typeof ja): string => ja[key];

describe("documentInfoRows", () => {
  it("ID・作成日時・更新日時・テンプレートを出す", () => {
    const rows = documentInfoRows(
      {
        id: "doc_20260921_001",
        createdAt: "2026-09-21T00:30:00.000Z",
        updatedAt: "2026-09-21T09:05:00.000Z",
      },
      "Cobalt",
      t,
    );
    expect(rows).toEqual([
      { label: "ID", value: "doc_20260921_001" },
      { label: "作成日時", value: "2026/09/21 09:30" },
      { label: "更新日時", value: "2026/09/21 18:05" },
      { label: "テンプレート", value: "Cobalt" },
    ]);
  });
});
