// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  componentsSchema,
  type Template,
  tokensSchema,
} from "../../schema/design";
import {
  type DesignBase,
  draftVariables,
  isTemplateName,
  resolveDraft,
  sameTemplate,
} from "./draft";

const readJson = (path: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../design/${path}`, import.meta.url)),
      "utf8",
    ),
  );

const base: DesignBase = {
  tokens: tokensSchema.parse(readJson("tokens.json")),
  components: componentsSchema.parse(readJson("components.json")),
};

const template: Template = {
  label: "下書き",
  components: { table: { variant: "lined" } },
};

const documentTemplate: Template = {
  ...template,
  layout: {
    columns: [640, 228],
    areas: [
      ["toc", "toc"],
      ["main", "aside"],
    ],
  },
};

const variablesOf = (
  next: Template,
  surface: "slide" | "document" = "slide",
) => {
  const resolved = resolveDraft(surface, "draft", next, base);
  if (!resolved) throw new Error("解決できない");
  return draftVariables(resolved);
};

describe("編集中のテンプレート", () => {
  it("テンプレートを解くと、tokens.json の値で見本の変数を作る", () => {
    expect(variablesOf(template)["--color-primary"]).toBe(
      base.tokens.color.primary,
    );
  });

  it("文書のテンプレートの変数は骨格を持ち、スライドは持たない", () => {
    expect(variablesOf(documentTemplate, "document")["--doc-measure"]).toBe(
      "640px",
    );
    expect(variablesOf(template)["--doc-measure"]).toBeUndefined();
  });

  it("キーの順と空の区分の違いは、変更と見なさない", () => {
    expect(
      sameTemplate(
        { ...template, tokens: {} },
        { components: template.components, label: template.label },
      ),
    ).toBe(true);
    expect(
      sameTemplate(template, {
        ...template,
        tokens: { space: { gap: 99 } },
      }),
    ).toBe(false);
  });

  it("テンプレートの名前は deck.json の template と同じ規則で、tokens は使えない", () => {
    expect(isTemplateName("client-a")).toBe(true);
    expect(isTemplateName("Client_A")).toBe(false);
    expect(isTemplateName("tokens")).toBe(false);
  });
});
