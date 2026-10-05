// @vitest-environment node
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DoctorContext,
  type DoctorResult,
  decodeLsofName,
  formatDoctor,
  runDoctor,
  runUninstallDoctor,
} from "../../scripts/doctor.mjs";

// doctor は一時のホームと一時の clone(リポジトリの形だけを持つフォルダ)で確かめる

const realRepo = fileURLToPath(new URL("../..", import.meta.url));

let root: string;
let repo: string;
let home: string;
let workspace: string;
let bin: string;

const touch = (path: string, text = ""): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

// clone した直後のリポジトリ(pnpm install の前)
const makeClone = (): void => {
  touch(join(repo, "scripts", "cli.mjs"), "#!/usr/bin/env node\n");
  touch(join(repo, "skills", "ai-handout-studio", "SKILL.md"));
  touch(join(repo, "skills", "question-sheet", "SKILL.md"));
  ["ja", "en"].forEach((locale) => {
    const name = `agent-instructions.${locale}.md`;
    mkdirSync(join(repo, "setup"), { recursive: true });
    copyFileSync(join(realRepo, "setup", name), join(repo, "setup", name));
  });
};

const install = (): void => {
  touch(join(repo, "node_modules", ".modules.yaml"));
  mkdirSync(join(repo, "node_modules", "tsx"), { recursive: true });
  touch(join(repo, "design", "dist", "templates.json"), "{}");
};

const linkCommand = (): void => {
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(repo, "scripts", "cli.mjs"), join(bin, "ai-handout-studio"));
};

const linkSkills = (skillsDir: string): void => {
  mkdirSync(skillsDir, { recursive: true });
  ["ai-handout-studio", "question-sheet"].forEach((skill) => {
    symlinkSync(join(repo, "skills", skill), join(skillsDir, skill));
  });
};

// Claude Code の mod(節9)。clone の mods/handout-watch を ~/.claude/skills へリンクする
const linkMod = (): void => {
  const source = join(repo, "mods", "handout-watch");
  touch(join(source, ".claude-plugin", "plugin.json"), "{}");
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(source, join(home, ".claude", "skills", "handout-watch"));
};

const writeProfile = (profile: object): void => {
  touch(join(workspace, "profile.json"), JSON.stringify(profile));
};

const instructionsBlock = (): string =>
  readFileSync(join(realRepo, "setup", "agent-instructions.en.md"), "utf8");

const DECIDED = {
  orgName: "",
  locale: "en",
  features: { lan: false, imageGeneration: false, share: false },
};

// ハーネスのほかはそろった環境
const makeBase = (): void => {
  makeClone();
  install();
  linkCommand();
  writeProfile(DECIDED);
  touch(join(workspace, "examples.json"), "{}");
};

// そろった環境。各テストはここから1つ崩す
const makeReady = (): void => {
  makeBase();
  mkdirSync(join(home, ".claude"), { recursive: true });
  linkSkills(join(home, ".claude", "skills"));
  touch(join(home, ".claude", "CLAUDE.md"), `# mine\n\n${instructionsBlock()}`);
};

const context = (overrides: Partial<DoctorContext> = {}): DoctorContext => ({
  repoRoot: repo,
  home,
  workspaceRoot: workspace,
  env: { LANG: "en_US.UTF-8" },
  platform: "linux",
  osRelease: "6.8.0",
  nodeVersion: "24.15.0",
  run: (command) =>
    command === "git"
      ? { status: 0, stdout: "git version 2.45.0" }
      : command === "pnpm"
        ? { status: 0, stdout: "11.9.0" }
        : undefined,
  findOnPath: (name) =>
    name === "lsof"
      ? "/usr/bin/lsof"
      : name === "ai-handout-studio"
        ? join(bin, "ai-handout-studio")
        : undefined,
  chromiumPath: () => join(repo, "scripts", "cli.mjs"),
  probeServer: async () => "running",
  serverRoot: () => repo,
  serverLog: join(root, "ai-handout-studio-dev.log"),
  ...overrides,
});

