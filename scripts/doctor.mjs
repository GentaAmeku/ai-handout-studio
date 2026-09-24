#!/usr/bin/env node
// ai-handout-studio doctor。セットアップの状態を調べ、SETUP.md の次に読む節を返す。
// --uninstall なら、外すときに残っているものを調べ、UNINSTALL.md の次に読む節を返す。
// pnpm install の前にも動くよう、Node の標準だけで書く。何も書き換えない(直すのはエージェント)
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { homedir, release, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  archifyHome,
  archifyInstall,
  archifyUninstall,
  findArchify,
} from "../skills/question-sheet/scripts/archify.mjs";

const SKILLS = ["ai-handout-studio", "question-sheet"];
const FEATURES = [
  ["lan", "feature-lan"],
  ["imageGeneration", "feature-image-generation"],
  ["share", "feature-share"],
];
const START_MARKER = /<!-- ai-handout-studio:start v(\d+) -->/;
const START_TEXT = "<!-- ai-handout-studio:start";
const END_MARKER = "<!-- ai-handout-studio:end -->";
const DEV_ORIGIN = "http://127.0.0.1:5190";

const readText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

const realpathOf = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
};

const lstatOf = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
};

const isExecutable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// PATH から実行できるファイルを探す(which と同じ)
const findOnPathIn = (pathEnv) => (name) =>
  (pathEnv ?? "")
    .split(delimiter)
    .filter((dir) => dir !== "")
    .map((dir) => join(dir, name))
    .find((candidate) => existsSync(candidate) && isExecutable(candidate));

const runCommand = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
  });
  return result.error
    ? undefined
    : { status: result.status, stdout: (result.stdout ?? "").trim() };
};

// Playwright の Chromium の置き場。node_modules の playwright に聞く
const chromiumPathOf = (repoRoot) => {
  const result = runCommand(
    process.execPath,
    [
      "-e",
      "import('playwright').then((p) => process.stdout.write(p.chromium.executablePath()))",
    ],
    repoRoot,
  );
  return result?.status === 0 && result.stdout !== ""
    ? result.stdout
    : undefined;
};

const probeServer = async () => {
  try {
    const response = await fetch(`${DEV_ORIGIN}/api/decks`, {
      signal: AbortSignal.timeout(1000),
    });
    const body = await response.json().catch(() => undefined);
    return response.ok && Array.isArray(body) ? "running" : "other";
  } catch {
    return "down";
  }
};

