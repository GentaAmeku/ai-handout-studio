// @vitest-environment node
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFontAssets } from "./design-fonts";

const context = { dir: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-fonts-"));
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
});

describe("buildFontAssets", () => {
  // fonts.css は dist の直下、woff2 は dist/fonts/<書体>/ に置く。
  // url() がずれると 404 になり、画面は OS の代わりの書体で描かれる
  it("fonts.css の url() はすべて写したファイルを指す", async () => {
    await buildFontAssets(context.dir);
    const target = join(context.dir, "dist", "fonts.css");
    const css = await readFile(target, "utf8");
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(([, url = ""]) =>
      url.replace(/^["']|["']$/g, ""),
    );
    expect(urls.length).toBeGreaterThan(0);
    const missing = (
      await Promise.all(
        urls.map((url) =>
          access(resolve(dirname(target), url)).then(
            () => null,
            () => url,
          ),
        ),
      )
    ).filter((url) => url !== null);
    expect(missing).toEqual([]);
  });
});
