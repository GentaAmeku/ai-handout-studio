// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentRunner,
  resolveTimeoutMs,
  type SpawnFn,
} from "./agent-runs.ts";
import { createAiRequest } from "./ai-requests.ts";

const fixedNow = new Date(2026, 8, 16, 10, 0, 0);
const repoRoot = "/repo";
const deckId = "deck_20260916_001";
const context = { workspaceRoot: "" };

type FakeChild = EventEmitter & {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
};

const createFakeChild = (pid: number): FakeChild => {
  const child = new EventEmitter() as FakeChild;
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-runs-"),
  );
  await mkdir(join(context.workspaceRoot, "decks", deckId), {
    recursive: true,
  });
  await writeFile(
    join(context.workspaceRoot, "decks", deckId, "deck.json"),
    JSON.stringify({ id: deckId, title: "テスト" }),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const setup = (timeoutMs = 60_000) => {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn(
    (_file: string, _args: readonly string[], _options: object): FakeChild => {
      const child = createFakeChild(1000 + children.length);
      children.push(child);
      return child;
    },
  );
  const killFn = vi.fn();
  const runner = createAgentRunner({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => fixedNow,
    timeoutMs,
    spawnFn: spawnFn as unknown as SpawnFn,
    killFn,
  });
  return { children, spawnFn, killFn, runner };
};

const createRequest = (at: Date = fixedNow) =>
  createAiRequest(
    context.workspaceRoot,
    repoRoot,
    deckId,
    {
      scope: "slide",
      slideId: "s01",
      instruction: "見出しを短くする",
      target: { id: "s01", layout: "content", blocks: [] },
    },
    at,
  );

describe("startRun", () => {
  it("起動すると running を返し、固定の非対話コマンドで spawn する", async () => {
    const { children, spawnFn, runner } = setup();
    const { requestId } = await createRequest();
    const result = await runner.startRun(deckId, requestId, "claude");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.run).toMatchObject({
      deckId,
      requestId,
      agent: "claude",
      state: "running",
    });
    expect(spawnFn).toHaveBeenCalledOnce();
    const [file, args, options] = spawnFn.mock.calls[0] ?? [];
    expect(file).toBe("claude");
    expect(args).toContain("-p");
    expect(options).toMatchObject({ cwd: repoRoot, detached: true });
    expect(children).toHaveLength(1);
    runner.close();
  });

  it("実行中は同じ依頼も別の依頼も 409", async () => {
    const { runner } = setup();
    const first = await createRequest();
    const second = await createRequest(new Date(2026, 8, 16, 10, 1, 0));
    expect(
      (await runner.startRun(deckId, first.requestId, "claude")).success,
    ).toBe(true);
    const same = await runner.startRun(deckId, first.requestId, "codex");
    expect(same).toMatchObject({ success: false, status: 409 });
    const other = await runner.startRun(deckId, second.requestId, "codex");
    expect(other).toMatchObject({ success: false, status: 409 });
    runner.close();
  });

  it("無い依頼は 404、無い資料は 404", async () => {
    const { runner } = setup();
    expect(
      await runner.startRun(deckId, "20200101T000000", "claude"),
    ).toMatchObject({ success: false, status: 404 });
    const { requestId } = await createRequest();
    expect(
      await runner.startRun("deck_20200101_001", requestId, "claude"),
    ).toMatchObject({ success: false, status: 404 });
  });
});

describe("終了と停止", () => {
  it("終了コード0で deck が不変なら done", async () => {
    const { children, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "codex");
    if (!started.success) throw new Error("起動できない");
    children[0]?.emit("close", 0);
    await sleep(20);
    expect(runner.getRun(started.run.runId)).toMatchObject({
      state: "done",
      exitCode: 0,
    });
  });

  it("非ゼロ終了は failed にし、末尾ログを残す", async () => {
    const { children, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "grok");
    if (!started.success) throw new Error("起動できない");
    children[0]?.stdout.emit("data", "out-1\n");
    children[0]?.stderr.emit("data", "err-1\n");
    children[0]?.emit("close", 3);
    await sleep(20);
    expect(runner.getRun(started.run.runId)).toMatchObject({
      state: "failed",
      exitCode: 3,
    });
    expect(runner.getRun(started.run.runId)?.logTail).toContain("err-1");
  });

  it("deck.json が書き換わっていたら failed", async () => {
    const { children, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "claude");
    if (!started.success) throw new Error("起動できない");
    await writeFile(
      join(context.workspaceRoot, "decks", deckId, "deck.json"),
      JSON.stringify({ id: deckId, title: "書き換え" }),
    );
    children[0]?.emit("close", 0);
    await sleep(20);
    expect(runner.getRun(started.run.runId)).toMatchObject({
      state: "failed",
      message: "deck.json が実行中に書き換えられている",
    });
  });

  it("制限時間を超えたら failed にし、プロセスグループを殺す", async () => {
    const { killFn, runner } = setup(30);
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "claude");
    if (!started.success) throw new Error("起動できない");
    await sleep(80);
    expect(runner.getRun(started.run.runId)).toMatchObject({
      state: "failed",
    });
    expect(killFn).toHaveBeenCalledWith(expect.any(Number), "SIGTERM");
  });

  it("cancel は cancelled にし、SIGTERM を送る", async () => {
    const { children, killFn, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "claude");
    if (!started.success) throw new Error("起動できない");
    const cancelled = runner.cancelRun(started.run.runId);
    expect(cancelled).toMatchObject({ state: "cancelled" });
    expect(killFn).toHaveBeenCalledWith(children[0]?.pid, "SIGTERM");
    // 終わったあとの close は無視する
    children[0]?.emit("close", 0);
    await sleep(20);
    expect(runner.getRun(started.run.runId)?.state).toBe("cancelled");
  });

  it("起動に失敗したら failed", async () => {
    const { children, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "claude");
    if (!started.success) throw new Error("起動できない");
    children[0]?.emit("error", new Error("spawn claude ENOENT"));
    await sleep(20);
    expect(runner.getRun(started.run.runId)).toMatchObject({
      state: "failed",
    });
  });

  it("知らない run の取得と停止は undefined", async () => {
    const { runner } = setup();
    expect(runner.getRun("missing")).toBeUndefined();
    expect(runner.cancelRun("missing")).toBeUndefined();
  });

  it("ログは末尾 64KB だけ残す", async () => {
    const { children, runner } = setup();
    const { requestId } = await createRequest();
    const started = await runner.startRun(deckId, requestId, "claude");
    if (!started.success) throw new Error("起動できない");
    children[0]?.stdout.emit("data", `x`.repeat(70 * 1024));
    children[0]?.emit("close", 0);
    await sleep(20);
    const tail = runner.getRun(started.run.runId)?.logTail ?? "";
    expect(tail.length).toBeLessThanOrEqual(64 * 1024);
  });
});

describe("resolveTimeoutMs", () => {
  it("未設定・不正値は既定の10分", () => {
    expect(resolveTimeoutMs(undefined)).toBe(10 * 60 * 1000);
    expect(resolveTimeoutMs("abc")).toBe(10 * 60 * 1000);
    expect(resolveTimeoutMs("0")).toBe(10 * 60 * 1000);
    expect(resolveTimeoutMs("-5")).toBe(10 * 60 * 1000);
  });

  it("数値はそのまま使う", () => {
    expect(resolveTimeoutMs("5000")).toBe(5000);
  });
});
