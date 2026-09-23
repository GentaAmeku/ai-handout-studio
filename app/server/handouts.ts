import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Surface } from "../src/schema/design.ts";
import {
  claimSerialDir,
  fileStamp,
  hasCode,
  listDirNames,
} from "./workspace.ts";

// 質問票と HTML 資料の置き場所。スライド(decks/)と同じ形の id と書き出し先を使う。
// 区分の名前(sheet・document)は design/templates/<区分>/ と同じものにする

export type HandoutKind = Extract<Surface, "sheet" | "document">;

export const handoutKinds = ["sheet", "document"] as const;

// フォルダ名と id の頭。documents は 3 文字に縮めて deck_ と長さをそろえる
const HANDOUT_DIRS: Record<HandoutKind, string> = {
  sheet: "sheets",
  document: "documents",
};

const HANDOUT_PREFIX: Record<HandoutKind, string> = {
  sheet: "sheet",
  document: "doc",
};

const HANDOUT_SUBDIRS = ["exports"] as const;

export const handoutsDir = (root: string, kind: HandoutKind): string =>
  join(root, HANDOUT_DIRS[kind]);

export const handoutDir = (
  root: string,
  kind: HandoutKind,
  id: string,
): string => join(handoutsDir(root, kind), id);

export const isHandoutId = (kind: HandoutKind, value: string): boolean =>
  new RegExp(`^${HANDOUT_PREFIX[kind]}_\\d{8}_\\d{3}$`).test(value);

// どの区分の id かを id の形から決める。経路の組み立てに使う
export const handoutKindOf = (value: string): HandoutKind | undefined =>
  handoutKinds.find((kind) => isHandoutId(kind, value));

export const claimHandoutDir = (
  root: string,
  kind: HandoutKind,
  now: Date,
): Promise<string> =>
  claimSerialDir({
    dir: handoutsDir(root, kind),
    kind: HANDOUT_PREFIX[kind],
    subdirs: HANDOUT_SUBDIRS,
    now,
  });

export const listHandoutIds = async (
  root: string,
  kind: HandoutKind,
): Promise<string[]> =>
  (await listDirNames(handoutsDir(root, kind))).filter((name) =>
    isHandoutId(kind, name),
  );

// 資料フォルダを丸ごと消す。無ければ false(削除の API が 404 にする)
export const deleteHandoutDir = async (
  root: string,
  kind: HandoutKind,
  id: string,
): Promise<boolean> => {
  try {
    await rm(handoutDir(root, kind, id), { recursive: true });
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
};

export const metaPathOf = (
  root: string,
  kind: HandoutKind,
  id: string,
): string => join(handoutDir(root, kind, id), "meta.json");

// 書き出し先。スライドと同じく exports/<日時>/ に置く
export const exportDirOf = (
  root: string,
  kind: HandoutKind,
  id: string,
  now: Date,
): string => join(handoutDir(root, kind, id), "exports", fileStamp(now));

// 書き出しのファイル名。題名は使わず、id と日時で決める(記号や空白で困らない)
export const exportFileName = (id: string, now: Date): string =>
  `${id}-${fileStamp(now)}.html`;