// macOS の lsof は、表示できないバイト(非 ASCII のパスなど)を \xNN の形にエスケープして出す。
// バイト列に戻して UTF-8 として読み直す(ASCII だけのパスはそのまま変わらない)
export const decodeLsofName = (name) =>
  Buffer.from(
    name.replace(/\\x([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
    "latin1",
  ).toString("utf8");

// 5190 番で待ち受けているプロセスの作業フォルダ。サーバー(open・restart・pnpm dev)はリポジトリを作業フォルダにして起きる
const serverRootOf = () => {
  const listeners = runCommand("lsof", [
    "-ti",
    `tcp:${new URL(DEV_ORIGIN).port}`,
    "-sTCP:LISTEN",
  ]);
  const pid = listeners?.stdout
    .split("\n")
    .find((line) => /^\d+$/.test(line.trim()));
  if (pid === undefined) return undefined;
  const cwd = runCommand("lsof", ["-a", "-p", pid.trim(), "-d", "cwd", "-Fn"]);
  const name = cwd?.stdout
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  return name === undefined ? undefined : decodeLsofName(name);
};

const readProfile = (workspaceRoot) => {
  const path = join(workspaceRoot, "profile.json");
  const text = readText(path);
  if (text === undefined) return { state: "missing", path };
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object"
      ? { state: "ready", path, value }
      : { state: "invalid", path };
  } catch {
    return { state: "invalid", path };
  }
};

// 既定の調べ先。テストは同じ形のものを渡して差し替える
export const defaultContext = (overrides = {}) => {
  const repoRoot =
    overrides.repoRoot ?? fileURLToPath(new URL("..", import.meta.url));
  const env = overrides.env ?? process.env;
  return {
    repoRoot,
    home: homedir(),
    workspaceRoot:
      env.AI_HANDOUT_STUDIO_WORKSPACE ?? join(repoRoot, "workspace"),
    env,
    platform: process.platform,
    osRelease: release(),
    nodeVersion: process.versions.node,
    run: (command, args) => runCommand(command, args, repoRoot),
    findOnPath: findOnPathIn(env.PATH),
    chromiumPath: () => chromiumPathOf(repoRoot),
    probeServer,
    serverRoot: serverRootOf,
    // サーバーのログ。scripts/cli.ts が同じ場所に書く
    serverLog: join(tmpdir(), "ai-handout-studio-dev.log"),
    ...overrides,
  };
};

// 人が読む文の言語。設定の locale、無ければ LANG で決める
const localeOf = (profile, env) => {
  const locale = profile.state === "ready" ? profile.value.locale : undefined;
  if (locale === "ja" || locale === "en") return locale;
  return env.LANG?.startsWith("ja") ? "ja" : "en";
};

const check = (id, section, status, detail) => ({
  id,
  status,
  section,
  detail,
});

const majorOf = (version) => Number.parseInt(version.split(".")[0] ?? "", 10);

const versionOf = (text) => text.match(/\d+\.\d+\.\d+/)?.[0];

// 節2: 前提
const prerequisiteChecks = (ctx, t) => {
  const git = ctx.run("git", ["--version"]);
  const gitVersion = git?.status === 0 ? versionOf(git.stdout) : undefined;
  const nodeMajor = majorOf(ctx.nodeVersion);
  const pnpm = ctx.run("pnpm", ["--version"]);
  const pnpmVersion = pnpm?.status === 0 ? versionOf(pnpm.stdout) : undefined;
  const isWsl = /microsoft/i.test(ctx.osRelease);
  return [
    gitVersion
      ? check("git", 2, "ok", gitVersion)
      : check("git", 2, "missing", t("git が無い", "git is not installed")),
    nodeMajor >= 24
      ? check("node", 2, "ok", `v${ctx.nodeVersion}`)
      : check(
          "node",
          2,
          "outdated",
          t(
            `Node v${ctx.nodeVersion}。24 以上が要る`,
            `Node v${ctx.nodeVersion}; 24 or later is required`,
          ),
        ),
    pnpmVersion === undefined
      ? check("pnpm", 2, "missing", t("pnpm が無い", "pnpm is not installed"))
      : majorOf(pnpmVersion) >= 11
        ? check("pnpm", 2, "ok", pnpmVersion)
        : check(
            "pnpm",
            2,
            "outdated",
            t(
              `pnpm ${pnpmVersion}。11 以上が要る`,
              `pnpm ${pnpmVersion}; 11 or later is required`,
            ),
          ),
    ctx.platform === "darwin"
      ? check("os", 2, "ok", "macOS")
      : ctx.platform === "linux"
        ? check("os", 2, "ok", isWsl ? "Linux (WSL)" : "Linux")
        : check(
            "os",
            2,
            "missing",
            t(
              `${ctx.platform} では動かない。Windows は WSL の中で使う`,
              `${ctx.platform} is not supported. On Windows, use WSL`,
            ),
          ),
  ];
};

// 節3: 依存と見た目の生成物
const dependencyChecks = (ctx, t) => [
  existsSync(join(ctx.repoRoot, "node_modules", ".modules.yaml")) &&
  existsSync(join(ctx.repoRoot, "node_modules", "tsx"))
    ? check("dependencies", 3, "ok", "node_modules")
    : check(
        "dependencies",
        3,
        "missing",
        t(
          "node_modules が無い(pnpm install をまだ実行していない)",
          "node_modules is missing (pnpm install has not run)",
        ),
      ),
  existsSync(join(ctx.repoRoot, "design", "dist", "templates.json"))
    ? check("design-dist", 3, "ok", "design/dist")
    : check(
        "design-dist",
        3,
        "missing",
        t(
          "design/dist が無い(pnpm install の prepare が作る)",
          "design/dist is missing (created by the prepare step of pnpm install)",
        ),
      ),
];

// 節4: ブラウザー
const browserChecks = (ctx, t) => {
  const chromium = ctx.chromiumPath();
  return [
    chromium !== undefined && existsSync(chromium)
      ? check("chromium", 4, "ok", chromium)
      : check(
          "chromium",
          4,
          "missing",
          t(
            "Playwright の Chromium が無い",
            "Playwright's Chromium is not installed",
          ),
        ),
    ctx.findOnPath("lsof")
      ? check("lsof", 4, "ok", ctx.findOnPath("lsof"))
      : check("lsof", 4, "missing", t("lsof が無い", "lsof is not installed")),
  ];
};

// pnpm のグローバルの入口は sh の小さなスクリプトで、中に cli.mjs の場所を持つ。
// "$basedir/<相対パス>"(入口のフォルダから)と、cmd-shim-target= などの絶対パスの両方を読む
const shimTargets = (path) => {
  const text = readText(path) ?? "";
  return [
    ...[...text.matchAll(/"\$basedir\/([^"]*cli\.mjs)"/g)].map((found) =>
      resolve(dirname(path), found[1]),
    ),
    ...[...text.matchAll(/(?:^|["\s=])(\/[^"\s]*cli\.mjs)/gm)].map(
      (found) => found[1],
    ),
  ];
};

const commandPointsTo = (path, cliPath) => {
  const expected = realpathOf(cliPath);
  if (expected === undefined) return false;
  if (realpathOf(path) === expected) return true;
  return shimTargets(path).some((target) => realpathOf(target) === expected);
};

// 節5: コマンド
const commandCheck = (ctx, t) => {
  const found = ctx.findOnPath("ai-handout-studio");
  const cliPath = join(ctx.repoRoot, "scripts", "cli.mjs");
  if (found === undefined) {
    return check(
      "command",
      5,
      "missing",
      t("ai-handout-studio が PATH に無い", "ai-handout-studio is not on PATH"),
    );
  }
  return commandPointsTo(found, cliPath)
    ? check("command", 5, "ok", found)
    : check(
        "command",
        5,
        "outdated",
        t(
          `${found} がこのリポジトリの scripts/cli.mjs を指していない`,
          `${found} does not point to this repository's scripts/cli.mjs`,
        ),
      );
};

// 選んだエージェント。設定のフォルダがあるものだけを調べる
const agentsOf = (ctx) => [
  {
    id: "claude",
    name: "Claude Code",
    present: existsSync(join(ctx.home, ".claude")),
    skillsDir: join(ctx.home, ".claude", "skills"),
    instructions: join(ctx.home, ".claude", "CLAUDE.md"),
  },
  {
    id: "codex",
    name: "Codex CLI",
    present: existsSync(join(ctx.home, ".codex")),
    // Codex CLI は利用者のスキルを ~/.agents/skills から読む(symlink も辿る)
    skillsDir: join(ctx.home, ".agents", "skills"),
    instructions: join(ctx.home, ".codex", "AGENTS.md"),
  },
];

const skillProblem = (ctx, t, skillsDir, skill) => {
  const link = join(skillsDir, skill);
  const target = realpathOf(link);
  const expected = realpathOf(join(ctx.repoRoot, "skills", skill));
  const fix = t(
    `${join(ctx.repoRoot, "skills", skill)} への symlink に張り直す`,
    `relink it to ${join(ctx.repoRoot, "skills", skill)}`,
  );
  if (target === undefined) {
    return {
      status: "missing",
      text: t(`${link} が無い`, `${link} is missing`),
    };
  }
  if (target === expected) return undefined;
  // 質問票を移す前の古いリンク(スキルの置き場 → <リポジトリ>/skills)
  if (target === realpathOf(join(ctx.repoRoot, "skills"))) {
    return {
      status: "outdated",
      text: t(
        `${link} が古い場所(${join(ctx.repoRoot, "skills")})を指す。${fix}`,
        `${link} points to the old location (${join(ctx.repoRoot, "skills")}); ${fix}`,
      ),
    };
  }
  return {
    status: "outdated",
    text: t(
      `${link} が別の場所(${target})を指す。${fix}`,
      `${link} points elsewhere (${target}); ${fix}`,
    ),
  };
};

// 節6: スキル
const skillChecks = (ctx, t, agents) => {
  if (!agents.some((agent) => agent.present)) {
    return [
      check(
        "agent",
        6,
        "missing",
        t(
          "~/.claude も ~/.codex も無い。Claude Code か Codex CLI を入れて一度起動する",
          "Neither ~/.claude nor ~/.codex exists. Install Claude Code or Codex CLI and start it once",
        ),
      ),
    ];
  }
  return agents.map((agent) => {
    const id = `skills-${agent.id}`;
    if (!agent.present) {
      return check(
        id,
        6,
        "skipped",
        t(`${agent.name} は入っていない`, `${agent.name} is not set up`),
      );
    }
    const problems = SKILLS.map((skill) =>
      skillProblem(ctx, t, agent.skillsDir, skill),
    ).filter((problem) => problem !== undefined);
    if (problems.length === 0) {
      return check(id, 6, "ok", agent.skillsDir);
    }
    const status = problems.some((problem) => problem.status === "missing")
      ? "missing"
      : "outdated";
    return check(
      id,
      6,
      status,
      problems.map((problem) => problem.text).join(" / "),
    );
  });
};

// 節7: 言語と組織名
const profileChecks = (profile, t) => {
  if (profile.state === "invalid") {
    const detail = t(
      `${profile.path} が JSON として読めない`,
      `${profile.path} is not valid JSON`,
    );
    return [
      check("locale", 7, "missing", detail),
      check("org-name", 7, "missing", detail),
    ];
  }
  const value = profile.state === "ready" ? profile.value : {};
  return [
    value.locale === "ja" || value.locale === "en"
      ? check("locale", 7, "ok", value.locale)
      : check(
          "locale",
          7,
          "missing",
          t("言語(locale)が決まっていない", "locale is not set"),
        ),
    typeof value.orgName === "string"
      ? check("org-name", 7, "ok", value.orgName === "" ? "-" : value.orgName)
      : check(
          "org-name",
          7,
          "missing",
          t("組織名(orgName)が決まっていない", "orgName is not set"),
        ),
  ];
};

// 共通指示の段落の版(setup/agent-instructions.*.md の目印)
const currentInstructionsVersion = (repoRoot) => {
  const text = readText(join(repoRoot, "setup", "agent-instructions.en.md"));
  const version = text?.match(START_MARKER)?.[1];
  return version === undefined ? 1 : Number(version);
};

// 節8: 共通指示
const instructionChecks = (ctx, t, agents, profile) => {
  const declined =
    profile.state === "ready" && profile.value.agentInstructions === "declined";
  const current = currentInstructionsVersion(ctx.repoRoot);
  return agents
    .filter((agent) => agent.present)
    .map((agent) => {
      const id = `instructions-${agent.id}`;
      if (declined) {
        return check(
          id,
          8,
          "skipped",
          t(
            "共通指示への追記は断られている(agentInstructions: declined)",
            "Adding the instructions was declined (agentInstructions: declined)",
          ),
        );
      }
      const text = readText(agent.instructions) ?? "";
      const found = text.match(START_MARKER);
      if (found === null || !text.includes(END_MARKER)) {
        return check(
          id,
          8,
          "missing",
          t(
            `${agent.instructions} に ai-handout-studio の段落が無い`,
            `${agent.instructions} has no ai-handout-studio block`,
          ),
        );
      }
      const version = Number(found[1]);
      return version >= current
        ? check(id, 8, "ok", `v${version}`)
        : check(
            id,
            8,
            "outdated",
            t(
              `${agent.instructions} の段落が v${version}。v${current} に入れ替える`,
              `${agent.instructions} has v${version}; replace it with v${current}`,
            ),
          );
    });
};

// 節9: 任意の機能
const featureChecks = (ctx, t, agents, profile) => {
  const features =
    profile.state === "ready" &&
    profile.value.features !== null &&
    typeof profile.value.features === "object"
      ? profile.value.features
      : {};
  return FEATURES.map(([key, id]) => {
    const value = features[key];
    if (typeof value !== "boolean") {
      return check(
        id,
        9,
        "missing",
        t(`features.${key} が決まっていない`, `features.${key} is not decided`),
      );
    }
    if (
      key === "imageGeneration" &&
      value &&
      !ctx.findOnPath("codex") &&
      !ctx.findOnPath("agy")
    ) {
      return check(
        id,
        9,
        "warn",
        t(
          "オンだが codex も agy も PATH に無い",
          "enabled, but neither codex nor agy is on PATH",
        ),
      );
    }
    if (
      key === "share" &&
      value &&
      !agents.some((agent) => agent.id === "claude" && agent.present)
    ) {
      return check(
        id,
        9,
        "warn",
        t(
          "オンだが共有に使う Claude Code が無い",
          "enabled, but Claude Code (used for sharing) is not set up",
        ),
      );
    }
    return check(id, 9, "ok", String(value));
  });
};

// 節9: archify(別の作者のスキル)。入っていれば構成図などを資料に載せられる。
// 入れるかは利用者が決めるので、無くても止めない(warn)
const archifyCheck = (ctx, t) => {
  const found = findArchify({
    env: ctx.env,
    cwd: ctx.repoRoot,
    home: ctx.home,
  });
  return found
    ? check("archify", 9, "ok", found)
    : check(
        "archify",
        9,
        "warn",
        t(
          `archify が無い。入れると構成図・シーケンス図・データの流れ・状態の移り変わりの図を資料に載せられる。入れるなら(利用者の同意を取ってから): ${archifyInstall}(${archifyHome})`,
          `archify is not installed. With it, handouts can include architecture, sequence, data-flow and lifecycle diagrams. To install it (ask the user first): ${archifyInstall} (${archifyHome})`,
        ),
      );
};

// 節10: 起動。動いているサーバーがこのリポジトリのものかも見る(古い clone のサーバーを使わない)
const serverCheck = async (ctx, t) => {
  const state = await ctx.probeServer();
  if (state !== "running") {
    return check(
      "server",
      10,
      "missing",
      state === "other"
        ? t(
            "5190 番を ai-handout-studio 以外が使っている",
            "Port 5190 is used by something other than ai-handout-studio",
          )
        : t("サーバーが動いていない", "The server is not running"),
    );
  }
  const root = ctx.serverRoot();
  if (root === undefined) {
    return check(
      "server",
      10,
      "warn",
      t(
        `${DEV_ORIGIN} は動いているが、どのリポジトリのサーバーか確かめられない`,
        `${DEV_ORIGIN} is running, but its repository could not be determined`,
      ),
    );
  }
  return realpathOf(root) === realpathOf(ctx.repoRoot)
    ? check("server", 10, "ok", DEV_ORIGIN)
    : check(
        "server",
        10,
        "outdated",
        t(
          `5190 番のサーバーは別のリポジトリ(${root})のもの。ai-handout-studio restart で起こし直す`,
          `The server on port 5190 belongs to another repository (${root}); run ai-handout-studio restart`,
        ),
      );
};

// 節10: 同梱資料。入れると印(workspace/examples.json)が残る。
// 印が無いのは、サーバーが初めて起きたときにスライドか HTML 資料がもうあった場合で、
// 使い続けている人の workspace へ足すかは利用者が決めるので止めない(warn)
const examplesCheck = (ctx, t, server) => {
  if (server.status !== "ok" && server.status !== "warn") {
    return check(
      "examples",
      10,
      "skipped",
      t("サーバーが起きてから調べる", "Checked after the server is running"),
    );
  }
  return existsSync(join(ctx.workspaceRoot, "examples.json"))
    ? check("examples", 10, "ok", join(ctx.workspaceRoot, "examples.json"))
    : check(
        "examples",
        10,
        "warn",
        t(
          "同梱資料が入っていない。入れるなら ai-handout-studio examples",
          "The bundled handouts are not installed; to add them, run ai-handout-studio examples",
        ),
      );
};

// 最初に止まる項目の節を next で返す
const summarize = (checks, blocking) => {
  const first = checks.find((item) => blocking.has(item.status));
  return {
    ok: first === undefined,
    checks,
    next:
      first === undefined
        ? null
        : { section: first.section, reason: first.detail },
  };
};

// 項目を順に調べ、最初に合格しなかった項目の節を next で返す
export const runDoctor = async (context = defaultContext()) => {
  const profile = readProfile(context.workspaceRoot);
  const locale = localeOf(profile, context.env);
  const t = (ja, en) => (locale === "ja" ? ja : en);
  const agents = agentsOf(context);
  const checks = [
    ...prerequisiteChecks(context, t),
    ...dependencyChecks(context, t),
    ...browserChecks(context, t),
    commandCheck(context, t),
    ...skillChecks(context, t, agents),
    ...profileChecks(profile, t),
    ...instructionChecks(context, t, agents, profile),
    ...featureChecks(context, t, agents, profile),
    archifyCheck(context, t),
  ];
  const server = await serverCheck(context, t);
  return {
    ...summarize(
      [...checks, server, examplesCheck(context, t, server)],
      new Set(["missing", "outdated"]),
    ),
    locale,
    mode: "setup",
  };
};

// ここから doctor --uninstall。UNINSTALL.md の節ごとに、clone の外に残っているものを調べる。
// 外すのはこのリポジトリが置いたものだけ。別の clone や別のアプリのものは skipped にして残す

// 節2: サーバー
const uninstallServerCheck = (ctx, t, state, root) => {
  if (state === "down") {
    return check(
      "server",
      2,
      "ok",
      t("サーバーは動いていない", "The server is not running"),
    );
  }
  if (state === "other") {
    return check(
      "server",
      2,
      "skipped",
      t(
        "5190 番は ai-handout-studio 以外が使っている。触らない",
        "Port 5190 is used by something other than ai-handout-studio; leave it",
      ),
    );
  }
  if (root === undefined) {
    return check(
      "server",
      2,
      "warn",
      t(
        `${DEV_ORIGIN} は動いているが、どのリポジトリのサーバーか確かめられない。利用者に伝える`,
        `${DEV_ORIGIN} is running, but its repository could not be determined; tell the user`,
      ),
    );
  }
  return realpathOf(root) === realpathOf(ctx.repoRoot)
    ? check(
        "server",
        2,
        "remaining",
        t(
          `${DEV_ORIGIN} でこのリポジトリのサーバーが動いている`,
          `This repository's server is running on ${DEV_ORIGIN}`,
        ),
      )
    : check(
        "server",
        2,
        "skipped",
        t(
          `5190 番のサーバーは別のリポジトリ(${root})のもの。触らない`,
          `The server on port 5190 belongs to another repository (${root}); leave it`,
        ),
      );
};

// 節2: サーバーのログ。どの clone のサーバーも同じファイルに書くので、ほかのサーバーが動いていれば残す
const uninstallServerLogCheck = (ctx, t, state, server) => {
  if (!existsSync(ctx.serverLog)) {
    return check("server-log", 2, "ok", t("ログは無い", "No server log"));
  }
  return state === "running" && server.status !== "remaining"
    ? check(
        "server-log",
        2,
        "skipped",
        t(
          `${ctx.serverLog} は動いているサーバーが使っている`,
          `${ctx.serverLog} is in use by the running server`,
        ),
      )
    : check(
        "server-log",
        2,
        "remaining",
        t(`${ctx.serverLog} が残っている`, `${ctx.serverLog} is left`),
      );
};

// 目印のある行(1 始まり)
const markerLines = (text, marker) =>
  text
    .split("\n")
    .flatMap((line, index) => (line.includes(marker) ? [index + 1] : []));

// 段落の場所。start と end が順にそろっていれば範囲で、そろっていなければ目印の行を並べる
const blockPlace = (text, t) => {
  const starts = markerLines(text, START_TEXT);
  const ends = markerLines(text, END_MARKER);
  const paired =
    starts.length === ends.length &&
    starts.every((start, index) => start < ends[index]);
  if (paired) {
    return t(
      `${starts.map((start, index) => `${start}〜${ends[index]}`).join("・")} 行目`,
      `lines ${starts.map((start, index) => `${start}-${ends[index]}`).join(", ")}`,
    );
  }
  const lines = [...starts, ...ends].sort((a, b) => a - b);
  return t(
    `目印は ${lines.join("・")} 行目。start と end がそろっていない`,
    `markers on lines ${lines.join(", ")}; start and end do not pair up`,
  );
};

// 節3: 共通指示。symlink なら実体を読む
const uninstallInstructionChecks = (t, agents) =>
  agents.map((agent) => {
    const id = `instructions-${agent.id}`;
    const text = readText(agent.instructions);
    if (text === undefined) {
      return check(
        id,
        3,
        "ok",
        t(
          `${agent.instructions} は無い`,
          `${agent.instructions} does not exist`,
        ),
      );
    }
    if (!text.includes(START_TEXT) && !text.includes(END_MARKER)) {
      return check(
        id,
        3,
        "ok",
        t(
          `${agent.instructions} に ai-handout-studio の段落は無い`,
          `${agent.instructions} has no ai-handout-studio block`,
        ),
      );
    }
    return check(
      id,
      3,
      "remaining",
      t(
        `${agent.instructions} に ai-handout-studio の段落がある(${blockPlace(text, t)})`,
        `${agent.instructions} has an ai-handout-studio block (${blockPlace(text, t)})`,
      ),
    );
  });

// 見つけたものの status を1つにまとめる。1つでも残っていれば remaining
const worstOf = (items) =>
  ["remaining", "warn", "skipped"].find((status) =>
    items.some((item) => item.status === status),
  ) ?? "ok";

// スキルの置き場のもの。このリポジトリを指すリンクと、指す先の無いリンクを外す。
// 中身のあるフォルダ(セットアップはリンクしか置かない)と、別の場所を指すリンクは残す
const skillLeftover = (ctx, t, skillsDir, skill) => {
  const path = join(skillsDir, skill);
  const stat = lstatOf(path);
  if (stat === undefined) return undefined;
  if (!stat.isSymbolicLink()) {
    return {
      status: "skipped",
      text: t(
        `${path} はリンクではなくフォルダ。セットアップが置いたものではないので残す`,
        `${path} is a folder, not a link; setup did not put it there, so leave it`,
      ),
    };
  }
  const target = realpathOf(path);
  if (target === undefined) {
    return {
      status: "remaining",
      text: t(`${path}(指す先の無いリンク)`, `${path} (a broken link)`),
    };
  }
  const ours = [
    join(ctx.repoRoot, "skills", skill),
    join(ctx.repoRoot, "skills"),
  ].map(realpathOf);
  return ours.includes(target)
    ? {
        status: "remaining",
        text: t(
          `${path} がこのリポジトリを指す`,
          `${path} points to this repository`,
        ),
      }
    : {
        status: "skipped",
        text: t(
          `${path} は別の場所(${target})を指す。残す`,
          `${path} points elsewhere (${target}); leave it`,
        ),
      };
};

// 節4: スキル。設定のフォルダが無いエージェントも、リンクだけ残っていることがあるので調べる
const uninstallSkillChecks = (ctx, t, agents) =>
  agents.map((agent) => {
    const id = `skills-${agent.id}`;
    const found = SKILLS.map((skill) =>
      skillLeftover(ctx, t, agent.skillsDir, skill),
    ).filter((item) => item !== undefined);
    return found.length === 0
      ? check(
          id,
          4,
          "ok",
          t(
            `${agent.skillsDir} にスキルのリンクは無い`,
            `No skill links in ${agent.skillsDir}`,
          ),
        )
      : check(
          id,
          4,
          worstOf(found),
          found.map((item) => item.text).join(" / "),
        );
  });

// 節5: コマンド。PATH で見つかるものと、~/.local/bin のもの(PATH から外れていても)を調べる
const uninstallCommandCheck = (ctx, t) => {
  const cliPath = join(ctx.repoRoot, "scripts", "cli.mjs");
  const paths = [
    ...new Set([
      ctx.findOnPath("ai-handout-studio"),
      join(ctx.home, ".local", "bin", "ai-handout-studio"),
    ]),
  ].filter((path) => path !== undefined && lstatOf(path) !== undefined);
  const found = paths.map((path) => {
    const isLink = lstatOf(path)?.isSymbolicLink() === true;
    if (isLink && realpathOf(path) === undefined) {
      return {
        status: "remaining",
        text: t(`${path}(指す先の無いリンク)`, `${path} (a broken link)`),
      };
    }
    if (!commandPointsTo(path, cliPath)) {
      return {
        status: "skipped",
        text: t(
          `${path} はこのリポジトリを指していない。残す`,
          `${path} does not point to this repository; leave it`,
        ),
      };
    }
    return {
      status: "remaining",
      text: isLink
        ? t(`${path}(symlink)`, `${path} (symlink)`)
        : t(`${path}(pnpm のグローバルの入口)`, `${path} (pnpm global entry)`),
    };
  });
  return found.length === 0
    ? check(
        "command",
        5,
        "ok",
        t(
          "ai-handout-studio コマンドは無い",
          "No ai-handout-studio command is left",
        ),
      )
    : check(
        "command",
        5,
        worstOf(found),
        found.map((item) => item.text).join(" / "),
      );
};

// 節6: archify(別の作者のスキル)。外すかは利用者が決めるので止めない(warn)
const uninstallArchifyCheck = (ctx, t) => {
  const found = findArchify({
    env: ctx.env,
    cwd: ctx.repoRoot,
    home: ctx.home,
  });
  return found
    ? check(
        "archify",
        6,
        "warn",
        t(
          `archify が入っている(${found})。外すと決めたら: ${archifyUninstall}`,
          `archify is installed (${found}). If the user chose to remove it: ${archifyUninstall}`,
        ),
      )
    : check(
        "archify",
        6,
        "ok",
        t("archify は無い", "archify is not installed"),
      );
};

const countDirs = (path) => {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    ).length;
  } catch {
    return 0;
  }
};

