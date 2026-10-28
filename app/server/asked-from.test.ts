// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { askedFromOf, askedFromShort, askedFromText } from "./asked-from";

describe("質問元", () => {
  it("git の外では、走らせたフォルダの名前だけを取る", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asked-from-"));
    try {
      expect(askedFromOf(dir, "会話")).toEqual({
        folder: basename(dir),
        conversation: "会話",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("git の中では、サブフォルダから走らせてもリポジトリの名前を取る", () => {
    const from = askedFromOf(join(process.cwd(), "app/server"));
    expect(from.folder).toBe(basename(process.cwd()));
    expect(from.conversation).toBeUndefined();
  });

  it("画面には会話の名前を先に、タブには会話の名前だけを出す", () => {
    const full = { folder: "repo", branch: "main", conversation: "DEV-1" };
    expect(askedFromText(full)).toBe("DEV-1 · repo (main)");
    expect(askedFromShort(full)).toBe("DEV-1");
    expect(askedFromText({ folder: "repo" })).toBe("repo");
    expect(askedFromShort({ folder: "repo" })).toBe("repo");
  });
});
