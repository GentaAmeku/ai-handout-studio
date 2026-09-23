// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  DeckDetail,
  DeckSummary,
  HandoutSummary,
  WithFavorite,
} from "../src/api/types";
import { createApi } from "./api.ts";
import { favoritesPath } from "./favorites.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixedNow = new Date(2026, 8, 22, 10, 0, 0);
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-favorites-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const send = (method: string, path: string, body?: unknown) =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => fixedNow,
  }).request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const getJson = async <T>(path: string): Promise<T> =>
  (await send("GET", path)).json() as Promise<T>;

const createDeck = async (title: string): Promise<string> => {
  const response = await send("POST", "/api/decks", {
    outlineId: "proposal",
    title,
  });
  return ((await response.json()) as DeckDetail).deckId;
};

const createSheet = async (): Promise<string> => {
  const response = await send("POST", "/api/sheets", {
    questions: {
      schemaVersion: 1,
      id: "demo",
      revision: "1",
      title: "配布の進め方を決める",
      questions: [{ id: "where", title: "どこに置きますか", type: "text" }],
    },
  });
  return ((await response.json()) as HandoutSummary).id;
};

const favoriteIds = async (): Promise<string[]> =>
  (
    JSON.parse(
      await readFile(favoritesPath(context.workspaceRoot), "utf8"),
    ) as {
      ids: string[];
    }
  ).ids;

const deckFavorites = async (): Promise<Record<string, boolean>> =>
  Object.fromEntries(
    (await getJson<WithFavorite<DeckSummary>[]>("/api/decks")).map((deck) => [
      deck.deckId,
      deck.favorite,
    ]),
  );

describe("お気に入り", () => {
  it("付けていない資料は一覧で favorite が false", async () => {
    const deckId = await createDeck("提案");
    const sheetId = await createSheet();
    expect(await deckFavorites()).toEqual({ [deckId]: false });
    const sheets = await getJson<WithFavorite<HandoutSummary>[]>("/api/sheets");
    expect(sheets.map((sheet) => [sheet.id, sheet.favorite])).toEqual([
      [sheetId, false],
    ]);
  });

  it("付けると一覧で true になり、外すと false に戻る。印は favorites.json にだけ書く", async () => {
    const first = await createDeck("一つめ");
    const second = await createDeck("二つめ");
    const deckJson = join(context.workspaceRoot, "decks", first, "deck.json");
    const before = await readFile(deckJson, "utf8");

    const put = await send("PUT", `/api/favorites/${first}`, {
      favorite: true,
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ id: first, favorite: true });
    expect(await deckFavorites()).toEqual({ [first]: true, [second]: false });
    expect(await favoriteIds()).toEqual([first]);
    // deck.json は書き換えない(版も updatedAt も動かない)
    expect(await readFile(deckJson, "utf8")).toBe(before);

    await send("PUT", `/api/favorites/${first}`, { favorite: false });
    expect(await deckFavorites()).toEqual({ [first]: false, [second]: false });
    expect(await favoriteIds()).toEqual([]);
  });

  it("質問票と HTML 資料にも付けられる", async () => {
    const sheetId = await createSheet();
    await send("PUT", `/api/favorites/${sheetId}`, { favorite: true });
    const sheets = await getJson<WithFavorite<HandoutSummary>[]>("/api/sheets");
    expect(sheets.find((sheet) => sheet.id === sheetId)?.favorite).toBe(true);

    const document = (await (
      await send("POST", "/api/documents", {
        title: "保存の仕組み",
        body: '<div class="ds-page"><h1>保存の仕組み</h1></div>',
      })
    ).json()) as HandoutSummary;
    await send("PUT", `/api/favorites/${document.id}`, { favorite: true });
    const documents =
      await getJson<WithFavorite<HandoutSummary>[]>("/api/documents");
    expect(documents.map((item) => item.favorite)).toEqual([true]);
  });

  it("同時に付けても、どれも残る", async () => {
    const ids = await Promise.all([
      createDeck("一"),
      createDeck("二"),
      createDeck("三"),
    ]);
    await Promise.all(
      ids.map((id) => send("PUT", `/api/favorites/${id}`, { favorite: true })),
    );
    expect((await favoriteIds()).sort()).toEqual([...ids].sort());
  });

  it("資料を消すと、お気に入りからも外れる", async () => {
    const deckId = await createDeck("消す資料");
    const sheetId = await createSheet();
    await send("PUT", `/api/favorites/${deckId}`, { favorite: true });
    await send("PUT", `/api/favorites/${sheetId}`, { favorite: true });

    await send("DELETE", `/api/decks/${deckId}`);
    expect(await favoriteIds()).toEqual([sheetId]);
    await send("DELETE", `/api/sheets/${sheetId}`);
    expect(await favoriteIds()).toEqual([]);
  });

  it("壊れた favorites.json は0件として読み、次に付けたときに書き直す", async () => {
    const deckId = await createDeck("提案");
    await writeFile(favoritesPath(context.workspaceRoot), "{壊れている");
    expect(await deckFavorites()).toEqual({ [deckId]: false });
    await send("PUT", `/api/favorites/${deckId}`, { favorite: true });
    expect(await favoriteIds()).toEqual([deckId]);
  });

  it("形の違う id と本文は 400、無い資料は 404", async () => {
    expect(
      (await send("PUT", "/api/favorites/deck_1", { favorite: true })).status,
    ).toBe(400);
    expect(
      (
        await send("PUT", "/api/favorites/deck_20260101_001", {
          favorite: true,
        })
      ).status,
    ).toBe(404);
    const deckId = await createDeck("提案");
    expect(
      (await send("PUT", `/api/favorites/${deckId}`, { favorite: "yes" }))
        .status,
    ).toBe(400);
    expect((await send("PUT", `/api/favorites/${deckId}`)).status).toBe(400);
  });
});