// 節6: 利用者の資料。消すか移すかは利用者が決めるので止めない(warn)
const uninstallWorkspaceCheck = (ctx, t) => {
  if (!existsSync(ctx.workspaceRoot)) {
    return check(
      "workspace",
      6,
      "ok",
      t(`${ctx.workspaceRoot} は無い`, `${ctx.workspaceRoot} does not exist`),
    );
  }
  const [decks, documents, sheets] = ["decks", "documents", "sheets"].map(
    (dir) => countDirs(join(ctx.workspaceRoot, dir)),
  );
  return check(
    "workspace",
    6,
    "warn",
    t(
      `${ctx.workspaceRoot} に利用者の資料がある(スライド ${decks}・HTML 資料 ${documents}・質問票 ${sheets})。消すか移すかは利用者が決める`,
      `${ctx.workspaceRoot} holds the user's handouts (slides: ${decks}, HTML handouts: ${documents}, question sheets: ${sheets}). The user decides whether to delete or move them`,
    ),
  );
};

// 外すときに残っているものを節の順に調べ、最初に残っている項目の節を next で返す。
// ok は clone の外に何も残っていないこと。仕上げ(節6)は ok のあとに行う
export const runUninstallDoctor = async (context = defaultContext()) => {
  const profile = readProfile(context.workspaceRoot);
  const locale = localeOf(profile, context.env);
  const t = (ja, en) => (locale === "ja" ? ja : en);
  const agents = agentsOf(context);
  const state = await context.probeServer();
  const server = uninstallServerCheck(
    context,
    t,
    state,
    state === "running" ? context.serverRoot() : undefined,
  );
  const checks = [
    server,
    uninstallServerLogCheck(context, t, state, server),
    ...uninstallInstructionChecks(t, agents),
    ...uninstallSkillChecks(context, t, agents),
    uninstallCommandCheck(context, t),
    uninstallArchifyCheck(context, t),
    uninstallWorkspaceCheck(context, t),
  ];
  return {
    ...summarize(checks, new Set(["remaining"])),
    locale,
    mode: "uninstall",
  };
};

