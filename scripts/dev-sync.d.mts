// dev-sync.mjs の型。scripts/cli.ts とテストが TypeScript から呼ぶぶんだけ

export type SyncResult =
  | { success: true; changed: boolean }
  | { success: false; message: string };

export declare const depsFingerprint: (repoRoot?: string) => string;
export declare const designFingerprint: (repoRoot?: string) => string;
export declare const markDepsInstalled: (repoRoot?: string) => void;
export declare const markDesignBuilt: (repoRoot?: string) => void;
export declare const depsStale: (repoRoot?: string) => boolean;
export declare const designStale: (repoRoot?: string) => boolean;
export declare const syncDev: (options?: {
  repoRoot?: string;
  run?: (repoRoot: string, command: string, args: string[]) => boolean;
  log?: (message: string) => void;
}) => SyncResult;
export declare const installHooks: (repoRoot?: string) => string[];
export declare const main: (
  argv: readonly string[],
  repoRoot?: string,
) => Promise<number>;
