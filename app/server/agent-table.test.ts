// @vitest-environment node
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentCommandsFor } from "./agent-commands.ts";
import {
  AGENTS,
  agentHarnesses,
  installedAgents,
  isAgentId,
} from "./agent-table.ts";

describe("エージェントはハーネスの表から引く", () => {
  it("AgentId は表の id と同じ並びで、表に無い名前は通さない", () => {
    expect(AGENTS).toEqual([
      "claude",
      "codex",
      "opencode",
      "gemini",
      "cursor",
      "grok",
    ]);
    expect(isAgentId("opencode")).toBe(true);
    expect(isAgentId("aider")).toBe(false);
    expect(isAgentId(undefined)).toBe(false);
  });

  it("コピー用のコマンドは表の全ハーネス分あり、OpenCode だけ --prompt を使う", () => {
    const commands = agentCommandsFor("/repo", "短くする");
    expect(Object.keys(commands)).toEqual([...AGENTS]);
    expect(commands.claude).toBe("cd '/repo' && claude '短くする'");
    expect(commands.opencode).toBe(
      "cd '/repo' && opencode --prompt '短くする'",
    );
    expect(commands.cursor).toBe("cd '/repo' && cursor-agent '短くする'");
  });

  it("非対話の形は、Grok が -p を使い、Codex が書き込みを許す", () => {
    const argv = Object.fromEntries(
      agentHarnesses().map((h) => [h.id, h.headless("P")]),
    );
    expect(argv.grok).toEqual(["grok", "-p", "P"]);
    expect(argv.codex?.slice(0, 4)).toEqual([
      "codex",
      "exec",
      "-s",
      "workspace-write",
    ]);
  });

  it("PATH にある実行できる bin だけを返す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ahs-agents-"));
    try {
      await writeFile(join(dir, "opencode"), "#!/bin/sh\n");
      await chmod(join(dir, "opencode"), 0o755);
      await writeFile(join(dir, "codex"), "#!/bin/sh\n");
      await chmod(join(dir, "codex"), 0o644);
      expect(installedAgents(dir)).toEqual([
        { id: "opencode", label: "OpenCode" },
      ]);
      expect(installedAgents("")).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