// 人が読む形
export const formatDoctor = (result) => {
  const ja = result.locale === "ja";
  const book = result.mode === "uninstall" ? "UNINSTALL" : "SETUP";
  const idWidth = Math.max(...result.checks.map((item) => item.id.length));
  const statusWidth = Math.max(
    8,
    ...result.checks.map((item) => item.status.length),
  );
  const lines = result.checks.map(
    (item) =>
      `${item.status.padEnd(statusWidth)} ${item.id.padEnd(idWidth)}  ${ja ? "節" : "section "}${item.section}  ${item.detail}`,
  );
  const done =
    result.mode === "uninstall"
      ? ja
        ? "ok: clone の外に置いたものは外れた。仕上げは UNINSTALL の節6"
        : "ok: nothing is left outside the clone; finish with UNINSTALL section 6"
      : ja
        ? "ok: セットアップは済んでいる"
        : "ok: setup is complete";
  const tail = result.next
    ? ja
      ? `次: ${book} の節${result.next.section}(${result.next.reason})`
      : `next: ${book} section ${result.next.section} (${result.next.reason})`
    : done;
  return [...lines, "", tail].join("\n");
};

export const main = async (argv) => {
  const result = argv.includes("--uninstall")
    ? await runUninstallDoctor()
    : await runDoctor();
  const { locale: _locale, mode: _mode, ...json } = result;
  console.log(
    argv.includes("--json")
      ? JSON.stringify(json, null, 2)
      : formatDoctor(result),
  );
  return result.ok ? 0 : 1;
};

if (
  process.argv[1] &&
  realpathOf(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
