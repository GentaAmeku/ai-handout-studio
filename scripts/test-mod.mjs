#!/usr/bin/env node
// mods/ の Claude Code の mod を検査する(pnpm test:mod)。
// mod ごとに claude plugin validate と、mod のフォルダでの claude plugin test を走らせる。
// claude が無い・古いときは理由を出して飛ばす(CI には claude が無い)。
// 型の検査は、Claude Code が一度 mod を読み込んで .claude-plugin/types/ を書いたあとだけ回す
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// mod が正式に動く Claude Code の版(doctor の MOD_CLAUDE_VERSION と同じ)
const MIN_VERSION = "2.1.287";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const modsDir = join(repoRoot, "mods");

const isOlderThan = (version, minimum) => {
  const [have, need] = [version, minimum].map((text) =>
    text.split(".").map(Number),
  );
  const index = have.findIndex((part, i) => part !== need[i]);
  return index !== -1 && have[index] < need[index];
};

const run = (command, args, cwd) =>
  spawnSync(command, args, { cwd, stdio: "inherit" }).status ?? 1;

const claudeVersion = () => {
  const result = spawnSync("claude", ["--version"], { encoding: "utf8" });
  return result.error || result.status !== 0
    ? undefined
    : result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
};

// 1つの mod を順に検査し、最初に落ちたところで止める。通れば true
const checkMod = (name) => {
  const dir = join(modsDir, name);
  const tsc = join(repoRoot, "node_modules", ".bin", "tsc");
  const steps = [
    () => run("claude", ["plugin", "validate", dir], repoRoot),
    () => run("claude", ["plugin", "test"], dir),
    () => {
      if (existsSync(join(dir, ".claude-plugin", "types"))) {
        return run(tsc, ["-p", join(dir, "tsconfig.json")], repoRoot);
      }
      console.log(
        `test:mod: ${name} の型は、Claude Code が一度読み込むまで無いので、型の検査は飛ばす`,
      );
      return 0;
    },
  ];
  return steps.every((step) => step() === 0);
};

const main = () => {
  const version = claudeVersion();
  if (version === undefined) {
    console.log("test:mod: claude が PATH に無いので飛ばす");
    return 0;
  }
  if (isOlderThan(version, MIN_VERSION)) {
    console.log(
      `test:mod: Claude Code ${version} は ${MIN_VERSION} より古いので飛ばす`,
    );
    return 0;
  }
  const mods = readdirSync(modsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const failed = mods.filter((name) => !checkMod(name));
  if (failed.length > 0)
    console.error(`test:mod: 落ちた: ${failed.join(", ")}`);
  return failed.length === 0 ? 0 : 1;
};

process.exitCode = main();
