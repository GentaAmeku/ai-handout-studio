// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { makeDiagram, reportDiagram } from "./diagram.ts";

// 生成器の図を Studio の Playwright で撮る。利用者が別の道具を入れなくても画像になることを、実ブラウザで確かめる
const dir = mkdtempSync(join(tmpdir(), "diagram-export-"));
const spec = fileURLToPath(
  new URL(
    "../../node_modules/diagram-skill/skills/diagram/examples/structure.json",
    import.meta.url,
  ),
);

const draw = async (name: string) =>
  makeDiagram(
    { type: "structure", spec, out: name },
    { cwd: dir, env: process.env },
  );

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("diagram の生成器の図を撮る", () => {
  it("PNG は2倍の大きさで書き出す", async () => {
    const outcome = await draw("out.png");
    expect(reportDiagram(outcome).exitCode).toBe(0);
    const png = readFileSync(join(dir, "out.png"));
    expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    expect(outcome).toMatchObject({
      kind: "done",
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      bytes: png.length,
    });
    expect(png.readUInt32BE(16) % 2).toBe(0);
  });

  it("JPEG と WebP にも書き出せる", async () => {
    expect((await draw("out.jpg")).kind).toBe("done");
    expect([...readFileSync(join(dir, "out.jpg")).subarray(0, 2)]).toEqual([
      255, 216,
    ]);
    expect((await draw("out.webp")).kind).toBe("done");
    expect(
      readFileSync(join(dir, "out.webp")).subarray(8, 12).toString("latin1"),
    ).toBe("WEBP");
  });
});
