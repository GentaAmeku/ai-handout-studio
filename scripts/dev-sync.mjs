#!/usr/bin/env node
// 開発サーバーを起こす前と git pull のあとに、要るときだけ依存を入れ直し、design/dist を作り直す。
// 前に入れた・作ったときの元のファイルの指紋を node_modules/.cache に残し、今の指紋と比べて決める。
// pnpm install の前にも動くよう、Node の標準だけで書く
//
//   node scripts/dev-sync.mjs                    pnpm dev と open・restart が起こす前に揃える
//   node scripts/dev-sync.mjs installed          prepare(pnpm install のあと)。指紋を残し、git のフックを置く
//   node scripts/dev-sync.mjs after-pull <hook>  git のフック。揃えたうえで、動いているサーバーを起こし直す
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultContext } from "./doctor.mjs";

const defaultRoot = fileURLToPath(new URL("..", import.meta.url));

// 入れ直すかを決める元。package.json の scripts を変えただけでは入れ直さない
const DEPS_INPUTS = ["pnpm-lock.yaml", "pnpm-workspace.yaml"];
// design build が読むコードの入口。ここから相対 import をたどる
const DESIGN_ENTRIES = [
  "app/server/design-build.ts",
  "app/server/design-registry.ts",
];
// design/ のうち、作ったもの(build が書く)
const DESIGN_OUTPUTS = /^(dist|samples)(\/|$)/;
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"'?]+)/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"];
const HOOKS = ["post-merge", "post-rewrite"];
const HOOK_MARK = "ai-handout-studio:dev-sync";
const LOG = "[ai-handout-studio]";

const readText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

