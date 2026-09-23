// doctor.mjs の型。テストが TypeScript から呼ぶぶんだけ

export type DoctorStatus = "ok" | "missing" | "outdated" | "skipped" | "warn";

export type DoctorCheck = {
  id: string;
  status: DoctorStatus;
  section: number;
  detail: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
  next: { section: number; reason: string } | null;
  locale: "ja" | "en";
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
};

export const defaultContext: (
  overrides?: Partial<DoctorContext>,
) => DoctorContext;
export const runDoctor: (context?: DoctorContext) => Promise<DoctorResult>;
export const formatDoctor: (result: DoctorResult) => string;
export const main: (argv: string[]) => Promise<number>;
