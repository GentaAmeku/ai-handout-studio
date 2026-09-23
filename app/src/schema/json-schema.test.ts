// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  sampleTemplateNames,
  templateDeck,
} from "../../server/test-fixtures.ts";
import { knownBlockTypes } from "./block";
import { checkAiDeck } from "./deck";
import { documentBlockSchema } from "./document";
import {
  buildDeckJsonSchema,
  buildDocumentJsonSchema,
  buildPatchJsonSchema,
} from "./json-schema";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("エージェントに渡すもの", () => {
  it("skills/ai-handout-studio/deck.schema.json がスキーマと一致している(違えば pnpm schema:export)", async () => {
    const saved = JSON.parse(
      await readFile(
        join(repoRoot, "skills/ai-handout-studio/deck.schema.json"),
        "utf8",
      ),
    );
    expect(saved).toEqual(buildDeckJsonSchema());
  });

  it("skills/ai-handout-studio/patch.schema.json がスキーマと一致している(違えば pnpm schema:export)", async () => {
    const saved = JSON.parse(
      await readFile(
        join(repoRoot, "skills/ai-handout-studio/patch.schema.json"),
        "utf8",
      ),
    );
    expect(saved).toEqual(buildPatchJsonSchema());
  });

  it("skills/ai-handout-studio/document.schema.json がスキーマと一致している(違えば pnpm schema:export)", async () => {
    const saved = JSON.parse(
      await readFile(
        join(repoRoot, "skills/ai-handout-studio/document.schema.json"),
        "utf8",
      ),
    );
    expect(saved).toEqual(buildDocumentJsonSchema());
  });

  it("skills/ai-handout-studio/references/document.md が部品14種すべてを説明している", async () => {
    const guide = await readFile(
      join(repoRoot, "skills/ai-handout-studio/references/document.md"),
      "utf8",
    );
    expect(
      documentBlockSchema.options
        .map((option) => option.shape.type.value)
        .filter((type) => !guide.includes(`| \`${type}\` |`)),
    ).toEqual([]);
  });

  it("skills/ai-handout-studio/SKILL.md が編集案(パッチ)の手順を持つ", async () => {
    const skill = await readFile(
      join(repoRoot, "skills/ai-handout-studio/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("patch.json");
    expect(skill).toContain("target.json");
  });

  it("skills/ai-handout-studio/SKILL.md がブロック10種すべてを説明している", async () => {
    const skill = await readFile(
      join(repoRoot, "skills/ai-handout-studio/SKILL.md"),
      "utf8",
    );
    expect(
      knownBlockTypes.filter((type) => !skill.includes(`\`${type}\``)),
    ).toEqual([]);
  });

  it("skills/ai-handout-studio/SKILL.md が HTML 資料の手順へ案内している", async () => {
    const skill = await readFile(
      join(repoRoot, "skills/ai-handout-studio/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("document new");
    expect(skill).toContain("document.json");
    expect(skill).toContain("references/document.md");
    expect(skill).toContain("references/document-templates.md");
  });

  it("skills/ai-handout-studio/references が HTML 資料の手順とセクションの型を持つ", async () => {
    const guide = await readFile(
      join(repoRoot, "skills/ai-handout-studio/references/document.md"),
      "utf8",
    );
    // document.json が正で、形はスキーマが持つ
    expect(guide).toContain("document.schema.json");
    expect(guide).toContain("document new --json");
    expect(guide).toContain("ai-handout-studio document export");
    const templates = await readFile(
      join(
        repoRoot,
        "skills/ai-handout-studio/references/document-templates.md",
      ),
      "utf8",
    );
    for (const heading of ["設計書", "要求・要件", "調査結果"]) {
      expect(templates).toContain(heading);
    }
  });

  it("テンプレートの中身の見本は AI 出力用の検証も通る", () => {
    const names = sampleTemplateNames();
    expect(names.length).toBeGreaterThan(0);
    const failures = names.flatMap((name) => {
      const result = checkAiDeck(templateDeck(name));
      return result.success ? [] : [`${name}: ${result.message}`];
    });
    expect(failures).toEqual([]);
  });
});