const statusOf = (result: DoctorResult, id: string) =>
  result.checks.find((item) => item.id === id)?.status;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doctor-"));
  repo = join(root, "clone");
  home = join(root, "home");
  workspace = join(repo, "workspace");
  bin = join(root, "bin");
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("doctor の next", () => {
  it("clone した直後は節3(依存)を返す", async () => {
    makeClone();
    const result = await runDoctor(context());
    expect(result.ok).toBe(false);
    expect(result.next?.section).toBe(3);
    expect(statusOf(result, "dependencies")).toBe("missing");
  });

  it("前提が足りなければ節2を先に返す", async () => {
    makeClone();
    const result = await runDoctor(context({ nodeVersion: "22.1.0" }));
    expect(result.next?.section).toBe(2);
    expect(statusOf(result, "node")).toBe("outdated");
  });

  it("pnpm が無ければ missing、Windows は WSL へ案内する", async () => {
    makeReady();
    const result = await runDoctor(
      context({ run: () => undefined, platform: "win32" }),
    );
    expect(statusOf(result, "git")).toBe("missing");
    expect(statusOf(result, "pnpm")).toBe("missing");
    expect(statusOf(result, "os")).toBe("missing");
    expect(result.next?.section).toBe(2);
  });

  it("WSL の Linux は通す", async () => {
    makeReady();
    const result = await runDoctor(
      context({ osRelease: "5.15.153.1-microsoft-standard-WSL2" }),
    );
    expect(result.checks.find((item) => item.id === "os")?.detail).toBe(
      "Linux (WSL)",
    );
  });

  it("そろっていれば ok で next は null", async () => {
    makeReady();
    const result = await runDoctor(context());
    expect(result.ok).toBe(true);
    expect(result.next).toBeNull();
    // ~/.agents/skills を読むハーネスが無ければ、その置き場は調べない
    expect(statusOf(result, "skills-agents")).toBe("skipped");
    expect(result.checks.some((item) => item.id === "instructions-codex")).toBe(
      false,
    );
  });

  it("最初に合格しなかった項目の節を返す(warn と skipped は止めない)", async () => {
    makeReady();
    writeProfile({
      ...DECIDED,
      features: { lan: false, imageGeneration: true, share: false },
    });
    const result = await runDoctor(
      context({ probeServer: async () => "down" }),
    );
    expect(statusOf(result, "feature-image-generation")).toBe("warn");
    expect(result.next).toEqual({
      section: 10,
      reason: "The server is not running",
    });
  });
});

