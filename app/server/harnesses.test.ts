// @vitest-environment node
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { harnessesOf, skillPlacesOf } from "../../scripts/harnesses.mjs";

const home = "/home/me";

describe("ハーネスの表", () => {
  it("6つのハーネスを、設定のフォルダ・スキルの置き場・共通指示のファイルとともに持つ", () => {
    const rows = harnessesOf({ home });
    expect(
      rows.map((row) => [
        row.id,
        row.configDir,
        row.skillsDir,
        row.instructions,
      ]),
    ).toEqual([
      [
        "claude",
        join(home, ".claude"),
        join(home, ".claude", "skills"),
        join(home, ".claude", "CLAUDE.md"),
      ],
      [
        "codex",
        join(home, ".codex"),
        join(home, ".agents", "skills"),
        join(home, ".codex", "AGENTS.md"),
      ],
      [
        "opencode",
        join(home, ".config", "opencode"),
        join(home, ".agents", "skills"),
        join(home, ".config", "opencode", "AGENTS.md"),
      ],
      [
        "gemini",
        join(home, ".gemini"),
        join(home, ".agents", "skills"),
        join(home, ".gemini", "GEMINI.md"),
      ],
      ["cursor", join(home, ".cursor"), join(home, ".agents", "skills"), null],
      [
        "grok",
        join(home, ".grok"),
        join(home, ".claude", "skills"),
        join(home, ".grok", "AGENTS.md"),
      ],
    ]);
    expect(
      rows.find((row) => row.id === "opencode")?.fallbackInstructions,
    ).toBe(join(home, ".claude", "CLAUDE.md"));
    expect(skillPlacesOf(home).map((place) => place.id)).toEqual([
      "agents",
      "claude",
    ]);
  });

  it("$CODEX_HOME と $XDG_CONFIG_HOME を読み、空なら既定に戻す", () => {
    const moved = harnessesOf({
      home,
      env: { CODEX_HOME: "/codex", XDG_CONFIG_HOME: "/xdg" },
    });
    expect(moved.find((row) => row.id === "codex")?.instructions).toBe(
      join("/codex", "AGENTS.md"),
    );
    expect(moved.find((row) => row.id === "opencode")?.configDir).toBe(
      join("/xdg", "opencode"),
    );
    const empty = harnessesOf({
      home,
      env: { CODEX_HOME: "", XDG_CONFIG_HOME: "" },
    });
    expect(empty.find((row) => row.id === "codex")?.configDir).toBe(
      join(home, ".codex"),
    );
  });

  it("非対話の argv とコピー用のコマンドを組み立てる", () => {
    const rows = harnessesOf({ home });
    const byId = (id: string) => rows.find((row) => row.id === id);
    expect(byId("claude")?.headless("x")).toEqual([
      "claude",
      "-p",
      "x",
      "--allowedTools",
      "Read Write Edit Bash(pnpm deck:check *)",
    ]);
    expect(byId("codex")?.headless("x")).toEqual([
      "codex",
      "exec",
      "-s",
      "workspace-write",
      "x",
    ]);
    expect(byId("opencode")?.headless("x")).toEqual(["opencode", "run", "x"]);
    expect(byId("gemini")?.headless("x")).toEqual([
      "gemini",
      "-p",
      "x",
      "--approval-mode",
      "auto_edit",
    ]);
    expect(byId("cursor")?.headless("x")).toEqual(["cursor-agent", "-p", "x"]);
    expect(byId("grok")?.headless("x")).toEqual(["grok", "-p", "x"]);
    expect(rows.map((row) => row.interactive("'x'"))).toEqual([
      "claude 'x'",
      "codex 'x'",
      "opencode --prompt 'x'",
      "gemini 'x'",
      "cursor-agent 'x'",
      "grok 'x'",
    ]);
  });
});
