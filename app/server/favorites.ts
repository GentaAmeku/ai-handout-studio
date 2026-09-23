import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { WithFavorite } from "../src/api/types.ts";
import { handoutDir, handoutKindOf } from "./handouts.ts";
import {
  deckDir,
  isDeckId,
  readTextIfExists,
  writeJsonAtomic,
} from "./workspace.ts";

// 資料一覧のお気に入り。お気に入りの資料の id を workspace/favorites.json に並べる。
// deck.json・meta.json には書かない(印を付けても版が積まれず、updatedAt も一覧の並びも動かない)。
// id の頭(deck_・sheet_・doc_)で区分が分かるので、区分ごとには分けない

export const favoritesPath = (root: string): string =>
  join(root, "favorites.json");

const favoritesFile = z.object({ ids: z.array(z.string()) });

// 無ければ0件。壊れていても0件として読み、次に付け外ししたときに書き直す
export const readFavorites = async (
  root: string,
): Promise<ReadonlySet<string>> => {
  const text = await readTextIfExists(favoritesPath(root));
  if (text === undefined) return new Set();
  try {
    const parsed = favoritesFile.safeParse(JSON.parse(text));
    return new Set(parsed.success ? parsed.data.ids : []);
  } catch {
    return new Set();
  }
};

// 読んで書き直す間に別の付け外しが割り込まないよう、作業フォルダごとに1本の列に並べる
const queues = new Map<string, Promise<unknown>>();

const serialize = <T>(root: string, task: () => Promise<T>): Promise<T> => {
  const next = (queues.get(root) ?? Promise.resolve()).then(task, task);
  queues.set(
    root,
    next.catch(() => undefined),
  );
  return next;
};

export const setFavorite = (
  root: string,
  id: string,
  favorite: boolean,
): Promise<void> =>
  serialize(root, async () => {
    const current = await readFavorites(root);
    if (current.has(id) === favorite) return;
    const ids = favorite
      ? [...current, id]
      : [...current].filter((item) => item !== id);
    await writeJsonAtomic(favoritesPath(root), { ids });
  });

// 付け外しできる資料のフォルダ。スライド・質問票・HTML 資料のどの id の形でもなければ undefined
const folderOf = (root: string, id: string): string | undefined => {
  if (isDeckId(id)) return deckDir(root, id);
  const kind = handoutKindOf(id);
  return kind ? handoutDir(root, kind, id) : undefined;
};

export type SetFavoriteResult =
  | { success: true }
  | { success: false; status: 400 | 404; message: string };

// 画面の ☆ から。資料が無い id は付けない(消したあとの押し直しなど)
export const setFavoriteOf = async (
  root: string,
  id: string,
  favorite: boolean,
): Promise<SetFavoriteResult> => {
  const folder = folderOf(root, id);
  if (!folder) {
    return {
      success: false,
      status: 400,
      message: "資料の id の形が正しくない",
    };
  }
  const exists = await stat(folder).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!exists) {
    return { success: false, status: 404, message: "資料が見つからない" };
  }
  await setFavorite(root, id, favorite);
  return { success: true };
};

// 一覧の1件ずつに、お気に入りかどうかを足す
export const withFavorites = async <T>(
  root: string,
  summaries: readonly T[],
  idOf: (summary: T) => string,
): Promise<WithFavorite<T>[]> => {
  const favorites = await readFavorites(root);
  return summaries.map((summary) => ({
    ...summary,
    favorite: favorites.has(idOf(summary)),
  }));
};