describe("doctor の各項目", () => {
  it("Chromium と lsof が無ければ節4", async () => {
    makeClone();
    install();
    const result = await runDoctor(
      context({ chromiumPath: () => undefined, findOnPath: () => undefined }),
    );
    expect(statusOf(result, "chromium")).toBe("missing");
    expect(statusOf(result, "lsof")).toBe("missing");
    expect(result.next?.section).toBe(4);
  });

  it("コマンドが無ければ節5、別の場所を指せば outdated", async () => {
    makeReady();
    expect(
      (
        await runDoctor(
          context({
            findOnPath: (name) =>
              name === "ai-handout-studio" ? undefined : "/usr/bin/lsof",
          }),
        )
      ).next?.section,
    ).toBe(5);
    const other = join(root, "other-cli.mjs");
    touch(other);
    const result = await runDoctor(
      context({
        findOnPath: (name) =>
          name === "ai-handout-studio" ? other : "/usr/bin/lsof",
      }),
    );
    expect(statusOf(result, "command")).toBe("outdated");
  });

  it("pnpm link --global の入口(cli.mjs の場所を持つ sh)も、このリポジトリを指すとみなす", async () => {
    makeReady();
    const shim = join(root, "pnpm-home", "ai-handout-studio");
    touch(
      shim,
      `#!/bin/sh\nexec node "${join(repo, "scripts", "cli.mjs")}" "$@"\n`,
    );
    const result = await runDoctor(
      context({
        findOnPath: (name) =>
          name === "ai-handout-studio" ? shim : "/usr/bin/lsof",
      }),
    );
    expect(statusOf(result, "command")).toBe("ok");
  });

  it("pnpm 10 の入口(cli.mjs を入口からの相対パスで持つ sh)も、このリポジトリを指すとみなす", async () => {
    makeReady();
    const shim = join(root, "pnpm-home", "ai-handout-studio");
    touch(
      shim,
      `#!/bin/sh\nbasedir=$(dirname "$0")\nexec node  "$basedir/../clone/scripts/cli.mjs" "$@"\n`,
    );
    const result = await runDoctor(
      context({
        findOnPath: (name) =>
          name === "ai-handout-studio" ? shim : "/usr/bin/lsof",
      }),
    );
    expect(statusOf(result, "command")).toBe("ok");
  });

  it("エージェントの設定のフォルダが1つも無ければ節6", async () => {
    makeReady();
    rmSync(join(home, ".claude"), { recursive: true });
    const result = await runDoctor(context());
    expect(statusOf(result, "agent")).toBe("missing");
    expect(result.next?.section).toBe(6);
  });

  it("スキルのリンクが無ければ missing", async () => {
    makeReady();
    mkdirSync(join(home, ".codex"), { recursive: true });
    const result = await runDoctor(context());
    expect(statusOf(result, "skills-claude")).toBe("ok");
    expect(statusOf(result, "skills-agents")).toBe("missing");
    expect(result.next?.section).toBe(6);
  });

  it("古いリンク(置き場 → <リポジトリ>/skills)は outdated で、直し方を出す", async () => {
    makeReady();
    mkdirSync(join(home, ".codex"), { recursive: true });
    const skillsDir = join(home, ".agents", "skills");
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(join(repo, "skills"), join(skillsDir, "ai-handout-studio"));
    symlinkSync(
      join(repo, "skills", "question-sheet"),
      join(skillsDir, "question-sheet"),
    );
    const result = await runDoctor(context());
    const codex = result.checks.find((item) => item.id === "skills-agents");
    expect(codex?.status).toBe("outdated");
    expect(codex?.detail).toContain(join(repo, "skills", "ai-handout-studio"));
  });

  it("別の clone を指すスキルは outdated", async () => {
    makeReady();
    const elsewhere = join(root, "old-clone", "skills", "question-sheet");
    mkdirSync(elsewhere, { recursive: true });
    const link = join(home, ".claude", "skills", "question-sheet");
    rmSync(link);
    symlinkSync(elsewhere, link);
    const result = await runDoctor(context());
    expect(statusOf(result, "skills-claude")).toBe("outdated");
  });

  it("言語と組織名が決まっていなければ節7。features だけ決めても通らない", async () => {
    makeReady();
    writeProfile({ features: DECIDED.features });
    const result = await runDoctor(context());
    expect(statusOf(result, "locale")).toBe("missing");
    expect(statusOf(result, "org-name")).toBe("missing");
    expect(result.next?.section).toBe(7);
  });

  it("読めない profile.json は節7で止める", async () => {
    makeReady();
    touch(join(workspace, "profile.json"), "{");
    const result = await runDoctor(context());
    expect(result.next?.section).toBe(7);
  });

  it("共通指示の段落が無ければ節8、古い版は outdated", async () => {
    makeReady();
    touch(join(home, ".claude", "CLAUDE.md"), "# mine\n");
    expect((await runDoctor(context())).next?.section).toBe(8);
    touch(
      join(home, ".claude", "CLAUDE.md"),
      instructionsBlock().replace("start v1", "start v0"),
    );
    const result = await runDoctor(context());
    expect(statusOf(result, "instructions-claude")).toBe("outdated");
  });

  it("共通指示の段落は symlink の実体を読む", async () => {
    makeReady();
    const real = join(home, ".agents", "AGENTS.md");
    touch(real, instructionsBlock());
    rmSync(join(home, ".claude", "CLAUDE.md"));
    symlinkSync(real, join(home, ".claude", "CLAUDE.md"));
    expect(statusOf(await runDoctor(context()), "instructions-claude")).toBe(
      "ok",
    );
  });

  it("断った(agentInstructions: declined)なら以後は skipped", async () => {
    makeReady();
    touch(join(home, ".claude", "CLAUDE.md"), "# mine\n");
    writeProfile({ ...DECIDED, agentInstructions: "declined" });
    const result = await runDoctor(context());
    expect(statusOf(result, "instructions-claude")).toBe("skipped");
    expect(result.ok).toBe(true);
  });

  it("任意の機能が決まっていなければ節9", async () => {
    makeReady();
    writeProfile({ orgName: "", locale: "en", features: { lan: true } });
    const result = await runDoctor(context());
    expect(statusOf(result, "feature-lan")).toBe("ok");
    expect(statusOf(result, "feature-share")).toBe("missing");
    expect(result.next?.section).toBe(9);
  });

  it("archify が無ければ節9の warn で入れ方を出し(止めない)、あれば ok", async () => {
    makeReady();
    const without = await runDoctor(context());
    expect(statusOf(without, "archify")).toBe("warn");
    expect(
      without.checks.find((item) => item.id === "archify")?.detail,
    ).toContain("npx skills add tt-a1i/archify -g");
    expect(without.ok).toBe(true);

    const archify = join(home, ".agents", "skills", "archify");
    touch(join(archify, "SKILL.md"));
    touch(join(archify, "bin", "archify.mjs"));
    const withArchify = await runDoctor(context());
    expect(statusOf(withArchify, "archify")).toBe("ok");
  });

  it("Claude Code の mod が無ければ節9の warn で入れ方を出し(止めない)、あれば ok", async () => {
    makeReady();
    const without = await runDoctor(context());
    expect(statusOf(without, "mod-claude")).toBe("warn");
    const detail = without.checks.find(
      (item) => item.id === "mod-claude",
    )?.detail;
    expect(detail).toContain("handout-watch is not installed");
    expect(detail).toContain(
      `ln -sfn "${join(repo, "mods", "handout-watch")}" "${join(home, ".claude", "skills", "handout-watch")}"`,
    );
    expect(without.ok).toBe(true);

    linkMod();
    const withMod = await runDoctor(context());
    expect(statusOf(withMod, "mod-claude")).toBe("ok");
  });

  it("Claude Code が古ければ、mod が入っていても warn で版を伝える", async () => {
    makeReady();
    linkMod();
    const base = context();
    const result = await runDoctor(
      context({
        run: (command, args) =>
          command === "claude"
            ? { status: 0, stdout: "2.1.286 (Claude Code)" }
            : base.run(command, args),
      }),
    );
    expect(statusOf(result, "mod-claude")).toBe("warn");
    expect(
      result.checks.find((item) => item.id === "mod-claude")?.detail,
    ).toContain("Claude Code 2.1.286 may not run it (2.1.287 or later");

    const current = await runDoctor(
      context({
        run: (command, args) =>
          command === "claude"
            ? { status: 0, stdout: "2.1.289 (Claude Code)" }
            : base.run(command, args),
      }),
    );
    expect(statusOf(current, "mod-claude")).toBe("ok");
  });

  it("Claude Code が無ければ mod は聞かない(skipped)", async () => {
    makeBase();
    mkdirSync(join(home, ".codex"), { recursive: true });
    const result = await runDoctor(context());
    expect(statusOf(result, "mod-claude")).toBe("skipped");
  });

  it("mod の置き場がフォルダなら、入れ方を出さずに warn で利用者に聞かせる", async () => {
    makeReady();
    mkdirSync(join(home, ".claude", "skills", "handout-watch"));
    const result = await runDoctor(context());
    expect(statusOf(result, "mod-claude")).toBe("warn");
    const detail = result.checks.find(
      (item) => item.id === "mod-claude",
    )?.detail;
    expect(detail).toContain("is a folder, not a link");
    expect(detail).not.toContain("ln -sfn");
  });

  it("5190 番を別のものが使っていれば節10で知らせる", async () => {
    makeReady();
    const result = await runDoctor(
      context({ probeServer: async () => "other" }),
    );
    expect(result.next?.section).toBe(10);
    expect(result.next?.reason).toContain("5190");
  });

  it("5190 番のサーバーが別のリポジトリのものなら節10で outdated、確かめられなければ warn", async () => {
    makeReady();
    const other = join(root, "old-clone");
    mkdirSync(other, { recursive: true });
    const result = await runDoctor(context({ serverRoot: () => other }));
    expect(statusOf(result, "server")).toBe("outdated");
    expect(result.next?.section).toBe(10);
    expect(result.next?.reason).toContain("restart");
    const unknown = await runDoctor(context({ serverRoot: () => undefined }));
    expect(statusOf(unknown, "server")).toBe("warn");
    expect(unknown.ok).toBe(true);
  });

  it("lsof の \\xNN エスケープ(非 ASCII なパス)を UTF-8 に戻す。ASCII だけのパスはそのまま", () => {
    const escaped =
      "/Users/yumi/Documents/\\xe8\\xb3\\x87\\xe6\\x96\\x99\\xe4\\xbd\\x9c\\xe6\\x88\\x90/ai-handout-studio";
    expect(decodeLsofName(escaped)).toBe(
      "/Users/yumi/Documents/資料作成/ai-handout-studio",
    );
    expect(decodeLsofName("/Users/yumi/ai-handout-studio")).toBe(
      "/Users/yumi/ai-handout-studio",
    );
  });

  it("同梱資料の印が無ければ節10の warn で examples を案内し(止めない)、サーバーが動いていなければ調べない", async () => {
    makeReady();
    rmSync(join(workspace, "examples.json"));
    const result = await runDoctor(context());
    const examples = result.checks.find((item) => item.id === "examples");
    expect(examples?.status).toBe("warn");
    expect(examples?.detail).toContain("ai-handout-studio examples");
    expect(result.ok).toBe(true);
    const down = await runDoctor(context({ probeServer: async () => "down" }));
    expect(statusOf(down, "examples")).toBe("skipped");
  });
});

