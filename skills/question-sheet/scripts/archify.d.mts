// archify.mjs の型。ai-handout-studio の TypeScript から呼ぶぶんだけ

export type ArchifyLookup = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  home?: string;
};

export const archifyInstall: string;
export const archifyHome: string;
export const installHint: string;
export const findArchify: (options?: ArchifyLookup) => string | null;
export const requireArchify: (options?: ArchifyLookup) => string;
