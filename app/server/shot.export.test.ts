import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sniffImage } from "./handout-assets";
import { takeShot } from "./shot";

// shot は実ブラウザで撮る。手元の HTML(見た目の案のモック)を PNG にして、資料に取り込める形か確かめる
const context = { dir: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-shot-"));
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
});

describe("shot", () => {
  it("手元の HTML を指定の大きさの PNG に撮る", async () => {
    await writeFile(
      join(context.dir, "mock.html"),
      '<!doctype html><meta charset="utf-8"><body style="margin:0"><h1>案A</h1></body>',
    );
    const result = await takeShot(
      {
        target: "mock.html",
        out: "out/a.png",
        width: 640,
        height: 360,
        full: false,
        wait: 0,
      },
      context.dir,
    );
    const bytes = new Uint8Array(await readFile(result.path));
    expect(result.path).toBe(join(context.dir, "out", "a.png"));
    expect(sniffImage(bytes)?.ext).toBe("png");
    // PNG の IHDR の幅と高さ
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([640, 360]);
    expect(result.warnings).toEqual([]);
  });
});
