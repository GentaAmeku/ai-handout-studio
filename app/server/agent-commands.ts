import { isAbsolute, relative } from "node:path";
import type { AgentCommands } from "../src/api/types.ts";

// エージェントへ渡すコマンドの組み立て。スライドと HTML 資料の編集案(パッチ)が共有する

export const displayPath = (repoRoot: string, path: string): string => {
  const fromRoot = relative(repoRoot, path);
  return fromRoot.startsWith("..") || isAbsolute(fromRoot) ? path : fromRoot;
};

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

// リポジトリの直下で実行する形にする。文面だけ差し替えて使い回す
export const agentCommandsFor = (
  repoRoot: string,
  instruction: string,
): AgentCommands => {
  const prompt = shellQuote(instruction);
  const cd = `cd ${shellQuote(repoRoot)}`;
  return {
    claude: `${cd} && claude ${prompt}`,
    codex: `${cd} && codex ${prompt}`,
    grok: `${cd} && grok ${prompt}`,
  };
};
