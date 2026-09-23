import { type ChildProcess, spawn as defaultSpawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentId, AgentRunStatus } from "../src/api/types.ts";
import { aiDir } from "./ai-requests.ts";
import { deckDir, fileStamp, hasCode, readTextIfExists } from "./workspace.ts";

// AI パネルからのエージェント起動(試作)。ファイル受け渡しは変えず、
// 「コマンドを写して端末で実行」の代わりにサーバーが CLI を起動する

export const AGENTS = ["claude", "codex", "grok"] as const;

export const isAgentId = (value: unknown): value is AgentId =>
  typeof value === "string" && (AGENTS as readonly string[]).includes(value);

const LOG_LIMIT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5000;

type RunState = AgentRunStatus["state"];

type RunRecord = {
  runId: string;
  deckId: string;
  requestId: string;
  agent: AgentId;
  command: string;
  state: RunState;
  exitCode?: number;
  message?: string;
  logTail: string;
  startedAt: string;
  updatedAt: string;
  deckHash: string;
};

export type StartRunResult =
  | { success: true; run: AgentRunStatus }
  | { success: false; status: 404 | 409; message: string };

export type SpawnFn = typeof defaultSpawn;
export type KillFn = (pid: number, signal: NodeJS.Signals) => void;

export type RunnerOptions = {
  repoRoot: string;
  workspaceRoot: string;
  now?: () => Date;
  timeoutMs?: number;
  spawnFn?: SpawnFn;
  killFn?: KillFn;
};

export type AgentRunner = {
  startRun: (
    deckId: string,
    requestId: string,
    agent: AgentId,
  ) => Promise<StartRunResult>;
  getRun: (runId: string) => AgentRunStatus | undefined;
  cancelRun: (runId: string) => AgentRunStatus | undefined;
  close: () => void;
};

const keepTail = (current: string, chunk: string): string =>
  `${current}${chunk}`.slice(-LOG_LIMIT);

