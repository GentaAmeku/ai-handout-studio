// @vitest-environment node
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkContrast } from "../src/design/contrast";
import { mergeTokens } from "../src/design/theme";
import { readDesignBase, readTemplate } from "./design";
import {
  KEY_HUE_NAMES,
  KEY_HUES,
  placeColors,
  recolorColors,
  recolorSvg,
  recolorTemplate,
} from "./template-recolor";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { dir: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-recolor-"));
  await cp(join(repoRoot, "design"), context.dir, { recursive: true });
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
});

// Cobalt の色のうち、青の段・差し色・替えない色の代表
const cobalt = {
  primary: "#0017c1",
  primaryStrong: "#00118f",
  tint: "#e8f1fe",
  lavender: "#d9e6ff",
  accent2: "#0066be",
  accent3: "#006f83",
  text: "#333333",
  border: "#949494",
  focus: "#000000",
  focusRing: "#ffd43d",
  success: "#197a4b",
  warning: "#927200",
  danger: "#ec0000",
};

const BLUE_IN_SVG = /#(?:0017c1|00118f|e8f1fe|d9e6ff|c5d7fb|9db7f9)/i;

describe("recolorColors", () => {
  it("青の N 段を選んだ色相の N 段に置き、フォーカス・意味の色・灰・差し色は残す", () => {
    const color = recolorColors(cobalt, placeColors(cobalt, "green"));
    expect(color).toEqual({
      ...cobalt,
      primary: "#115a36",
      primaryStrong: "#0c472a",
      tint: "#e6f5ec",
      lavender: "#c2e5d1",
    });
  });

  it("差し色が主色と同じ色相になるときは、青の同じ段へ回す", () => {
    const cyan = recolorColors(cobalt, placeColors(cobalt, "cyan"));
    expect(cyan.primary).toBe("#006f83");
    expect(cyan.accent3).toBe("#0017c1");
    expect(cyan.accent2).toBe(cobalt.accent2);
    const lightblue = recolorColors(cobalt, placeColors(cobalt, "lightblue"));
    expect(lightblue.primary).toBe("#0055ad");
    expect(lightblue.accent2).toBe("#0031d8");
    expect(lightblue.accent3).toBe(cobalt.accent3);
  });

  it("青の段を持たない色は置かない", () => {
    expect(
      placeColors({ primary: "#2563eb", text: "#333333" }, "green"),
    ).toEqual({});
  });
});

describe("recolorSvg", () => {
  it("青の段だけを替え、大文字の値も拾う", () => {
    expect(
      recolorSvg(
        '<rect fill="#0017C1"/><circle fill="#99f2ff"/><path stroke="#333333"/>',
        "purple",
      ),
    ).toBe(
      '<rect fill="#5109ad"/><circle fill="#99f2ff"/><path stroke="#333333"/>',
    );
  });
});

describe("recolorTemplate", () => {
  it.each(KEY_HUE_NAMES)("%s: 3区分を作り、明暗差の検査を通す", async (hue) => {
    const result = await recolorTemplate({
      designDir: context.dir,
      from: "cobalt",
      name: "mine",
      hue,
    });
    expect(result).toMatchObject({
      success: true,
      surfaces: ["slide", "sheet", "document"],
      primary: { from: "#0017c1", to: KEY_HUES[hue].steps[9] },
    });
    const base = await readDesignBase(context.dir);
    if (!base.success) throw new Error(base.message);
    for (const surface of ["slide", "sheet", "document"] as const) {
      const template = await readTemplate(context.dir, surface, "mine");
      if (!template.success) throw new Error(template.message);
      expect(template.value.label).toBe("Mine");
      expect(template.value.description).toContain(KEY_HUES[hue].label);
      const color = mergeTokens(base.base.tokens, template.value.tokens).color;
      expect(color.primary).toBe(KEY_HUES[hue].steps[9]);
      expect(color.focus).toBe("#000000");
      expect(color.focusRing).toBe("#ffd43d");
      expect(
        checkContrast(color, { strictContrast: true }).filter(
          (check) => !check.ok,
        ),
      ).toEqual([]);
    }
  });

  it("同梱の絵の青を塗り替え、見本と専用の CSS を写す", async () => {
    const result = await recolorTemplate({
      designDir: context.dir,
      from: "cobalt",
      name: "mine",
      hue: "orange",
    });
    expect(result.success).toBe(true);
    const slide = join(context.dir, "templates", "slide");
    const assets = await readdir(join(slide, "mine", "assets"));
    expect(assets).toEqual(await readdir(join(slide, "cobalt", "assets")));
    for (const file of assets) {
      const before = await readFile(
        join(slide, "cobalt", "assets", file),
        "utf8",
      );
      const after = await readFile(join(slide, "mine", "assets", file), "utf8");
      expect(before).toMatch(BLUE_IN_SVG);
      expect(after).not.toMatch(BLUE_IN_SVG);
    }
    for (const file of ["sample.json", "sample.en.json", "template.css"]) {
      expect(await readFile(join(slide, "mine", file), "utf8")).toBe(
        await readFile(join(slide, "cobalt", file), "utf8"),
      );
    }
  });

  it("明暗差が足りない色は同じ色相の中で薄い段へ動かし、動かした色を返す", async () => {
    const result = await recolorTemplate({
      designDir: context.dir,
      from: "cobalt",
      name: "mine",
      hue: "green",
    });
    // 緑の 100 段の地では補足の字(muted)が 4.5 に届かないので、50 段へ寄せる
    expect(result).toMatchObject({
      success: true,
      moved: ["lavender 100 → 50"],
    });
  });

  it("名前が正しくない・既にある・構成と重なる・元に青の段が無いときは何も書かない", async () => {
    const run = (name: string, from = "cobalt") =>
      recolorTemplate({ designDir: context.dir, from, name, hue: "green" });
    expect((await run("Mine")).success).toBe(false);
    expect((await run("tokens")).success).toBe(false);
    expect((await run("cobalt")).success).toBe(false);
    // 中身の構成(sample.json だけのフォルダ)の名前も使わない
    expect((await run("proposal")).success).toBe(false);
    expect(await run("mine", "linen")).toMatchObject({
      success: false,
      message: expect.stringContaining("青の段"),
    });
    expect((await run("mine", "nothing")).success).toBe(false);
    for (const surface of ["slide", "sheet", "document"]) {
      expect(
        await readdir(join(context.dir, "templates", surface)),
      ).not.toContain("mine");
    }
  });
});
