// @vitest-environment node
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeckDetail, DeckSummary } from "../src/api/types";
import { createApi } from "./api.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixedNow = new Date(2026, 8, 16, 10, 0, 0);
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-delete-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const api = () =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => fixedNow,
  });

const createDeck = async (title = "消す資料"): Promise<string> => {
  const response = await api().request("/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outlineId: "proposal", title }),
  });
  return ((await response.json()) as DeckDetail).deckId;
};

describe("DELETE /api/decks/:deckId", () => {
  it("資料フォルダを丸ごと消し、一覧から消える", async () => {
    const deckId = await createDeck();
    const response = await api().request(`/api/decks/${deckId}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deckId });
    await expect(
      stat(join(context.workspaceRoot, "decks", deckId)),
    ).rejects.toThrow();
    const list = (await (
      await api().request("/api/decks")
    ).json()) as DeckSummary[];
    expect(list.map((deck) => deck.deckId)).not.toContain(deckId);
  });

  it("無い資料は 404、形の違う id は 400", async () => {
    expect(
      (
        await api().request("/api/decks/deck_20260101_001", {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    expect(
      (await api().request("/api/decks/deck_1", { method: "DELETE" })).status,
    ).toBe(400);
  });
});
