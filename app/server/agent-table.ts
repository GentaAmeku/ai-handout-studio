import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { type Harness, harnessesOf } from "../../scripts/harnesses.mjs";
import type { AgentId, AgentInfo } from "../src/api/types.ts";

// AI パネルのエージェントは、ハーネスの表(scripts/harnesses.mjs)から引く

export const agentHarnesses = (): Harness[] =>
  harnessesOf({ home: homedir(), env: process.env });

export const AGENTS: readonly AgentId[] = agentHarnesses().map(
  (harness) => harness.id,
);

export const isAgentId = (value: unknown): value is AgentId =>
  typeof value === "string" && (AGENTS as readonly string[]).includes(value);

export const harnessFor = (agent: AgentId): Harness | undefined =>
  agentHarnesses().find((harness) => harness.id === agent);

const isExecutable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// PATH にある bin だけを返す。画面の選択肢とコピー用のコマンドはこれだけ出す
export const installedAgents = (
  pathEnv: string | undefined = process.env.PATH,
): AgentInfo[] => {
  const dirs = (pathEnv ?? "").split(delimiter).filter((dir) => dir !== "");
  return agentHarnesses()
    .filter((harness) =>
      dirs.some((dir) => isExecutable(join(dir, harness.bin))),
    )
    .map((harness) => ({ id: harness.id, label: harness.name }));
};
