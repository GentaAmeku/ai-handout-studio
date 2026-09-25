import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Surface } from "../src/schema/design.ts";
import { selectionPath } from "./design.ts";
import {
  type HandoutKind,
  handoutDir,
  handoutKinds,
  listHandoutIds,
  metaPathOf,
} from "./handouts.ts";
import { deckDir, writeJsonAtomic } from "./workspace.ts";

// 名前を変えた・外したテンプレート。区分ごとに、古い名前 → 今の名前
export const TEMPLATE_RENAMES: Record<
  Surface,
  Readonly<Record<string, string>>
> = {
  slide: { civic: "cobalt" },
  sheet: { civic: "cobalt" },
  // 読み物(reading)は外した。既定のテンプレートで描く
  document: { civic: "cobalt", reading: "default" },
};

const readObject = async (
  path: string,
): Promise<Record<string, unknown> | undefined> => {
  const raw = await readFile(path, "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

// JSON の template(スライドは古い theme も)が古い名前なら今の名前へ書き換える。書き換えたら true
const renameIn = async (
  path: string,
  renames: Readonly<Record<string, string>>,
): Promise<boolean> => {
  const parsed = await readObject(path);
  const current = parsed?.template ?? parsed?.theme;
  if (!parsed || typeof current !== "string" || !(current in renames)) {
    return false;
  }
  const { theme: _, ...rest } = parsed;
  await writeJsonAtomic(path, { ...rest, template: renames[current] });
  return true;
};

const renameDecks = async (root: string): Promise<string[]> => {
  const ids = await readdir(join(root, "decks")).catch(() => [] as string[]);
  const moved = await Promise.all(
    ids.map(async (id) =>
      (await renameIn(
        join(deckDir(root, id), "deck.json"),
        TEMPLATE_RENAMES.slide,
      ))
        ? [id]
        : [],
    ),
  );
  return moved.flat();
};

// 質問票と文書は meta.json が正。文書は document.json の template も合わせる
const renameHandouts = async (
  root: string,
  kind: HandoutKind,
): Promise<string[]> => {
  const ids = await listHandoutIds(root, kind);
  const moved = await Promise.all(
    ids.map(async (id) => {
      const meta = await renameIn(
        metaPathOf(root, kind, id),
        TEMPLATE_RENAMES[kind],
      );
      const body =
        kind === "document" &&
        (await renameIn(
          join(handoutDir(root, kind, id), "document.json"),
          TEMPLATE_RENAMES[kind],
        ));
      return meta || body ? [id] : [];
    }),
  );
  return moved.flat();
};

// design/selection.json が古い名前を選んでいたら今の名前へ直す
const renameSelection = async (designDir: string): Promise<boolean> => {
  const path = selectionPath(designDir);
  const parsed = await readObject(path);
  if (!parsed) return false;
  const surfaces = Object.keys(TEMPLATE_RENAMES) as Surface[];
  const changed = surfaces.filter((surface) => {
    const current = parsed[surface];
    return typeof current === "string" && current in TEMPLATE_RENAMES[surface];
  });
  if (changed.length === 0) return false;
  await writeJsonAtomic(
    path,
    Object.fromEntries(
      Object.entries(parsed).map(([key, value]) =>
        changed.includes(key as Surface) && typeof value === "string"
          ? [key, TEMPLATE_RENAMES[key as Surface][value]]
          : [key, value],
      ),
    ),
  );
  return true;
};

// 資料と選択が持つテンプレートの名前を、今の名前へ付け替える。起動時に回す。何度回しても同じ
export const migrateRenamedTemplates = async (
  root: string,
  designDir: string,
): Promise<string[]> => {
  const [decks, handouts, selection] = await Promise.all([
    renameDecks(root),
    Promise.all(handoutKinds.map((kind) => renameHandouts(root, kind))),
    renameSelection(designDir),
  ]);
  return [
    ...decks,
    ...handouts.flat(),
    ...(selection ? ["design/selection.json"] : []),
  ];
};
