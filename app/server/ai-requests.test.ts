// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiDir, createAiRequest, readAiPatch } from "./ai-requests";

const now = new Date(2026, 8, 16, 10, 15, 0);
const context = { workspaceRoot: "" };
const repoRoot = "/repo";
const deckId = "deck_20260916_001";
const requestId = "20260916T101500";

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-ai-"),
  );
  await mkdir(join(context.workspaceRoot, "decks", deckId), {
    recursive: true,
  });
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const create = (scope: "slide" | "deck") =>
  createAiRequest(
    context.workspaceRoot,
    repoRoot,
    deckId,
    {
      scope,
      slideId: scope === "slide" ? "s04" : undefined,
      instruction: "見出しを短くする",
      target: { id: "s04", layout: "content", blocks: [] },
    },
    now,
  );

const writePatch = (value: unknown) =>
  writeFile(
    join(aiDir(context.workspaceRoot, deckId, requestId), "patch.json"),
    JSON.stringify(value),
  );

describe("createAiRequest", () => {
  it("依頼と対象の JSON を ai/{日時}/ に置き、コマンドを返す", async () => {
    const detail = await create("slide");
    expect(detail.requestId).toBe(requestId);
    expect(detail.patchPath).toContain(`ai/${requestId}/patch.json`);
    expect(detail.commands.claude).toContain("cd '/repo' && claude ");

    const dir = aiDir(context.workspaceRoot, deckId, requestId);
    const markdown = await readFile(join(dir, "request.md"), "utf8");
    expect(markdown).toContain("見出しを短くする");
    expect(markdown).toContain("pnpm deck:check");
    expect(markdown).toContain("`s04` の `blocks` だけ");
    expect(
      JSON.parse(await readFile(join(dir, "target.json"), "utf8")),
    ).toMatchObject({ id: "s04" });
  });

  it("デッキ全体の依頼では、パッチの集まりにするよう書く", async () => {
    await create("deck");
    const markdown = await readFile(
      join(aiDir(context.workspaceRoot, deckId, requestId), "request.md"),
      "utf8",
    );
    expect(markdown).toContain("スライドごとのパッチの集まり");
  });
});

describe("readAiPatch", () => {
  it("まだ無ければ none、壊れていれば invalid、通れば ready", async () => {
    await create("slide");
    expect(await readAiPatch(context.workspaceRoot, deckId, requestId)).toEqual(
      { state: "none" },
    );

    await writePatch({ slideId: "s04", blocks: [{ type: "timeline" }] });
    expect(
      (await readAiPatch(context.workspaceRoot, deckId, requestId)).state,
    ).toBe("invalid");

    await writePatch({
      slideId: "s04",
      blocks: [
        {
          type: "text",
          x: 64,
          y: 176,
          w: 560,
          h: 96,
          props: { text: "短い見出し" },
        },
      ],
    });
    const ready = await readAiPatch(context.workspaceRoot, deckId, requestId);
    expect(ready.state).toBe("ready");
    expect(ready.state === "ready" && ready.patches[0]?.slideId).toBe("s04");
  });
});
