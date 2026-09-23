// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeckDetail } from "../src/api/types";
import type { Deck } from "../src/schema/deck";
import { createApi } from "./api";
import { VERSION_LIMIT } from "./save";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { workspaceRoot: "", clock: 0 };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-save-"),
  );
  context.clock = new Date(2026, 8, 16, 10, 0, 0).getTime();
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

// 呼ぶたびに1秒進む時計。updatedAt の食い違いを確かめるため
const api = () =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => {
      context.clock += 1000;
      return new Date(context.clock);
    },
  });

const send = async (method: string, path: string, body: unknown) =>
  api().request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const createDeck = async (): Promise<Deck> => {
  const response = await send("POST", "/api/decks", {
    outlineId: "proposal",
    title: "保存テスト",
  });
  const detail = (await response.json()) as DeckDetail;
  if (detail.state !== "ready") throw new Error("資料を作れなかった");
  return detail.deck;
};

const versionsOf = (deckId: string) =>
  readdir(join(context.workspaceRoot, "decks", deckId, "versions"));

const save = (deck: Deck, baseUpdatedAt: string) =>
  send("PUT", `/api/decks/${deck.id}`, { deck, baseUpdatedAt });

describe("PUT /api/decks/:deckId", () => {
  it("保存すると updatedAt を進め、旧版を versions/ に残す", async () => {
    const deck = await createDeck();
    const response = await save(
      { ...deck, title: "直した題名" },
      deck.meta.updatedAt,
    );
    expect(response.status).toBe(200);
    const detail = (await response.json()) as DeckDetail;
    const saved = detail.state === "ready" ? detail.deck : undefined;
    expect(saved?.title).toBe("直した題名");
    expect(saved?.meta.updatedAt).not.toBe(deck.meta.updatedAt);

    const versions = await versionsOf(deck.id);
    expect(versions).toHaveLength(1);
    const archived = JSON.parse(
      await readFile(
        join(
          context.workspaceRoot,
          "decks",
          deck.id,
          "versions",
          versions[0] ?? "",
        ),
        "utf8",
      ),
    );
    expect(archived.title).toBe("保存テスト");
  });

  it("読み込んだあとにファイルが変わっていれば 409 で上書きしない", async () => {
    const deck = await createDeck();
    expect((await save(deck, deck.meta.updatedAt)).status).toBe(200);
    const stale = await save(
      { ...deck, title: "古い画面から" },
      deck.meta.updatedAt,
    );
    expect(stale.status).toBe(409);
    const onDisk = JSON.parse(
      await readFile(
        join(context.workspaceRoot, "decks", deck.id, "deck.json"),
        "utf8",
      ),
    );
    expect(onDisk.title).toBe("保存テスト");
  });

  it("壊れた deck と id の違う deck は 422、無い資料は 404", async () => {
    const deck = await createDeck();
    expect(
      (
        await send("PUT", `/api/decks/${deck.id}`, {
          deck: { ...deck, size: { width: 1, height: 1 } },
          baseUpdatedAt: deck.meta.updatedAt,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send("PUT", `/api/decks/${deck.id}`, {
          deck: { ...deck, id: "deck_20260101_001" },
          baseUpdatedAt: deck.meta.updatedAt,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send("PUT", "/api/decks/deck_20260101_001", {
          deck: { ...deck, id: "deck_20260101_001" },
          baseUpdatedAt: deck.meta.updatedAt,
        })
      ).status,
    ).toBe(404);
  });

  it("版は新しい順に30件だけ残す", async () => {
    const deck = await createDeck();
    const dir = join(context.workspaceRoot, "decks", deck.id, "versions");
    await mkdir(dir, { recursive: true });
    await Promise.all(
      Array.from({ length: VERSION_LIMIT }, (_, index) =>
        writeFile(
          join(dir, `20260101T0000${String(index).padStart(2, "0")}.json`),
          "{}",
        ),
      ),
    );
    expect((await save(deck, deck.meta.updatedAt)).status).toBe(200);
    const versions = (await versionsOf(deck.id)).sort();
    expect(versions).toHaveLength(VERSION_LIMIT);
    expect(versions[0]).toBe("20260101T000001.json");
  });
});
