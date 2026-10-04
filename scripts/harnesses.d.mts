// harnesses.mjs の型。ai-handout-studio の TypeScript から呼ぶぶんだけ

export type HarnessId =
  | "claude"
  | "codex"
  | "opencode"
  | "gemini"
  | "cursor"
  | "grok";

export type SkillPlaceId = "agents" | "claude";

export type SkillPlace = { id: SkillPlaceId; dir: string };

export type Harness = {
  id: HarnessId;
  name: string;
  // 入っている印にする設定のフォルダ
  configDir: string;
  // セットアップ自身が configDir に置くもの。これだけのフォルダは入っている印にしない
  setupEntries: string[];
  skillPlace: SkillPlaceId;
  skillsDir: string;
  // 共通指示のファイル。ファイルで置けなければ null
  instructions: string | null;
  // instructions が無いときに代わりに読むファイル
  fallbackInstructions: string | null;
  // PATH の名前
  bin: string;
  // 非対話で動かす argv
  headless: (prompt: string) => string[];
  // 利用者がコピーして打つコマンド(依頼は引用済み。cd は含めない)
  interactive: (quotedPrompt: string) => string;
};

export type HarnessLookup = {
  home: string;
  env?: Record<string, string | undefined>;
};

export const skillPlacesOf: (home: string) => SkillPlace[];
export const harnessesOf: (options: HarnessLookup) => Harness[];
