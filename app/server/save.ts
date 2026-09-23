import { constants } from "node:fs";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { checkDeck, type Deck } from "../src/schema/deck.ts";
import {
  deckDir,
  fileStamp,
  hasCode,
  readDeckFile,
  writeJsonAtomic,
} from "./workspace.ts";

// 保存と版の退避

export const VERSION_LIMIT = 30;

const VERSION_ID_PATTERN = /^\d{8}T\d{6}(?:-[a-z0-9]+)*$/;

export const isVersionId = (value: string): boolean =>
  VERSION_ID_PATTERN.test(value);

export const versionsDir = (root: string, deckId: string): string =>
  join(deckDir(root, deckId), "versions");

// source を dir へ版として写す。同じ秒に重なったら -2, -3 … を付ける
export const archiveFileTo = async (
  dir: string,
  source: string,
  now: Date,
): Promise<string> => {
  await mkdir(dir, { recursive: true });
  const stamp = fileStamp(now);
  const attempt = async (count: number): Promise<string> => {
    const versionId = count === 1 ? stamp : `${stamp}-${count}`;
    try {
      await copyFile(
        source,
        join(dir, `${versionId}.json`),
        constants.COPYFILE_EXCL,
      );
      return versionId;
    } catch (error) {
      if (hasCode(error, "EEXIST")) return attempt(count + 1);
      throw error;
    }
  };
  return attempt(1);
};

export const archiveCurrentDeck = (
  root: string,
  deckId: string,
  now: Date,
): Promise<string> =>
  archiveFileTo(
    versionsDir(root, deckId),
    join(deckDir(root, deckId), "deck.json"),
    now,
  );

export const listVersionIdsIn = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch((): string[] => []))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter(isVersionId)
    .sort()
    .reverse();

export const listVersionIds = (
  root: string,
  deckId: string,
): Promise<string[]> => listVersionIdsIn(versionsDir(root, deckId));

// 新しい順に limit 件を残し、それより古い版を消す
export const pruneVersionsIn = async (
  dir: string,
  limit = VERSION_LIMIT,
): Promise<void> => {
  const stale = (await listVersionIdsIn(dir)).slice(limit);
  await Promise.all(
    stale.map((versionId) => rm(join(dir, `${versionId}.json`))),
  );
};

export const pruneVersions = (
  root: string,
  deckId: string,
  limit = VERSION_LIMIT,
): Promise<void> => pruneVersionsIn(versionsDir(root, deckId), limit);

export type SaveResult =
  | { success: true; deck: Deck }
  | { success: false; status: 404 | 409 | 422; message: string };

// 現行を退避してから新しい版で置き換える。deck.json は一時ファイルからの rename で書く
export const writeDeckWithVersion = async (
  root: string,
  deckId: string,
  deck: Deck,
  now: Date,
): Promise<Deck> => {
  const saved: Deck = {
    ...deck,
    id: deckId,
    meta: { ...deck.meta, updatedAt: now.toISOString() },
  };
  await archiveCurrentDeck(root, deckId, now);
  await writeJsonAtomic(join(deckDir(root, deckId), "deck.json"), saved);
  await pruneVersions(root, deckId);
  return saved;
};

export const saveDeck = async (
  root: string,
  deckId: string,
  input: { deck: unknown; baseUpdatedAt: string },
  now: Date,
): Promise<SaveResult> => {
  const checked = checkDeck(input.deck);
  if (!checked.success) {
    return { success: false, status: 422, message: checked.message };
  }
  if (checked.deck.id !== deckId) {
    return {
      success: false,
      status: 422,
      message: `deck の id "${checked.deck.id}" が資料の id "${deckId}" と違う`,
    };
  }
  const current = await readDeckFile(root, deckId);
  if (current.state === "missing") {
    return { success: false, status: 404, message: "資料が見つからない" };
  }
  // 読み込んだあとにファイルが外で書き換えられていたら上書きしない
  if (
    current.state === "invalid" ||
    current.value.meta.updatedAt !== input.baseUpdatedAt
  ) {
    return {
      success: false,
      status: 409,
      message:
        "deck.json が画面で読み込んだあとに書き換えられている。読み直してから保存する",
    };
  }
  return {
    success: true,
    deck: await writeDeckWithVersion(root, deckId, checked.deck, now),
  };
};
