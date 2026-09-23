import { z } from "zod";
import { themeName } from "./design.ts";

// 資料の言語。無ければ環境変数 LANG から決める(profile.ts の locale の読み出し)
export const localeName = z.enum(["ja", "en"]);
export type Locale = z.infer<typeof localeName>;

// 任意の機能。無ければ全部 false
export const featuresSchema = z.strictObject({
  lan: z.boolean().optional(),
  imageGeneration: z.boolean().optional(),
  share: z.boolean().optional(),
});
export type Features = z.infer<typeof featuresSchema>;

// 共通指示(~/.claude/CLAUDE.md など)へ段落を足すかどうか。断ったら declined を残し、doctor は以後聞かない
export const agentInstructionsName = z.enum(["ask", "declined"]);
export type AgentInstructions = z.infer<typeof agentInstructionsName>;

// 自分用の既定値。見た目はテーマ(design/themes/)と面ごとの選択(design/selection.json)が持つ
export const profileSchema = z.strictObject({
  orgName: z.string(),
  locale: localeName.optional(),
  features: featuresSchema.optional(),
  agentInstructions: agentInstructionsName.optional(),
});

export type Profile = z.infer<typeof profileSchema>;

// locale・features は既定値で埋めた形。`ai-handout-studio settings` が出す形と同じ
export type ResolvedSettings = {
  orgName: string;
  locale: Locale;
  features: Required<Features>;
  agentInstructions: AgentInstructions;
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
