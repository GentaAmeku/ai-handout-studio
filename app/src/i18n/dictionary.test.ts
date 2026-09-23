import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ja } from "./ja";

describe("i18n辞書", () => {
  it("英語は日本語と同じキーを持つ", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("値は空でない", () => {
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(ja[key].length).toBeGreaterThan(0);
      expect(en[key].length).toBeGreaterThan(0);
    }
  });
});
