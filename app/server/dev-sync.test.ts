// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  designStale,
  installHooks,
  markDepsInstalled,
  markDesignBuilt,
  syncDev,
} from "../../scripts/dev-sync.mjs";

// 一時の clone(design build が読む形だけを持つフォルダ)で確かめる

let repo: string;

const touch = (path: string, text = ""): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

const git = (...args: string[]): void => {
  spawnSync("git", args, { cwd: repo });
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "dev-sync-"));
  touch(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  touch(join(repo, "design", "tokens.json"), "{}");
  touch(join(repo, "design", "dist", "templates.json"), "{}");
  touch(join(repo, "design", "samples", "slide.html"), "<p>見本</p>");
  touch(
    join(repo, "app", "server", "design-build.ts"),
    'import { render } from "./sample.ts";\nimport type { Slide } from "../src/schema";\n',
  );
  touch(join(repo, "app", "server", "design-registry.ts"), "");
  touch(join(repo, "app", "server", "sample.ts"), "export const render = 1;");
  touch(join(repo, "app", "src", "schema.ts"), "export type Slide = {};");
  touch(join(repo, "app", "server", "api.ts"), "export const api = 1;");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const append = (path: string): void => {
  writeFileSync(join(repo, path), `${readFileSync(join(repo, path))}\n`);
};

describe("designStale", () => {
  it("作ったあとは古くない", () => {
    expect(designStale(repo)).toBe(true);
    markDesignBuilt(repo);
    expect(designStale(repo)).toBe(false);
  });

  it.each([
    "design/tokens.json",
    "app/server/sample.ts",
    "app/src/schema.ts",
    "pnpm-lock.yaml",
  ])("%s が変われば古い", (path) => {
    markDesignBuilt(repo);
    append(path);
    expect(designStale(repo)).toBe(true);
  });

  it.each([
    "design/dist/templates.json",
    "design/samples/slide.html",
    "app/server/api.ts",
  ])("%s が変わっても古くない", (path) => {
    markDesignBuilt(repo);
    append(path);
    expect(designStale(repo)).toBe(false);
  });

  it("dist が無ければ古い", () => {
    markDesignBuilt(repo);
    rmSync(join(repo, "design", "dist"), { recursive: true });
    expect(designStale(repo)).toBe(true);
  });
});

describe("syncDev", () => {
  const record = () => {
    const calls: string[] = [];
    return {
      calls,
      run: (_root: string, command: string, args: string[]) => {
        calls.push([command, ...args].join(" "));
        return true;
      },
    };
  };

  it("揃っていれば何もしない", () => {
    markDepsInstalled(repo);
    markDesignBuilt(repo);
    const { calls, run } = record();
    expect(syncDev({ repoRoot: repo, run, log: () => {} })).toEqual({
      success: true,
      changed: false,
    });
    expect(calls).toEqual([]);
  });

  it("pnpm-lock.yaml が変われば入れ直し、design も作り直す", () => {
    markDepsInstalled(repo);
    markDesignBuilt(repo);
    append("pnpm-lock.yaml");
    const { calls, run } = record();
    expect(syncDev({ repoRoot: repo, run, log: () => {} })).toEqual({
      success: true,
      changed: true,
    });
    expect(calls[0]).toBe("pnpm install --frozen-lockfile");
    expect(calls[1]).toMatch(/cli\.mjs design build$/);
  });

  it("入れ直せなければ止める", () => {
    const result = syncDev({ repoRoot: repo, run: () => false, log: () => {} });
    expect(result.success).toBe(false);
  });
});

describe("installHooks", () => {
  const hookPath = (name: string) => join(repo, ".git", "hooks", name);

  it("git の clone でなければ置かない", () => {
    expect(installHooks(repo)).toEqual([]);
  });

  it("pull のあとに走るフックを置く", () => {
    git("init", "-q");
    expect(installHooks(repo)).toEqual([]);
    ["post-merge", "post-rewrite"].forEach((name) => {
      expect(readFileSync(hookPath(name), "utf8")).toContain(
        "scripts/dev-sync.mjs after-pull",
      );
      expect(statSync(hookPath(name)).mode & 0o111).not.toBe(0);
    });
    // 置き直しても変わらない
    expect(installHooks(repo)).toEqual([]);
  });

  it("利用者のフックは上書きしない", () => {
    git("init", "-q");
    touch(hookPath("post-merge"), "#!/bin/sh\necho mine\n");
    expect(installHooks(repo)).toEqual([
      expect.stringContaining("post-merge のフックはもうある"),
    ]);
    expect(readFileSync(hookPath("post-merge"), "utf8")).toContain("mine");
  });

  it("core.hooksPath が決めてあれば置かない", () => {
    git("init", "-q");
    git("config", "core.hooksPath", ".husky");
    expect(installHooks(repo)).toEqual([
      expect.stringContaining("core.hooksPath"),
    ]);
  });
});
