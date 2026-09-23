// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 色は design/tokens.json とテーマだけが持つ
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(css|tsx?)$/.test(name) && !name.includes(".test."))
    .map((name) => join(repoRoot, dir, name));

// design/ は手で書く CSS だけを見る。dist は tokens の値を写した生成物
const designCss = readdirSync(join(repoRoot, "design"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => join(repoRoot, "design", name));

// 図の生成器も SVG に色を書かない。色は document.css の .ds-node などが持つ
const figureScripts = readdirSync(join(repoRoot, "design", "figure"))
  .filter((name) => name.endsWith(".mjs"))
  .map((name) => join(repoRoot, "design", "figure", name));

const files = [
  ...sourceFiles("app/src/blocks"),
  ...sourceFiles("app/src/renderer"),
  ...designCss,
  ...figureScripts,
];

describe("色の直書き", () => {
  it("検査対象のファイルがある", () => {
    expect(designCss.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(designCss.length);
  });

  it.each(files.map((file) => [relative(repoRoot, file), file]))(
    "%s に色コードを書かない",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).not.toMatch(colorLiteral);
    },
  );
});
