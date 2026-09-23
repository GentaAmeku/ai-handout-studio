import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { DeckSummary, OutlineSummary } from "../src/api/types.ts";
import {
  checkDeck,
  type Deck,
  deckTemplate,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from "../src/schema/deck.ts";
import {
  isTemplateName,
  type SlideSample,
  type Surface,
} from "../src/schema/design.ts";
import { type Profile, parseProfile } from "../src/schema/profile.ts";
import {
  outlineNames,
  readSelection,
  readSlideSample,
  templateAssetNames,
  templateAssetsDir,
  templateNames,
} from "./design.ts";

export const DECK_ID_PATTERN = /^deck_\d{8}_\d{3}$/;
const DECK_SUBDIRS = ["versions", "assets", "exports"] as const;

export const isDeckId = (value: string): boolean => DECK_ID_PATTERN.test(value);

export const decksDir = (root: string): string => join(root, "decks");

export const deckDir = (root: string, deckId: string): string =>
  join(decksDir(root), deckId);

// 資料フォルダを丸ごと消す。無ければ false(削除の API が 404 にする)
export const deleteDeckDir = async (
  root: string,
  deckId: string,
): Promise<boolean> => {
  try {
    await rm(deckDir(root, deckId), { recursive: true });
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
};

export const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

export const readTextIfExists = async (
  path: string,
): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
};

export const listDirNames = async (path: string): Promise<string[]> => {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return [];
    throw error;
  }
};

const modifiedAt = async (path: string): Promise<string> =>
  (await stat(path)).mtime.toISOString();

// 一時ファイルへ書いてから rename する。途中で落ちても元のファイルを壊さない
export const writeTextAtomic = async (
  path: string,
  text: string,
): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, path);
};

export const writeJsonAtomic = (path: string, value: unknown): Promise<void> =>
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);

const pad2 = (value: number): string => String(value).padStart(2, "0");

// 版や書き出しのフォルダ名に使う日時。例: 20260916T101500
export const fileStamp = (now: Date): string =>
  `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
  `T${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

export type JsonFile<T> =
  | { state: "missing" }
  | { state: "ready"; value: T }
  | { state: "invalid"; message: string };

type Check<T> = (
  input: unknown,
) => { success: true; value: T } | { success: false; message: string };

export const parseJson = (
  text: string,
): { success: true; value: unknown } | { success: false; message: string } => {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, message: `JSON として読めない: ${reason}` };
  }
};

export const readJsonFile = async <T>(
  path: string,
  check: Check<T>,
): Promise<JsonFile<T>> => {
  const text = await readTextIfExists(path);
  if (text === undefined) return { state: "missing" };
  const json = parseJson(text);
  if (!json.success) return { state: "invalid", message: json.message };
  const result = check(json.value);
  return result.success
    ? { state: "ready", value: result.value }
    : { state: "invalid", message: result.message };
};

const checkDeckValue: Check<Deck> = (input) => {
  const result = checkDeck(input);
  return result.success
    ? { success: true, value: result.deck }
    : { success: false, message: result.message };
};

export const readDeckFile = async (
  root: string,
  deckId: string,
): Promise<JsonFile<Deck>> => {
  const file = await readJsonFile(
    join(deckDir(root, deckId), "deck.json"),
    checkDeckValue,
  );
  if (file.state !== "ready" || file.value.id === deckId) return file;
  return {
    state: "invalid",
    message: `deck.json の id "${file.value.id}" がフォルダ名 "${deckId}" と違う`,
  };
};

const toReadySummary = (deckId: string, deck: Deck): DeckSummary => ({
  state: "ready",
  deckId,
  title: deck.title,
  status: deck.status,
  tags: deck.meta.tags ?? [],
  ...(deckTemplate(deck) ? { template: deckTemplate(deck) } : {}),
  slideCount: deck.slides.length,
  updatedAt: deck.meta.updatedAt,
  cover: deck.slides[0] ?? null,
});

