import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VersionSummary } from "../src/api/types.ts";
import { checkDeck, type Deck } from "../src/schema/deck.ts";
import {
  isVersionId,
  listVersionIds,
  versionsDir,
  writeDeckWithVersion,
} from "./save.ts";
import { hasCode, readDeckFile } from "./workspace.ts";

// 履歴(versions/)の一覧・取得・復元

const versionPath = (root: string, deckId: string, versionId: string): string =>
  join(versionsDir(root, deckId), `${versionId}.json`);

// 版の id は保存した日時。生成案を取り込んだときの版には -generated が付く
export const versionSavedAt = (versionId: string): string => {
  const match = versionId.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).toISOString();
};

export const versionSource = (versionId: string): VersionSummary["source"] =>
  versionId.includes("-generated") ? "generated" : "save";

type VersionFile =
  | { state: "missing" }
  | { state: "ready"; deck: Deck }
  | { state: "invalid"; message: string };

const readVersion = async (
  root: string,
  deckId: string,
  versionId: string,
): Promise<VersionFile> => {
  if (!isVersionId(versionId)) return { state: "missing" };
  const text = await readFile(
    versionPath(root, deckId, versionId),
    "utf8",
  ).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (text === undefined) return { state: "missing" };
  try {
    const result = checkDeck(JSON.parse(text));
    return result.success
      ? { state: "ready", deck: result.deck }
      : { state: "invalid", message: result.message };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { state: "invalid", message: `JSON として読めない: ${reason}` };
  }
};

// 読めない版も一覧から消さず、理由を添える
export const listVersions = async (
  root: string,
  deckId: string,
): Promise<VersionSummary[]> => {
  const versionIds = await listVersionIds(root, deckId);
  return Promise.all(
    versionIds.map(async (versionId) => {
      const file = await readVersion(root, deckId, versionId);
      const base = {
        versionId,
        savedAt: versionSavedAt(versionId),
        source: versionSource(versionId),
      };
      return file.state === "ready"
        ? {
            ...base,
            title: file.deck.title,
            slideCount: file.deck.slides.length,
          }
        : {
            ...base,
            error: file.state === "invalid" ? file.message : "版が見つからない",
          };
    }),
  );
};

export type VersionResult<T> =
  | { success: true; value: T }
  | { success: false; status: 404 | 422; message: string };

export const readVersionDeck = async (
  root: string,
  deckId: string,
  versionId: string,
): Promise<VersionResult<Deck>> => {
  const file = await readVersion(root, deckId, versionId);
  if (file.state === "missing") {
    return { success: false, status: 404, message: "版が見つからない" };
  }
  if (file.state === "invalid") {
    return { success: false, status: 422, message: file.message };
  }
  return { success: true, value: file.deck };
};

// 復元も新しい版として残す(現行を versions/ へ写してから書く)
export const restoreVersion = async (
  root: string,
  deckId: string,
  versionId: string,
  now: Date,
): Promise<VersionResult<Deck>> => {
  const current = await readDeckFile(root, deckId);
  if (current.state === "missing") {
    return { success: false, status: 404, message: "資料が見つからない" };
  }
  const version = await readVersionDeck(root, deckId, versionId);
  if (!version.success) return version;
  return {
    success: true,
    value: await writeDeckWithVersion(root, deckId, version.value, now),
  };
};
