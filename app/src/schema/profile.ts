import { z } from "zod";
import { themeName } from "./design.ts";

// 資料の言語。無ければ環境変数 LANG から決める(profile.ts の locale の読み出し)
export const localeName = z.enum(["ja", "en"]);
export type Locale = z.infer<typeof localeName>;

// 任意の機能。無ければ false。ベクトル検索だけは無ければ true(Ollama にモデルがあれば使う。180)
export const featuresSchema = z.strictObject({
  lan: z.boolean().optional(),
  imageGeneration: z.boolean().optional(),
  share: z.boolean().optional(),
  vectorSearch: z.boolean().optional(),
});
export type Features = z.infer<typeof featuresSchema>;

// セットアップが勧め、利用者が断れるもの(共通指示への段落・archify・mod)。
// 断ったら declined を残し、doctor は以後聞かない。ask に戻すとまた聞く
export const offerName = z.enum(["ask", "declined"]);
export type Offer = z.infer<typeof offerName>;

// Claude Code などのハーネスごとの mod(節9)
export const modsSchema = z.strictObject({
  claude: offerName.optional(),
});
export type Mods = z.infer<typeof modsSchema>;

// 自分用の既定値。見た目はテーマ(design/themes/)と面ごとの選択(design/selection.json)が持つ
export const profileSchema = z.strictObject({
  orgName: z.string(),
  locale: localeName.optional(),
  features: featuresSchema.optional(),
  // 共通指示(~/.claude/CLAUDE.md など)へ段落を足すか
  agentInstructions: offerName.optional(),
  // archify(別の作者のスキル)を入れるか
  archify: offerName.optional(),
  mods: modsSchema.optional(),
  // ベクトル検索(Ollama と埋め込みのモデル)を入れるか(180)
  vectorSearch: offerName.optional(),
});

export type Profile = z.infer<typeof profileSchema>;

// locale・features などは既定値で埋めた形。`ai-handout-studio settings` が出す形と同じ
export type ResolvedSettings = {
  orgName: string;
  locale: Locale;
  features: Required<Features>;
  agentInstructions: Offer;
  archify: Offer;
  mods: Required<Mods>;
  vectorSearch: Offer;
};

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB で指定する");

// 段 G より前の profile.json。theme はスライドで使うテーマで、design/selection.json の slide へ移す。
// 段 B より前は colors も持ち、design/themes/default.json へ移す。
// displayName(表示名)・logo・illustration(右下のイラスト)は 130 で廃止し、読むときに捨てる
export const legacyProfileSchema = profileSchema.extend({
  displayName: z.string().optional(),
  logo: z.string().optional(),
  illustration: z.string().optional(),
  theme: themeName.optional(),
  colors: z
    .strictObject({
      primary: hexColor,
      text: hexColor,
      muted: hexColor,
      bg: hexColor,
      surface: hexColor,
      tint: hexColor,
    })
    .optional(),
});

export type LegacyProfile = z.infer<typeof legacyProfileSchema>;

// 旧形式も読めるようにする。theme と色は捨てず、移行(migrateProfile)が書き出す。displayName・logo・illustration は捨てる
export const parseProfile = (
  input: unknown,
):
  | { success: true; profile: Profile }
  | { success: false; message: string } => {
  const current = profileSchema.safeParse(input);
  if (current.success) return { success: true, profile: current.data };
  const legacy = legacyProfileSchema.safeParse(input);
  if (!legacy.success)
    return { success: false, message: current.error.message };
  const {
    colors: _colors,
    theme: _theme,
    displayName: _displayName,
    logo: _logo,
    illustration: _illustration,
    ...profile
  } = legacy.data;
  return { success: true, profile };
};
