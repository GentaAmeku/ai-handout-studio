// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SAMPLE_ORG_NAME, sampleWithOrgName } from "./sample-org.ts";

// 見本は仮の組織名で作り、配信するときに設定の組織名へ差し替える
describe("sampleWithOrgName", () => {
  const withNote = `<div class="ds-signature"><span>${SAMPLE_ORG_NAME}</span><span>文書の見本</span></div>`;
  const alone = `<header><div class="ds-signature"><span>${SAMPLE_ORG_NAME}</span></div><h1>題</h1></header>`;

  it("設定の組織名に差し替え、HTML として逃がす", () => {
    expect(sampleWithOrgName(withNote, "A&B")).toBe(
      '<div class="ds-signature"><span>A&amp;B</span><span>文書の見本</span></div>',
    );
    expect(sampleWithOrgName(alone, "○○")).toBe(
      '<header><div class="ds-signature"><span>○○</span></div><h1>題</h1></header>',
    );
  });

  it("設定が空なら組織名を外し、組織名だけの行は行ごと外す", () => {
    expect(sampleWithOrgName(withNote)).toBe(
      '<div class="ds-signature"><span>文書の見本</span></div>',
    );
    expect(sampleWithOrgName(alone, "")).toBe("<header><h1>題</h1></header>");
  });
});
