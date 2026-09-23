import { cp } from "node:fs/promises";
import { join } from "node:path";
import { checkDeck } from "../src/schema/deck.ts";
import type { Locale } from "../src/schema/profile.ts";
import { documentPathOf } from "./document-source.ts";
import { createDocument } from "./document-store.ts";
import { listHandoutIds } from "./handouts.ts";
import { readLocale } from "./profile.ts";
import {
  claimDeckDir,
  deckDir,
  decksDir,
  isDeckId,
  listDirNames,
  parseJson,
  readTextIfExists,
  writeJsonAtomic,
} from "./workspace.ts";

// 同梱資料。正本は examples/<言語>/ の使い方のスライド(usage/)とセットアップの HTML 資料(setup/)。
// 初めて起きたときに空の workspace へ写し、あとは ai-handout-studio examples で入れ直す

export const EXAMPLES_MARK = "examples.json";

export type InstalledExample = { id: string; path: string };

export type InstallResult =
  | { success: true; lang: Locale; installed: readonly InstalledExample[] }
  | { success: false; message: string };

export type AutoInstallResult =
  | InstallResult
  | { success: true; skipped: "marked" | "has-handouts" };

export const examplesDirOf = (repoRoot: string, lang: Locale): string =>
  join(repoRoot, "examples", lang);

export const examplesMarkPath = (root: string): string =>
  join(root, EXAMPLES_MARK);

const readJsonOf = async (
  path: string,
): Promise<
  { success: true; value: unknown } | { success: false; message: string }
> => {
  const text = await readTextIfExists(path);
  if (text === undefined) {
    return { success: false, message: `同梱資料が見つからない: ${path}` };
  }
  const json = parseJson(text);
  return json.success
    ? json
    : { success: false, message: `${path}: ${json.message}` };
};

// スライド。id と日時を新しくし、assets/ も写す
const installDeck = async (
  root: string,
  sourceDir: string,
  now: Date,
): Promise<InstalledExample | { error: string }> => {
  const json = await readJsonOf(join(sourceDir, "deck.json"));
  if (!json.success) return { error: json.message };
  const source = checkDeck(json.value);
  if (!source.success) return { error: `使い方のスライド: ${source.message}` };
  const id = await claimDeckDir(root, now);
  const dir = deckDir(root, id);
  const timestamp = now.toISOString();
  const deck = {
    ...source.deck,
    id,
    meta: { ...source.deck.meta, createdAt: timestamp, updatedAt: timestamp },
  };
  const assets = join(sourceDir, "assets");
  if ((await listDirNames(sourceDir)).includes("assets")) {
    await cp(assets, join(dir, "assets"), { recursive: true });
  }
  const path = join(dir, "deck.json");
  await writeJsonAtomic(path, deck);
  return { id, path };
};

// HTML 資料。保存の口(document new と同じ)を通すので、id・日時・meta.json・assets/ はそこで決まる
const installDocument = async (
  root: string,
  designDir: string,
  sourceDir: string,
  now: Date,
): Promise<InstalledExample | { error: string }> => {
  const json = await readJsonOf(join(sourceDir, "document.json"));
  if (!json.success) return { error: json.message };
  const saved = await createDocument(
    root,
    designDir,
    { document: json.value, baseDir: sourceDir },
    now,
  );
  if (!saved.success)
    return { error: `セットアップと使い方: ${saved.message}` };
  return {
    id: saved.summary.id,
    path: documentPathOf(root, saved.summary.id),
  };
};

const isError = (
  value: InstalledExample | { error: string },
): value is { error: string } => "error" in value;

// 印に関係なく、同梱資料を新しい id で足す(ai-handout-studio examples)
export const installExamples = async ({
  workspaceRoot,
  repoRoot,
  lang,
  now,
}: {
  workspaceRoot: string;
  repoRoot: string;
  lang?: Locale;
  now: Date;
}): Promise<InstallResult> => {
  const resolved = lang ?? (await readLocale(workspaceRoot));
  const base = examplesDirOf(repoRoot, resolved);
  const deck = await installDeck(workspaceRoot, join(base, "usage"), now);
  if (isError(deck)) return { success: false, message: deck.error };
  const document = await installDocument(
    workspaceRoot,
    join(repoRoot, "design"),
    join(base, "setup"),
    now,
  );
  if (isError(document)) return { success: false, message: document.error };
  return { success: true, lang: resolved, installed: [deck, document] };
};

// スライドか HTML 資料のフォルダがあるか。中身が壊れていても資料として数える。
// 質問票は数えない。セットアップの途中で質問票を保存してから初めてサーバーが起きるので、
// 数えると同梱資料が入らない
const hasHandouts = async (root: string): Promise<boolean> => {
  const decks = (await listDirNames(decksDir(root))).filter(isDeckId);
  if (decks.length > 0) return true;
  return (await listHandoutIds(root, "document")).length > 0;
};

// 印を残す。すでにあれば(初めに入れたときの記録を)そのまま残す。
// ai-handout-studio examples で入れたときも残し、doctor の節10が入ったと分かるようにする
export const markExamplesIfAbsent = async (
  root: string,
  result: { lang: Locale; installed: readonly InstalledExample[] },
  now: Date,
): Promise<void> => {
  if ((await readTextIfExists(examplesMarkPath(root))) !== undefined) return;
  await writeJsonAtomic(examplesMarkPath(root), {
    installedAt: now.toISOString(),
    lang: result.lang,
    ids: result.installed.map((example) => example.id),
  });
};

// サーバーが起きたとき。スライドと HTML 資料が1件も無く、印も無いときだけ入れて印を残す。
// 利用者が消したあとは印があるので入れない
export const installExamplesIfEmpty = async ({
  workspaceRoot,
  repoRoot,
  now,
}: {
  workspaceRoot: string;
  repoRoot: string;
  now: Date;
}): Promise<AutoInstallResult> => {
  if ((await readTextIfExists(examplesMarkPath(workspaceRoot))) !== undefined) {
    return { success: true, skipped: "marked" };
  }
  if (await hasHandouts(workspaceRoot)) {
    return { success: true, skipped: "has-handouts" };
  }
  const result = await installExamples({ workspaceRoot, repoRoot, now });
  if (!result.success) return result;
  await markExamplesIfAbsent(workspaceRoot, result, now);
  return result;
};