describe("doctor のハーネス", () => {
  const withBlock = (path: string): void =>
    touch(path, `# mine\n\n${instructionsBlock()}`);
  const idsOf = (result: DoctorResult, prefix: string) =>
    result.checks
      .filter((item) => item.id.startsWith(prefix))
      .map((item) => item.id);
  const detailOf = (result: DoctorResult, id: string) =>
    result.checks.find((item) => item.id === id)?.detail;

  it("どのハーネスも無ければ、表のフォルダと名前を挙げて節6", async () => {
    makeBase();
    const result = await runDoctor(context());
    expect(result.next?.section).toBe(6);
    const detail = detailOf(result, "agent") ?? "";
    [
      "~/.claude",
      "~/.codex",
      "~/.config/opencode",
      "~/.gemini",
      "~/.cursor",
      "~/.grok",
      "Claude Code",
      "Codex CLI",
      "OpenCode",
      "Gemini CLI",
      "Cursor CLI",
      "Grok CLI",
    ].forEach((word) => {
      expect(detail).toContain(word);
    });
  });

  it("Codex だけなら ~/.agents/skills と ~/.codex/AGENTS.md を調べる。$CODEX_HOME も読む", async () => {
    makeBase();
    mkdirSync(join(home, ".codex"), { recursive: true });
    linkSkills(join(home, ".agents", "skills"));
    expect((await runDoctor(context())).next?.section).toBe(8);
    withBlock(join(home, ".codex", "AGENTS.md"));
    const result = await runDoctor(context());
    expect(result.ok).toBe(true);
    expect(statusOf(result, "skills-agents")).toBe("ok");
    expect(statusOf(result, "skills-claude")).toBe("skipped");
    expect(idsOf(result, "instructions-")).toEqual(["instructions-codex"]);

    const codexHome = join(root, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    rmSync(join(home, ".codex"), { recursive: true });
    const moved = await runDoctor(
      context({ env: { LANG: "en_US.UTF-8", CODEX_HOME: codexHome } }),
    );
    expect(statusOf(moved, "instructions-codex")).toBe("missing");
    expect(detailOf(moved, "instructions-codex")).toContain(
      join(codexHome, "AGENTS.md"),
    );
  });

  it("OpenCode だけで自分の AGENTS.md も ~/.claude/CLAUDE.md も無ければ、自分の AGENTS.md に段落を求める($XDG_CONFIG_HOME も読む)", async () => {
    makeBase();
    const config = join(root, "xdg");
    mkdirSync(join(config, "opencode"), { recursive: true });
    linkSkills(join(home, ".agents", "skills"));
    const env = { LANG: "en_US.UTF-8", XDG_CONFIG_HOME: config };
    const result = await runDoctor(context({ env }));
    expect(statusOf(result, "skills-agents")).toBe("ok");
    expect(statusOf(result, "instructions-opencode")).toBe("missing");
    expect(detailOf(result, "instructions-opencode")).toContain(
      join(config, "opencode", "AGENTS.md"),
    );
    withBlock(join(config, "opencode", "AGENTS.md"));
    expect((await runDoctor(context({ env }))).ok).toBe(true);
  });

  it("OpenCode は自分の AGENTS.md が無ければ ~/.claude/CLAUDE.md の結果に従い、AGENTS.md を作らせない", async () => {
    makeBase();
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    linkSkills(join(home, ".agents", "skills"));
    linkSkills(join(home, ".claude", "skills"));
    touch(join(home, ".claude", "CLAUDE.md"), "# mine\n");
    const without = await runDoctor(context());
    expect(statusOf(without, "instructions-claude")).toBe("missing");
    expect(statusOf(without, "instructions-opencode")).toBe("missing");
    expect(detailOf(without, "instructions-opencode")).toContain(
      "same file as Claude Code",
    );
    expect(detailOf(without, "instructions-opencode")).toContain(
      "do not create it",
    );
    withBlock(join(home, ".claude", "CLAUDE.md"));
    const withIt = await runDoctor(context());
    expect(statusOf(withIt, "instructions-claude")).toBe("ok");
    expect(statusOf(withIt, "instructions-opencode")).toBe("ok");
    expect(withIt.ok).toBe(true);
  });

  it("Cursor だけなら共通指示は skipped で User Rules へ案内し、止めない", async () => {
    makeBase();
    mkdirSync(join(home, ".cursor"), { recursive: true });
    linkSkills(join(home, ".agents", "skills"));
    const result = await runDoctor(context());
    expect(result.ok).toBe(true);
    expect(statusOf(result, "instructions-cursor")).toBe("skipped");
    expect(detailOf(result, "instructions-cursor")).toContain("User Rules");
    expect(detailOf(result, "instructions-cursor")).toContain(
      "setup/agent-instructions.en.md",
    );
  });

  it("Grok だけなら ~/.claude/skills と ~/.grok/AGENTS.md を調べる。スキルのリンクだけの ~/.claude は Claude Code とみなさない", async () => {
    makeBase();
    mkdirSync(join(home, ".grok"), { recursive: true });
    const before = await runDoctor(context());
    expect(statusOf(before, "skills-claude")).toBe("missing");
    expect(statusOf(before, "skills-agents")).toBe("skipped");
    linkSkills(join(home, ".claude", "skills"));
    withBlock(join(home, ".grok", "AGENTS.md"));
    const result = await runDoctor(context());
    expect(result.ok).toBe(true);
    expect(idsOf(result, "instructions-")).toEqual(["instructions-grok"]);
  });

  it("全部入っていれば両方の置き場と、全ハーネスの共通指示を調べる", async () => {
    makeReady();
    [".codex", ".config/opencode", ".gemini", ".cursor", ".grok"].forEach(
      (dir) => {
        mkdirSync(join(home, dir), { recursive: true });
      },
    );
    linkSkills(join(home, ".agents", "skills"));
    const result = await runDoctor(context());
    expect(statusOf(result, "skills-agents")).toBe("ok");
    expect(statusOf(result, "skills-claude")).toBe("ok");
    expect(idsOf(result, "instructions-")).toEqual([
      "instructions-claude",
      "instructions-codex",
      "instructions-opencode",
      "instructions-gemini",
      "instructions-cursor",
      "instructions-grok",
    ]);
    expect(statusOf(result, "instructions-codex")).toBe("missing");
    expect(statusOf(result, "instructions-opencode")).toBe("ok");
    [".codex/AGENTS.md", ".gemini/GEMINI.md", ".grok/AGENTS.md"].forEach(
      (file) => {
        withBlock(join(home, file));
      },
    );
    expect((await runDoctor(context())).ok).toBe(true);
  });

  it("1枚を symlink で配っていれば、先に調べたハーネスと同じ結果にする", async () => {
    makeReady();
    [".codex", ".gemini", ".grok"].forEach((dir) => {
      mkdirSync(join(home, dir), { recursive: true });
    });
    linkSkills(join(home, ".agents", "skills"));
    const shared = join(home, ".agents", "AGENTS.md");
    touch(shared, "# mine\n");
    rmSync(join(home, ".claude", "CLAUDE.md"));
    [
      ".claude/CLAUDE.md",
      ".codex/AGENTS.md",
      ".gemini/GEMINI.md",
      ".grok/AGENTS.md",
    ].forEach((file) => {
      symlinkSync(shared, join(home, file));
    });
    const result = await runDoctor(context());
    expect(statusOf(result, "instructions-claude")).toBe("missing");
    expect(detailOf(result, "instructions-claude")).toContain(
      join(home, ".claude", "CLAUDE.md"),
    );
    ["codex", "gemini", "grok"].forEach((id) => {
      expect(statusOf(result, `instructions-${id}`)).toBe("missing");
      expect(detailOf(result, `instructions-${id}`)).toBe(
        "same file as Claude Code",
      );
    });
    withBlock(shared);
    expect((await runDoctor(context())).ok).toBe(true);
  });

  it("共有の確かめは表の claude で判定する", async () => {
    makeBase();
    mkdirSync(join(home, ".codex"), { recursive: true });
    linkSkills(join(home, ".agents", "skills"));
    withBlock(join(home, ".codex", "AGENTS.md"));
    writeProfile({
      ...DECIDED,
      features: { ...DECIDED.features, share: true },
    });
    expect(statusOf(await runDoctor(context()), "feature-share")).toBe("warn");
  });
});

describe("doctor --uninstall", () => {
  const detailOf = (result: DoctorResult, id: string) =>
    result.checks.find((item) => item.id === id)?.detail;

  // 外し終えた環境。clone と資料だけが残っている
  const makeUninstalled = (): void => {
    makeClone();
    install();
    writeProfile(DECIDED);
  };

  const down = (overrides: Partial<DoctorContext> = {}): DoctorContext =>
    context({
      probeServer: async () => "down",
      findOnPath: () => undefined,
      ...overrides,
    });

  it("入れたままなら、サーバーから順に残っているものを挙げ、節2を返す", async () => {
    makeReady();
    touch(join(root, "ai-handout-studio-dev.log"));
    const result = await runUninstallDoctor(context());
    expect(result.ok).toBe(false);
    expect(result.next?.section).toBe(2);
    expect(result.mode).toBe("uninstall");
    expect(statusOf(result, "server")).toBe("remaining");
    expect(statusOf(result, "server-log")).toBe("remaining");
    expect(statusOf(result, "instructions-claude")).toBe("remaining");
    expect(detailOf(result, "instructions-claude")).toContain("lines 3-7");
    expect(statusOf(result, "skills-claude")).toBe("remaining");
    expect(statusOf(result, "command")).toBe("remaining");
    expect(detailOf(result, "command")).toContain("(symlink)");
  });

  it("サーバーを止めてログを消せば、次は節3(共通指示)", async () => {
    makeReady();
    const result = await runUninstallDoctor(
      context({ probeServer: async () => "down" }),
    );
    expect(statusOf(result, "server")).toBe("ok");
    expect(statusOf(result, "server-log")).toBe("ok");
    expect(result.next?.section).toBe(3);
  });

  it("別のリポジトリのサーバーとそのログには触らない。5190 番が別のアプリなら、ログだけ外す", async () => {
    makeReady();
    touch(join(root, "ai-handout-studio-dev.log"));
    const other = join(root, "old-clone");
    mkdirSync(other, { recursive: true });
    const otherClone = await runUninstallDoctor(
      context({ serverRoot: () => other }),
    );
    expect(statusOf(otherClone, "server")).toBe("skipped");
    expect(statusOf(otherClone, "server-log")).toBe("skipped");
    expect(otherClone.next?.section).toBe(3);
    const otherApp = await runUninstallDoctor(
      context({ probeServer: async () => "other" }),
    );
    expect(statusOf(otherApp, "server")).toBe("skipped");
    expect(statusOf(otherApp, "server-log")).toBe("remaining");
    const unknown = await runUninstallDoctor(
      context({ serverRoot: () => undefined }),
    );
    expect(statusOf(unknown, "server")).toBe("warn");
    expect(unknown.next?.section).toBe(3);
  });

  it("共通指示は段落があれば remaining。symlink は実体を読み、目印がそろわなければ行を出す", async () => {
    makeUninstalled();
    const real = join(home, ".agents", "AGENTS.md");
    touch(real, `# mine\n${instructionsBlock()}\n# after\n`);
    mkdirSync(join(home, ".claude"), { recursive: true });
    symlinkSync(real, join(home, ".claude", "CLAUDE.md"));
    touch(
      join(home, ".codex", "AGENTS.md"),
      "# mine\n<!-- ai-handout-studio:start v1 -->\n- left over\n",
    );
    const result = await runUninstallDoctor(down());
    expect(result.next?.section).toBe(3);
    expect(detailOf(result, "instructions-claude")).toContain("lines 2-6");
    expect(statusOf(result, "instructions-codex")).toBe("remaining");
    expect(detailOf(result, "instructions-codex")).toContain(
      "start and end do not pair up",
    );
    touch(real, "# mine\n# after\n");
    touch(join(home, ".codex", "AGENTS.md"), "# mine\n");
    const cleaned = await runUninstallDoctor(down());
    expect(statusOf(cleaned, "instructions-claude")).toBe("ok");
    expect(statusOf(cleaned, "instructions-codex")).toBe("ok");
    expect(cleaned.ok).toBe(true);
  });

  it("共通指示は全ハーネスのファイルを調べ、同じ実体は同じ結果にする。Cursor は入っていれば User Rules を伝える", async () => {
    makeUninstalled();
    const shared = join(home, ".agents", "AGENTS.md");
    touch(shared, `# mine\n${instructionsBlock()}`);
    mkdirSync(join(home, ".codex"), { recursive: true });
    symlinkSync(shared, join(home, ".codex", "AGENTS.md"));
    touch(join(home, ".config", "opencode", "AGENTS.md"), instructionsBlock());
    touch(join(home, ".gemini", "GEMINI.md"), instructionsBlock());
    touch(join(home, ".grok", "AGENTS.md"), instructionsBlock());
    const result = await runUninstallDoctor(down());
    expect(
      result.checks
        .filter((item) => item.id.startsWith("instructions-"))
        .map((item) => item.id),
    ).toEqual([
      "instructions-claude",
      "instructions-codex",
      "instructions-opencode",
      "instructions-gemini",
      "instructions-grok",
    ]);
    expect(statusOf(result, "instructions-claude")).toBe("ok");
    ["codex", "opencode", "gemini", "grok"].forEach((id) => {
      expect(statusOf(result, `instructions-${id}`)).toBe("remaining");
    });

    mkdirSync(join(home, ".claude"), { recursive: true });
    symlinkSync(shared, join(home, ".claude", "CLAUDE.md"));
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const linked = await runUninstallDoctor(down());
    expect(statusOf(linked, "instructions-claude")).toBe("remaining");
    expect(statusOf(linked, "instructions-codex")).toBe("remaining");
    expect(detailOf(linked, "instructions-codex")).toBe(
      "same file as Claude Code",
    );
    expect(statusOf(linked, "instructions-cursor")).toBe("warn");
    expect(detailOf(linked, "instructions-cursor")).toContain("User Rules");
  });

  it("スキルは、このリポジトリを指すリンクと指す先の無いリンクを外し、別の clone のリンクとフォルダは残す", async () => {
    makeUninstalled();
    linkSkills(join(home, ".agents", "skills"));
    const result = await runUninstallDoctor(down());
    expect(statusOf(result, "skills-claude")).toBe("ok");
    expect(statusOf(result, "skills-agents")).toBe("remaining");
    expect(result.next?.section).toBe(4);

    const skillsDir = join(home, ".claude", "skills");
    const elsewhere = join(root, "old-clone", "skills", "ai-handout-studio");
    mkdirSync(elsewhere, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });
    symlinkSync(elsewhere, join(skillsDir, "ai-handout-studio"));
    mkdirSync(join(skillsDir, "question-sheet"));
    rmSync(join(home, ".agents", "skills", "question-sheet"));
    symlinkSync(
      join(root, "gone", "question-sheet"),
      join(home, ".agents", "skills", "question-sheet"),
    );
    rmSync(join(home, ".agents", "skills", "ai-handout-studio"));
    const mixed = await runUninstallDoctor(down());
    expect(statusOf(mixed, "skills-claude")).toBe("skipped");
    expect(statusOf(mixed, "skills-agents")).toBe("remaining");
    expect(detailOf(mixed, "skills-agents")).toContain("a broken link");
  });

  it("Claude Code の mod のリンクも節4で外し、別の clone のものは残す", async () => {
    makeUninstalled();
    linkMod();
    const linked = await runUninstallDoctor(down());
    expect(statusOf(linked, "skills-claude")).toBe("remaining");
    expect(detailOf(linked, "skills-claude")).toContain(
      `${join(home, ".claude", "skills", "handout-watch")} points to this repository`,
    );
    expect(linked.next?.section).toBe(4);

    const link = join(home, ".claude", "skills", "handout-watch");
    rmSync(link);
    const elsewhere = join(root, "old-clone", "mods", "handout-watch");
    mkdirSync(elsewhere, { recursive: true });
    symlinkSync(elsewhere, link);
    const other = await runUninstallDoctor(down());
    expect(statusOf(other, "skills-claude")).toBe("skipped");
  });

  it("コマンドは PATH に無くても ~/.local/bin のリンクを見つけ、pnpm の入口も外す。別の clone のものは残す", async () => {
    makeUninstalled();
    const local = join(home, ".local", "bin", "ai-handout-studio");
    mkdirSync(join(local, ".."), { recursive: true });
    symlinkSync(join(repo, "scripts", "cli.mjs"), local);
    const linked = await runUninstallDoctor(down());
    expect(statusOf(linked, "command")).toBe("remaining");
    expect(linked.next?.section).toBe(5);

    rmSync(local);
    const shim = join(root, "pnpm-home", "bin", "ai-handout-studio");
    touch(
      shim,
      `#!/bin/sh\nexec node  "$basedir/../../clone/scripts/cli.mjs" "$@"\n`,
    );
    const pnpm = await runUninstallDoctor(
      down({
        findOnPath: (name) => (name === "ai-handout-studio" ? shim : undefined),
      }),
    );
    expect(statusOf(pnpm, "command")).toBe("remaining");
    expect(detailOf(pnpm, "command")).toContain("pnpm global entry");

    const other = join(root, "old-clone", "scripts", "cli.mjs");
    touch(other);
    symlinkSync(other, local);
    const otherClone = await runUninstallDoctor(down());
    expect(statusOf(otherClone, "command")).toBe("skipped");
    expect(otherClone.ok).toBe(true);
  });

  it("clone の外に何も無ければ ok。archify と資料は warn で伝え、止めない", async () => {
    makeUninstalled();
    mkdirSync(join(workspace, "decks", "deck_1"), { recursive: true });
    mkdirSync(join(workspace, "documents", "doc_1"), { recursive: true });
    mkdirSync(join(workspace, "documents", "doc_2"), { recursive: true });
    const archify = join(home, ".agents", "skills", "archify");
    touch(join(archify, "SKILL.md"));
    touch(join(archify, "bin", "archify.mjs"));
    const result = await runUninstallDoctor(down());
    expect(result.ok).toBe(true);
    expect(result.next).toBeNull();
    expect(statusOf(result, "archify")).toBe("warn");
    expect(detailOf(result, "archify")).toContain(
      "npx skills remove archify archify-review -g -y",
    );
    expect(statusOf(result, "workspace")).toBe("warn");
    expect(detailOf(result, "workspace")).toContain(
      "slides: 1, HTML handouts: 2, question sheets: 0",
    );
  });

  it("人が読む形は UNINSTALL の節を出す", async () => {
    makeReady();
    writeProfile({ ...DECIDED, locale: "ja" });
    expect(formatDoctor(await runUninstallDoctor(context()))).toContain(
      "次: UNINSTALL の節2",
    );
    rmSync(join(home, ".claude"), { recursive: true });
    const done = await runUninstallDoctor(down());
    expect(formatDoctor(done)).toContain("仕上げは UNINSTALL の節6");
  });
});

describe("doctor の文", () => {
  it("設定の locale が ja なら日本語で、人が読む形は次の節を出す", async () => {
    makeClone();
    writeProfile({ orgName: "", locale: "ja" });
    const result = await runDoctor(context());
    expect(result.locale).toBe("ja");
    expect(formatDoctor(result)).toContain("次: SETUP の節3");
  });

  it("共通指示の段落は日英で同じ版の目印を持つ", () => {
    const markers = ["ja", "en"].map((locale) => {
      const text = readFileSync(
        join(realRepo, "setup", `agent-instructions.${locale}.md`),
        "utf8",
      );
      expect(text.trim().endsWith("<!-- ai-handout-studio:end -->")).toBe(true);
      return text.match(/<!-- ai-handout-studio:start (v\d+) -->/)?.[1];
    });
    expect(markers).toEqual(["v1", "v1"]);
  });
});