const quoteArg = (arg: string): string =>
  /[\s'"]/.test(arg) ? `'${arg.replaceAll("'", `'\\''`)}'` : arg;

// 非対話の固定形だけを許す。正確なフラグは実機で確定する(試作)
const argvFor = (agent: AgentId, prompt: string): string[] =>
  agent === "claude"
    ? [
        "claude",
        "-p",
        prompt,
        "--allowedTools",
        "Read Write Edit Bash(pnpm deck:check *)",
      ]
    : agent === "codex"
      ? ["codex", "exec", prompt]
      : ["grok", prompt];

const deckJsonPath = (root: string, deckId: string): string =>
  join(deckDir(root, deckId), "deck.json");

const hashDeck = async (path: string): Promise<string | undefined> =>
  readFile(path)
    .then((bytes) => createHash("sha256").update(bytes).digest("hex"))
    .catch(() => undefined);

const toStatus = (record: RunRecord): AgentRunStatus => ({
  runId: record.runId,
  deckId: record.deckId,
  requestId: record.requestId,
  agent: record.agent,
  command: record.command,
  state: record.state,
  ...(record.exitCode === undefined ? {} : { exitCode: record.exitCode }),
  ...(record.message === undefined ? {} : { message: record.message }),
  ...(record.logTail === "" ? {} : { logTail: record.logTail }),
  startedAt: record.startedAt,
  updatedAt: record.updatedAt,
});

export const resolveTimeoutMs = (raw: string | undefined): number => {
  const parsed = Number(raw);
  return raw === undefined || !Number.isFinite(parsed) || parsed <= 0
    ? DEFAULT_TIMEOUT_MS
    : parsed;
};

export const createAgentRunner = ({
  repoRoot,
  workspaceRoot,
  now = () => new Date(),
  timeoutMs = resolveTimeoutMs(process.env.AI_HANDOUT_STUDIO_AGENT_TIMEOUT_MS),
  spawnFn = defaultSpawn,
  killFn = (pid, signal) => {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if (!hasCode(error, "ESRCH")) throw error;
    }
  },
}: RunnerOptions): AgentRunner => {
  const runs = new Map<string, RunRecord>();
  const children = new Map<string, ChildProcess>();
  const state: { activeRunId?: string } = {};

  const active = (): RunRecord | undefined =>
    state.activeRunId === undefined ? undefined : runs.get(state.activeRunId);

  const finish = (
    record: RunRecord,
    patch: Partial<Pick<RunRecord, "state" | "exitCode" | "message">>,
  ): void => {
    if (record.state !== "running") return;
    record.state = patch.state ?? record.state;
    record.exitCode = patch.exitCode;
    record.message = patch.message;
    record.updatedAt = now().toISOString();
    children.delete(record.runId);
    if (state.activeRunId === record.runId) state.activeRunId = undefined;
  };

  // 猶予後の SIGKILL は無条件に送る。終わっていれば ESRCH になるだけ
  const killGroup = (child: ChildProcess): void => {
    if (child.pid === undefined) return;
    const pid = child.pid;
    killFn(pid, "SIGTERM");
    const grace = setTimeout(() => {
      try {
        killFn(pid, "SIGKILL");
      } catch {
        // 終わっているか殺せない。run 自体は確定済みなので何もしない
      }
    }, KILL_GRACE_MS);
    grace.unref();
  };

  const startRun = async (
    deckId: string,
    requestId: string,
    agent: AgentId,
  ): Promise<StartRunResult> => {
    const busy = active();
    if (busy !== undefined) {
      return {
        success: false,
        status: 409,
        message:
          busy.requestId === requestId
            ? "この依頼のエージェントが実行中"
            : "ほかの依頼のエージェントが実行中",
      };
    }
    const requestPath = join(
      aiDir(workspaceRoot, deckId, requestId),
      "request.md",
    );
    if ((await readTextIfExists(requestPath)) === undefined) {
      return { success: false, status: 404, message: "依頼が見つからない" };
    }
    const deckHash = await hashDeck(deckJsonPath(workspaceRoot, deckId));
    if (deckHash === undefined) {
      return { success: false, status: 404, message: "資料が見つからない" };
    }
    const started = now();
    const runId = `${fileStamp(started)}-${randomUUID().slice(0, 8)}`;
    const prompt = `skills/ai-handout-studio/SKILL.md の編集案の手順に従い、${requestPath} の指示から patch.json を作ってください。`;
    const argv = argvFor(agent, prompt);
    const record: RunRecord = {
      runId,
      deckId,
      requestId,
      agent,
      command: argv.map(quoteArg).join(" "),
      state: "running",
      logTail: "",
      startedAt: started.toISOString(),
      updatedAt: started.toISOString(),
      deckHash,
    };
    runs.set(runId, record);
    state.activeRunId = runId;

    const child = spawnFn(argv[0] ?? agent, argv.slice(1), {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.set(runId, child);

    child.stdout?.on("data", (chunk: unknown) => {
      record.logTail = keepTail(record.logTail, String(chunk));
    });
    child.stderr?.on("data", (chunk: unknown) => {
      record.logTail = keepTail(record.logTail, String(chunk));
    });
    child.on("error", (error: Error) => {
      finish(record, {
        state: "failed",
        message: `エージェントを起動できない: ${error.message}`,
      });
    });
    child.on("close", (code: number | null) => {
      if (record.state !== "running") return;
      void hashDeck(deckJsonPath(workspaceRoot, deckId)).then((current) => {
        if (current !== record.deckHash) {
          finish(record, {
            state: "failed",
            exitCode: code ?? undefined,
            message: "deck.json が実行中に書き換えられている",
          });
          return;
        }
        finish(
          record,
          code === 0
            ? { state: "done", exitCode: 0, message: "終了しました" }
            : {
                state: "failed",
                exitCode: code ?? undefined,
                message:
                  code === null
                    ? "エージェントが異常終了しました"
                    : `エージェントが終了コード ${code} で終わりました`,
              },
        );
      });
    });

    const timer = setTimeout(() => {
      if (record.state !== "running") return;
      const childProcess = children.get(runId);
      finish(record, {
        state: "failed",
        message: "制限時間を超えたため停止しました",
      });
      if (childProcess) killGroup(childProcess);
    }, timeoutMs);
    timer.unref();

    return { success: true, run: toStatus(record) };
  };

  const getRun = (runId: string): AgentRunStatus | undefined => {
    const record = runs.get(runId);
    return record === undefined ? undefined : toStatus(record);
  };

  const cancelRun = (runId: string): AgentRunStatus | undefined => {
    const record = runs.get(runId);
    if (record === undefined) return undefined;
    if (record.state === "running") {
      record.state = "cancelled";
      record.message = "停止しました";
      record.updatedAt = now().toISOString();
      const child = children.get(runId);
      if (child) killGroup(child);
      children.delete(runId);
      if (state.activeRunId === runId) state.activeRunId = undefined;
    }
    return toStatus(record);
  };

  return {
    startRun,
    getRun,
    cancelRun,
    close: () => {
      if (state.activeRunId !== undefined) cancelRun(state.activeRunId);
    },
  };
};
