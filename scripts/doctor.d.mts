// doctor.mjs の型。テストが TypeScript から呼ぶぶんだけ

export type DoctorStatus =
  | "ok"
  | "missing"
  | "outdated"
  | "skipped"
  | "warn"
  | "remaining";

export type DoctorCheck = {
  id: string;
  status: DoctorStatus;
  section: number;
  detail: string;
};

// 節ごとの進み具合(--checklist)。todo は止める項目、warn は伝える項目の id
export type DoctorSection = {
  section: number;
  title: string;
  done: boolean;
  todo: string[];
  warn: string[];
  // 節の項目が全部 skipped(断った共通指示など)
  skipped: boolean;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
  next: { section: number; reason: string } | null;
  sections: DoctorSection[];
  locale: "ja" | "en";
  // どちらのゲームブックか(SETUP.md か UNINSTALL.md)
  mode: "setup" | "uninstall";
};

export type DoctorContext = {
  repoRoot: string;
  home: string;
  workspaceRoot: string;
  env: Record<string, string | undefined>;
  platform: string;
  osRelease: string;
  nodeVersion: string;
  run: (
    command: string,
    args: string[],
  ) => { status: number | null; stdout: string } | undefined;
  findOnPath: (name: string) => string | undefined;
  chromiumPath: () => string | undefined;
  probeServer: () => Promise<"running" | "down" | "other">;
  serverRoot: () => string | undefined;
  serverLog: string;
};

export const decodeLsofName: (name: string) => string;
export const defaultContext: (
  overrides?: Partial<DoctorContext>,
) => DoctorContext;
export const runDoctor: (context?: DoctorContext) => Promise<DoctorResult>;
export const runUninstallDoctor: (
  context?: DoctorContext,
) => Promise<DoctorResult>;
export const formatDoctor: (result: DoctorResult) => string;
export const formatChecklist: (result: DoctorResult) => string;
export const main: (argv: string[]) => Promise<number>;