const realpathOf = (path) => {
  try {
    return path === undefined ? undefined : realpathSync(path);
  } catch {
    return undefined;
  }
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const toPosix = (path) => path.split(sep).join("/");

// ファイルの名前と中身をまとめた指紋。無いファイルは中身を空として数える
const fingerprintOf = (repoRoot, files) =>
  [...new Set(files)]
    .map((file) => ({ file, name: toPosix(relative(repoRoot, file)) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .reduce(
      (hash, { file, name }) =>
        hash
          .update(name)
          .update("\0")
          .update(isFile(file) ? readFileSync(file) : "")
          .update("\0"),
      createHash("sha256"),
    )
    .digest("hex");

// file から相対 import でたどれるコード。型だけの import も数える(多めに作り直すぶんには困らない)
const collectImports = (file, seen) => {
  if (seen.has(file)) return seen;
  seen.add(file);
  [...(readText(file) ?? "").matchAll(IMPORT)]
    .map(([, spec]) =>
      EXTENSIONS.map((ext) => resolve(dirname(file), `${spec}${ext}`)).find(
        isFile,
      ),
    )
    .filter((path) => path !== undefined)
    .forEach((path) => {
      collectImports(path, seen);
    });
  return seen;
};

// design/ の元のファイル。.DS_Store のような隠しファイルは数えない
const designSources = (repoRoot) => {
  const designDir = join(repoRoot, "design");
  if (!existsSync(designDir)) return [];
  return readdirSync(designDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !DESIGN_OUTPUTS.test(toPosix(relative(designDir, path))));
};

export const depsFingerprint = (repoRoot = defaultRoot) =>
  fingerprintOf(
    repoRoot,
    DEPS_INPUTS.map((file) => join(repoRoot, file)),
  );

// design build の結果を決めるもの: design/ の JSON と CSS、見本を描くコード、同梱の書体(依存の版)
export const designFingerprint = (repoRoot = defaultRoot) =>
  fingerprintOf(repoRoot, [
    ...designSources(repoRoot),
    ...DESIGN_ENTRIES.flatMap((entry) => [
      ...collectImports(join(repoRoot, entry), new Set()),
    ]),
    join(repoRoot, "pnpm-lock.yaml"),
  ]);

const stampPath = (repoRoot, name) =>
  join(
    repoRoot,
    "node_modules",
    ".cache",
    "ai-handout-studio",
    `${name}.sha256`,
  );

const readStamp = (repoRoot, name) =>
  readText(stampPath(repoRoot, name))?.trim();

const writeStamp = (repoRoot, name, value) => {
  const path = stampPath(repoRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`);
};

export const markDepsInstalled = (repoRoot = defaultRoot) =>
  writeStamp(repoRoot, "deps", depsFingerprint(repoRoot));

// design build を終えたあとに呼ぶ。build が design/ の JSON を移すこともあるので、終えてから数える
export const markDesignBuilt = (repoRoot = defaultRoot) =>
  writeStamp(repoRoot, "design", designFingerprint(repoRoot));

export const depsStale = (repoRoot = defaultRoot) =>
  readStamp(repoRoot, "deps") !== depsFingerprint(repoRoot);

export const designStale = (repoRoot = defaultRoot) =>
  !existsSync(join(repoRoot, "design", "dist", "templates.json")) ||
  readStamp(repoRoot, "design") !== designFingerprint(repoRoot);

// 子プロセスの出力は stderr へ流す。open・restart の stdout(URL など)はエージェントが読む
const runCommand = (repoRoot, command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", 2, 2],
  });
  return result.error ? false : result.status === 0;
};

// 古くなっていれば依存を入れ直し、design/dist を作り直す。changed は何かしたか
export const syncDev = ({
  repoRoot = defaultRoot,
  run = runCommand,
  log = console.error,
} = {}) => {
  const deps = depsStale(repoRoot);
  if (deps) {
    log(`${LOG} 依存(pnpm-lock.yaml)が前に入れたときと違うので、入れ直す`);
    if (!run(repoRoot, "pnpm", ["install", "--frozen-lockfile"])) {
      return {
        success: false,
        message: `${LOG} 依存を入れ直せなかった。pnpm install を実行して、出力を確かめる`,
      };
    }
    markDepsInstalled(repoRoot);
  }
  // 入れ直すと prepare が作り直すので、ここで古いのはそれ以外のとき
  const design = designStale(repoRoot);
  if (design) {
    log(
      `${LOG} design/dist が design/ と見本を描くコードより古いので、作り直す`,
    );
    if (
      !run(repoRoot, process.execPath, [
        join(repoRoot, "scripts", "cli.mjs"),
        "design",
        "build",
      ])
    ) {
      return {
        success: false,
        message: `${LOG} design/dist を作り直せなかった。pnpm design:build を実行して、出力を確かめる`,
      };
    }
  }
  return { success: true, changed: deps || design };
};

const hookScript = `#!/bin/sh
# ${HOOK_MARK}: pnpm install(prepare)が置く。中身は scripts/dev-sync.mjs にある。
# pull のあと、要るときだけ依存と design/dist を作り直し、動いている開発サーバーを起こし直す
command -v node >/dev/null 2>&1 || exit 0
[ -f scripts/dev-sync.mjs ] || exit 0
exec node scripts/dev-sync.mjs after-pull "$(basename "$0")" "$@"
`;

const gitOutput = (repoRoot, args) => {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.error || result.status !== 0 ? undefined : result.stdout.trim();
};

// pull のあとに走る git のフックを置く。置かなかったものは、その理由を返す
export const installHooks = (repoRoot = defaultRoot) => {
  const hooksDir = gitOutput(repoRoot, ["rev-parse", "--git-path", "hooks"]);
  // git の clone でなければ(zip で落としたなど)置かない
  if (hooksDir === undefined) return [];
  // core.hooksPath はほかのリポジトリと共有していることがあるので、触らない
  if (gitOutput(repoRoot, ["config", "core.hooksPath"])) {
    return [
      "core.hooksPath が決めてあるので、git のフックは置かない。pull のあとは ai-handout-studio restart で揃える",
    ];
  }
  const dir = resolve(repoRoot, hooksDir);
  mkdirSync(dir, { recursive: true });
  return HOOKS.flatMap((hook) => {
    const path = join(dir, hook);
    const current = readText(path);
    if (current !== undefined && !current.includes(HOOK_MARK)) {
      return [
        `${hook} のフックはもうあるので置かない。pull のあとは ai-handout-studio restart で揃える`,
      ];
    }
    if (current !== hookScript) {
      writeFileSync(path, hookScript, { mode: 0o755 });
    }
    return [];
  });
};

const runInstalled = (repoRoot) => {
  markDepsInstalled(repoRoot);
  installHooks(repoRoot).forEach((note) => {
    console.error(`${LOG} ${note}`);
  });
  const synced = syncDev({ repoRoot });
  if (!synced.success) console.error(synced.message);
  return synced.success ? 0 : 1;
};

const runAfterPull = async (repoRoot, hook, kind) => {
  // post-rewrite は commit --amend でも呼ばれる。rebase(pull --rebase)のときだけ動く
  if (hook === "post-rewrite" && kind !== "rebase") return 0;
  // まだ pnpm install していない clone では何もしない(セットアップの節3で入れる)
  if (!existsSync(join(repoRoot, "node_modules", ".modules.yaml"))) return 0;
  // 5190 番のサーバーがこの clone のものかは、入れ直す前に確かめる(入れ直す間に落ちることがある)
  const context = defaultContext({ repoRoot });
  const running =
    (await context.probeServer()) === "running" &&
    realpathOf(context.serverRoot()) === realpathOf(repoRoot);
  const synced = syncDev({ repoRoot });
  if (!synced.success) {
    console.error(synced.message);
    return 1;
  }
  // サーバーのコード(app/server/)だけの変更は、Vite が自分で起こし直す
  if (!synced.changed || !running) return 0;
  console.error(`${LOG} 動いている開発サーバーを起こし直す`);
  const restarted = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "cli.mjs"), "restart"],
    { cwd: repoRoot, stdio: "inherit" },
  );
  return restarted.status ?? 1;
};

export const main = async (argv, repoRoot = defaultRoot) => {
  if (argv[0] === "installed") return runInstalled(repoRoot);
  if (argv[0] === "after-pull") {
    return runAfterPull(repoRoot, argv[1], argv[2]);
  }
  const synced = syncDev({ repoRoot });
  if (!synced.success) console.error(synced.message);
  return synced.success ? 0 : 1;
};

if (
  process.argv[1] &&
  realpathOf(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