export const modifiedAtIfExists = async (
  path: string,
): Promise<string | undefined> => {
  try {
    return await modifiedAt(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
};

const summarizeDeck = async (
  root: string,
  deckId: string,
): Promise<DeckSummary | undefined> => {
  const file = await readDeckFile(root, deckId);
  if (file.state === "ready") return toReadySummary(deckId, file.value);
  if (file.state === "invalid") {
    return {
      state: "invalid",
      deckId,
      message: file.message,
      updatedAt: await modifiedAt(join(deckDir(root, deckId), "deck.json")),
    };
  }
  return undefined;
};

// 壊れた資料も一覧から消さない。並びは更新日の新しい順
export const listDecks = async (root: string): Promise<DeckSummary[]> => {
  const deckIds = (await listDirNames(decksDir(root))).filter(isDeckId);
  const summaries = await Promise.all(
    deckIds.map((deckId) => summarizeDeck(root, deckId)),
  );
  return summaries
    .filter((summary) => summary !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const pad = (value: number, length: number): string =>
  String(value).padStart(length, "0");

const dateStamp = (now: Date): string =>
  `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;

// フォルダの作成で番号を確保する。重なったら次の番号にする。
// id は <種類>_<日付>_<連番>。スライド・質問票・HTML 資料で同じ形を使う
export const claimSerialDir = async ({
  dir,
  kind,
  subdirs,
  now,
}: {
  dir: string;
  kind: string;
  subdirs?: readonly string[];
  now: Date;
}): Promise<string> => {
  await mkdir(dir, { recursive: true });
  const prefix = `${kind}_${dateStamp(now)}_`;
  const usedSerials = (await listDirNames(dir))
    .filter(
      (name) =>
        name.startsWith(prefix) && /^\d{3}$/.test(name.slice(prefix.length)),
    )
    .map((name) => Number(name.slice(prefix.length)));

  const claim = async (serial: number): Promise<string> => {
    if (serial > 999) throw new Error("この日の資料番号を使い切った");
    const id = `${prefix}${pad(serial, 3)}`;
    try {
      await mkdir(join(dir, id));
    } catch (error) {
      if (hasCode(error, "EEXIST")) return claim(serial + 1);
      throw error;
    }
    await Promise.all(
      (subdirs ?? []).map((name) =>
        mkdir(join(dir, id, name), { recursive: true }),
      ),
    );
    return id;
  };

  return claim(Math.max(0, ...usedSerials) + 1);
};

export const claimDeckDir = (root: string, now: Date): Promise<string> =>
  claimSerialDir({
    dir: decksDir(root),
    kind: "deck",
    subdirs: DECK_SUBDIRS,
    now,
  });

// 自分用の既定値。無い・壊れている場合は未設定として扱う
// profile.json を読む。無い(missing)と壊れている(invalid)を見分けたいとき(settings・保存)はこちら
export const readProfileFile = (root: string): Promise<JsonFile<Profile>> =>
  readJsonFile(join(root, "profile.json"), (input) => {
    const result = parseProfile(input);
    return result.success
      ? { success: true, value: result.profile }
      : { success: false, message: result.message };
  });

export const readProfile = async (
  root: string,
): Promise<Profile | undefined> => {
  const file = await readProfileFile(root);
  return file.state === "ready" ? file.value : undefined;
};

// スライドの中身の構成(sample.json)。テンプレート(template.json)とは別に読む
export const readOutline = async (
  designDir: string,
  outlineId: string,
): Promise<{ label: string; sample: SlideSample } | undefined> => {
  if (!isTemplateName(outlineId)) return undefined;
  const sample = await readSlideSample(designDir, outlineId);
  return sample ? { label: sample.label ?? outlineId, sample } : undefined;
};

// 新規作成で選ぶ構成の一覧。テンプレート(template.json)を持つフォルダは、見た目の名前が
// 構成として並んで紛らわしいので外す。その見本は一覧のカードと編集画面が見せる
export const listOutlines = async (
  designDir: string,
): Promise<OutlineSummary[]> => {
  const designs = await templateNames(designDir, "slide");
  const names = (await outlineNames(designDir))
    .filter(isTemplateName)
    .filter((name) => !designs.includes(name));
  const outlines = await Promise.all(
    names.map(async (outlineId) => {
      const found = await readOutline(designDir, outlineId);
      return found
        ? {
            outlineId,
            title: found.label,
            slideCount: found.sample.slides.length,
            cover: found.sample.slides[0] ?? null,
            body: found.sample.slides[1] ?? null,
          }
        : undefined;
    }),
  );
  return outlines.filter((outline) => outline !== undefined);
};

export type CreateDeckResult =
  | { success: true; deck: Deck }
  | { success: false; reason: "outline-not-found" | "template-not-found" };

// 中身の構成から資料を始める。見た目はテンプレート(templateId。無ければ既定のテンプレート)で、deck.json の template に書く
export const createDeckFromOutline = async (
  root: string,
  designDir: string,
  input: { outlineId: string; templateId?: string; title: string },
  now: Date,
): Promise<CreateDeckResult> => {
  const found = await readOutline(designDir, input.outlineId);
  if (!found) return { success: false, reason: "outline-not-found" };
  const design = await resolveDesign(designDir, input.templateId);
  if (!design) return { success: false, reason: "template-not-found" };
  const deckId = await claimDeckDir(root, now);
  const timestamp = now.toISOString();
  const deck = checkDeck({
    id: deckId,
    title: input.title,
    template: design,
    size: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    status: "draft",
    meta: { ...found.sample.meta, createdAt: timestamp, updatedAt: timestamp },
    slides: found.sample.slides,
  });
  if (!deck.success) throw new Error(deck.message);
  // 見本の image は src に assets/<ファイル> と書く。テンプレートと構成に同梱の絵を資料の assets/ へ写す
  // (同じ名前なら中身の構成の方を残す)。どちらも持たなければ assets/ は作らない
  await copyTemplateAssets(
    designDir,
    [design, input.outlineId],
    deckDir(root, deckId),
  );
  await writeJsonAtomic(join(deckDir(root, deckId), "deck.json"), deck.deck);
  return { success: true, deck: deck.deck };
};

export const copyTemplateAssets = async (
  designDir: string,
  names: readonly string[],
  target: string,
): Promise<void> => {
  for (const name of new Set(names)) {
    const files = await templateAssetNames(designDir, name);
    if (files.length === 0) continue;
    await mkdir(join(target, "assets"), { recursive: true });
    await Promise.all(
      files.map((file) =>
        copyFile(
          join(templateAssetsDir(designDir, name), file),
          join(target, "assets", file),
        ),
      ),
    );
  }
};

// 指定されたテンプレート(無ければ区分の既定)の名前。その区分のテンプレートとして無ければ undefined
export const resolveSurfaceTemplate = async (
  designDir: string,
  surface: Surface,
  templateId: string | undefined,
): Promise<string | undefined> => {
  const names = await templateNames(designDir, surface);
  if (templateId) return names.includes(templateId) ? templateId : undefined;
  const selection = await readSelection(designDir);
  const selected = selection.success ? selection.value[surface] : undefined;
  return selected && names.includes(selected) ? selected : names[0];
};

export const resolveDesign = (
  designDir: string,
  templateId: string | undefined,
): Promise<string | undefined> =>
  resolveSurfaceTemplate(designDir, "slide", templateId);

// 中身の構成の名前を deck.json の template に書いていた資料(テンプレートを持たない構成: proposal など)の
// template を、既定のテンプレートへ直す。見た目はもとから既定のテンプレートで描かれていた。何度回しても同じ
export const migrateOutlineDecks = async (
  root: string,
  designDir: string,
): Promise<string[]> => {
  const [outlines, designs] = await Promise.all([
    outlineNames(designDir),
    templateNames(designDir, "slide"),
  ]);
  const legacy = new Set(outlines.filter((name) => !designs.includes(name)));
  const target = await resolveDesign(designDir, undefined);
  if (legacy.size === 0 || !target) return [];
  const ids = await readdir(join(root, "decks")).catch(() => [] as string[]);
  const moved = await Promise.all(
    ids.map(async (deckId) => {
      const path = join(deckDir(root, deckId), "deck.json");
      const raw = await readFile(path, "utf8").catch(() => undefined);
      const parsed = raw === undefined ? undefined : safeParse(raw);
      const current = parsed?.template ?? parsed?.theme;
      if (!parsed || typeof current !== "string" || !legacy.has(current)) {
        return [];
      }
      const { theme: _, ...rest } = parsed;
      await writeJsonAtomic(path, { ...rest, template: target });
      return [deckId];
    }),
  );
  return moved.flat();
};

const safeParse = (raw: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const ASSET_CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

const isInside = (base: string, target: string): boolean =>
  target.startsWith(`${base}${sep}`);

// assets/ の外は読まない。シンボリックリンクで外へ出る場合も弾く
export const readAssetFrom = async (
  baseDir: string,
  assetPath: string,
  contentTypes: ReadonlyMap<string, string> = ASSET_CONTENT_TYPES,
): Promise<
  { body: Uint8Array<ArrayBuffer>; contentType: string } | undefined
> => {
  const base = resolve(baseDir);
  const target = resolve(base, assetPath);
  const contentType = contentTypes.get(extname(target).toLowerCase());
  if (!contentType || !isInside(base, target)) return undefined;
  try {
    const [realBase, realTarget] = await Promise.all([
      realpath(base),
      realpath(target),
    ]);
    if (!isInside(realBase, realTarget)) return undefined;
    return { body: new Uint8Array(await readFile(realTarget)), contentType };
  } catch (error) {
    if (hasCode(error, "ENOENT") || hasCode(error, "EISDIR")) return undefined;
    throw error;
  }
};

export const readAsset = (root: string, deckId: string, assetPath: string) =>
  readAssetFrom(join(deckDir(root, deckId), "assets"), assetPath);
