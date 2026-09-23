// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeckDetail, VersionSummary } from "../src/api/types";
import type { Deck } from "../src/schema/deck";
import { createApi } from "./api";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { workspaceRoot: "", clock: 0 };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-ver-"),
  );
  context.clock = new Date(2026, 8, 16, 10, 0, 0).getTime();
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const api = () =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => {
      context.clock += 1000;
      return new Date(context.clock);
    },
  });

const send = (method: string, path: string, body?: unknown) =>
  api().request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const readDetail = async (response: Response): Promise<Deck> => {
  const detail = (await response.json()) as DeckDetail;
  if (detail.state !== "ready") throw new Error("資料を読めない");
  return detail.deck;
};

const deckDirOf = (deckId: string) =>
  join(context.workspaceRoot, "decks", deckId);

// 題名を変えながら2回保存し、版を2つ残す
const deckWithHistory = async (): Promise<Deck> => {
  const created = await readDetail(
    await send("POST", "/api/decks", {
      outlineId: "proposal",
      title: "履歴テスト",
    }),
  );
  const first = await readDetail(
    await send("PUT", `/api/decks/${created.id}`, {
      deck: { ...created, title: "1回目" },
      baseUpdatedAt: created.meta.updatedAt,
    }),
  );
  return readDetail(
    await send("PUT", `/api/decks/${created.id}`, {
      deck: { ...first, title: "2回目" },
      baseUpdatedAt: first.meta.updatedAt,
    }),
  );
};

describe("履歴", () => {
  it("版を新しい順に、題名と枚数つきで返す", async () => {
    const deck = await deckWithHistory();
    const versions = (await (
      await send("GET", `/api/decks/${deck.id}/versions`)
    ).json()) as VersionSummary[];

    expect(versions.map((version) => version.title)).toEqual([
      "1回目",
      "履歴テスト",
    ]);
    expect(versions[0]).toMatchObject({ slideCount: 13, source: "save" });
    expect(versions[0]?.savedAt).toMatch(/^2026-09-16T/);
  });

  it("版の中身を取り出せる", async () => {
    const deck = await deckWithHistory();
    const versions = (await (
      await send("GET", `/api/decks/${deck.id}/versions`)
    ).json()) as VersionSummary[];
    const versionId = versions[1]?.versionId ?? "";

    const response = await send(
      "GET",
      `/api/decks/${deck.id}/versions/${versionId}`,
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as { deck: Deck }).toMatchObject({
      versionId,
      deck: { title: "履歴テスト" },
    });
  });

  it("復元すると、その版の中身に戻り、復元前の版も残る", async () => {
    const deck = await deckWithHistory();
    const versions = (await (
      await send("GET", `/api/decks/${deck.id}/versions`)
    ).json()) as VersionSummary[];
    const oldest = versions.at(-1)?.versionId ?? "";

    const restored = await readDetail(
      await send("POST", `/api/decks/${deck.id}/versions/${oldest}/restore`),
    );
    expect(restored.title).toBe("履歴テスト");
    expect(restored.meta.updatedAt).not.toBe(deck.meta.updatedAt);

    const saved = JSON.parse(
      await readFile(join(deckDirOf(deck.id), "deck.json"), "utf8"),
    );
    expect(saved.title).toBe("履歴テスト");
    expect(await readdir(join(deckDirOf(deck.id), "versions"))).toHaveLength(3);
  });

  it("無い版は 404、壊れた版は 422 で、復元しない", async () => {
    const deck = await deckWithHistory();
    expect(
      (await send("GET", `/api/decks/${deck.id}/versions/20260101T000000`))
        .status,
    ).toBe(404);
    expect(
      (
        await send(
          "POST",
          `/api/decks/${deck.id}/versions/20260101T000000/restore`,
        )
      ).status,
    ).toBe(404);

    await writeFile(
      join(deckDirOf(deck.id), "versions", "20260101T000000.json"),
      "{ broken",
    );
    const versions = (await (
      await send("GET", `/api/decks/${deck.id}/versions`)
    ).json()) as VersionSummary[];
    expect(versions.at(-1)?.error).toMatch(/JSON として読めない/);
    expect(
      (
        await send(
          "POST",
          `/api/decks/${deck.id}/versions/20260101T000000/restore`,
        )
      ).status,
    ).toBe(422);
  });
});
