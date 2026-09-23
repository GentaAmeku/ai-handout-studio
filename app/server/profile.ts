import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DEFAULT_TEMPLATE, surfaceNames } from "../src/schema/design.ts";
import {
  type Features,
  type LegacyProfile,
  type Locale,
  legacyProfileSchema,
  type Profile,
  profileSchema,
  type ResolvedSettings,
} from "../src/schema/profile.ts";
import {
  buildDesignCss,
  readSelection,
  readTemplate,
  selectionPath,
  templateNames,
  templatePath,
} from "./design.ts";
import { readProfile, readProfileFile, writeJsonAtomic } from "./workspace.ts";

// 自分用の既定値。見た目は design/ が持ち、ここには書かない

export const profilePath = (root: string): string => join(root, "profile.json");

export type SaveProfileResult =
  | { success: true; profile: Profile }
  | { success: false; message: string };

export const saveProfile = async (
  root: string,
  input: unknown,
): Promise<SaveProfileResult> => {
  const result = profileSchema.safeParse(input);
  if (!result.success) {
    return { success: false, message: z.prettifyError(result.error) };
  }
  // 画面は orgName だけを送るので、すでにある locale・features を消さないよう重ねる。
  // 今の profile.json が壊れていたら、重ねる元が分からないので上書きしない
  const existing = await readProfileFile(root);
  if (existing.state === "invalid") {
    return {
      success: false,
      message: brokenProfileMessage(root, existing.message),
    };
  }
  const profile: Profile = {
    ...(existing.state === "ready" ? existing.value : {}),
    ...result.data,
  };
  // workspace/ のフォルダがまだ無い(新しい clone の初回保存)ときも書けるようにする
  await mkdir(root, { recursive: true });
  await writeJsonAtomic(profilePath(root), profile);
  return { success: true, profile };
};

// LANG が ja で始まらなければ英語
const envLocale = (): Locale =>
  process.env.LANG?.startsWith("ja") ? "ja" : "en";

const DEFAULT_FEATURES: Required<Features> = {
  lan: false,
  imageGeneration: false,
  share: false,
};

export const resolveSettings = (
  profile: Profile | undefined,
): ResolvedSettings => ({
  orgName: profile?.orgName ?? "",
  locale: profile?.locale ?? envLocale(),
  features: { ...DEFAULT_FEATURES, ...profile?.features },
  agentInstructions: profile?.agentInstructions ?? "ask",
});

// profile.json が読めない(JSON でない・形が合わない)ときの知らせ。値を1つでも黙って捨てないよう、直すまで止める
export const brokenProfileMessage = (root: string, reason: string): string =>
  `${profilePath(root)} が読めない。直すか消してから、もう一度実行する(読めないまま上書きはしない)\n${reason}`;

// 今の設定。locale・features は既定値で埋めた形で返す(open の --lan の既定・143 の資料の言語が読む)。
// profile.json が壊れていれば既定値で読む。止めて知らせたいとき(settings コマンド)は readSettingsFile を使う
export const readSettings = async (root: string): Promise<ResolvedSettings> =>
  resolveSettings(await readProfile(root));

// profile は profile.json にある値だけ(既定値で埋めない)。settings --set が決めた値だけを書き足すのに使う
export type ReadSettingsResult =
  | { success: true; settings: ResolvedSettings; profile?: Profile }
  | { success: false; message: string };

// settings コマンドの読み出し。profile.json が壊れていれば理由を返す(既定値で埋めて上書きしない)
export const readSettingsFile = async (
  root: string,
): Promise<ReadSettingsResult> => {
  const file = await readProfileFile(root);
  if (file.state === "invalid") {
    return {
      success: false,
      message: brokenProfileMessage(root, file.message),
    };
  }
  const profile = file.state === "ready" ? file.value : undefined;
  return {
    success: true,
    settings: resolveSettings(profile),
    ...(profile ? { profile } : {}),
  };
};

// 資料を作るときの既定の言語として読む
export const readLocale = async (root: string): Promise<Locale> =>
  (await readSettings(root)).locale;

// open・restart が --lan の既定として読む
export const readFeatures = async (root: string): Promise<Required<Features>> =>
  (await readSettings(root)).features;

export type MigrateResult =
  | { migrated: false }
  | { migrated: true; files: string[] }
  | { migrated: false; error: string };

const readLegacyProfile = async (
  workspaceRoot: string,
): Promise<LegacyProfile | undefined> => {
  const text = await readFile(profilePath(workspaceRoot), "utf8").catch(
    () => undefined,
  );
  if (text === undefined) return undefined;
  try {
    const legacy = legacyProfileSchema.safeParse(JSON.parse(text));
    return legacy.success ? legacy.data : undefined;
  } catch {
    return undefined;
  }
};

// 段 B より前の colors を、どの区分の default のテンプレートにも移す。色は小文字の #rrggbb にそろえる。
// 段 I より前のテーマの移行(design-migrate.ts)の後に回す
const moveColors = async (
  designDir: string,
  colors: NonNullable<LegacyProfile["colors"]>,
): Promise<string | undefined> => {
  const lowered = Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [key, value.toLowerCase()]),
  );
  const errors = await Promise.all(
    surfaceNames.map(async (surface) => {
      const template = await readTemplate(designDir, surface, DEFAULT_TEMPLATE);
      if (!template.success) return template.message;
      await writeJsonAtomic(
        templatePath(designDir, surface, DEFAULT_TEMPLATE),
        {
          ...template.value,
          tokens: {
            ...template.value.tokens,
            color: { ...template.value.tokens?.color, ...lowered },
          },
        },
      );
      return undefined;
    }),
  );
  return errors.find((error) => error !== undefined);
};

// 段 G より前の theme を、スライドの既定のテンプレートにする。
// templates/slide/ に無い名前は移さない(今までも既定に倒して描いていた)
const moveTheme = async (
  designDir: string,
  theme: string,
): Promise<string | undefined> => {
  if (!(await templateNames(designDir, "slide")).includes(theme)) {
    return undefined;
  }
  const selection = await readSelection(designDir);
  if (!selection.success) return selection.message;
  if (selection.value.slide === theme) return undefined;
  await writeJsonAtomic(selectionPath(designDir), {
    ...selection.value,
    slide: theme,
  });
  return undefined;
};

// 起動時に一度だけ、旧い profile.json の見た目の値を design/ へ移し、profile から外す
export const migrateProfile = async (
  workspaceRoot: string,
  designDir: string,
): Promise<MigrateResult> => {
  const legacy = await readLegacyProfile(workspaceRoot);
  if (!legacy || (legacy.colors === undefined && legacy.theme === undefined)) {
    return { migrated: false };
  }
  const {
    colors,
    theme,
    displayName: _displayName,
    logo: _logo,
    illustration: _illustration,
    ...profile
  } = legacy;
  const error =
    (colors ? await moveColors(designDir, colors) : undefined) ??
    (theme ? await moveTheme(designDir, theme) : undefined);
  if (error) return { migrated: false, error };
  await writeJsonAtomic(profilePath(workspaceRoot), profile);
  const built = await buildDesignCss(designDir);
  return built.success
    ? { migrated: true, files: built.files }
    : { migrated: false, error: built.message };
};
