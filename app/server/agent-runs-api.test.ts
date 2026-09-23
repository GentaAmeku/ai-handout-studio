// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeckDetail } from "../src/api/types";
import type { AgentRunner } from "./agent-runs.ts";
import { createApi } from "./api.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixedNow = new Date(2026, 8, 16, 10, 0, 0);
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-runs-api-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const running = {
  runId: "20260916T100000-abcdef12",
  deckId: "deck_20260916_001",
  requestId: "20260916T100000",
  agent: "claude" as const,
  command: "claude -p prompt",
  state: "running" as const,
  startedAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
};

const runnerWith = (part: Partial<AgentRunner>): AgentRunner => ({
  startRun: vi.fn(async () => ({ success: true as const, run: running })),
  getRun: vi.fn(() => undefined),
  cancelRun: vi.fn(() => undefined),
  close: vi.fn(),
  ...part,
});

const apiWith = (agentRunner: AgentRunner | undefined) =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    now: () => fixedNow,
    agentRunner,
  });

const createDeck = async (): Promise<string> => {
  const response = await apiWith(runnerWith({})).request("/api/decks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outlineId: "proposal", title: "テスト提案" }),
  });
  return ((await response.json()) as DeckDetail).deckId;
};

const createRequest = async (deckId: string): Promise<string> => {
  const detail = (await (
    await apiWith(runnerWith({})).request(`/api/decks/${deckId}/ai-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "slide",
        slideId: "s01",
        instruction: "短くする",
        target: { id: "s01", layout: "content", blocks: [] },
      }),
    })
  ).json()) as { requestId: string };
  return detail.requestId;
};

describe("POST /api/decks/:deckId/ai-requests/:requestId/runs", () => {
  it("起動を受け付けて 201 で返す", async () => {
    const deckId = await createDeck();
    const requestId = await createRequest(deckId);
    const agentRunner = runnerWith({});
    const response = await apiWith(agentRunner).request(
      `/api/decks/${deckId}/ai-requests/${requestId}/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "codex" }),
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ state: "running" });
    expect(agentRunner.startRun).toHaveBeenCalledWith(
      deckId,
      requestId,
      "codex",
    );
  });

  it("起動処理が無ければ 503、エージェント違いは 400、実行中は 409", async () => {
    const deckId = await createDeck();
    const requestId = await createRequest(deckId);
    const runsPath = `/api/decks/${deckId}/ai-requests/${requestId}/runs`;
    const post = (api: ReturnType<typeof apiWith>, body: unknown) =>
      api.request(runsPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post(apiWith(undefined), { agent: "claude" })).status).toBe(
      503,
    );
    expect(
      (await post(apiWith(runnerWith({})), { agent: "gemini" })).status,
    ).toBe(400);
    const busy = runnerWith({
      startRun: vi.fn(async () => ({
        success: false as const,
        status: 409 as const,
        message: "ほかの依頼のエージェントが実行中",
      })),
    });
    expect((await post(apiWith(busy), { agent: "claude" })).status).toBe(409);
  });
});

describe("GET / POST cancel runs/:runId", () => {
  it("状態を返し、停止できる。無ければ 404", async () => {
    const deckId = await createDeck();
    const requestId = await createRequest(deckId);
    const agentRunner = runnerWith({
      getRun: vi.fn((runId: string) =>
        runId === running.runId ? running : undefined,
      ),
      cancelRun: vi.fn((runId: string) =>
        runId === running.runId
          ? { ...running, state: "cancelled" as const }
          : undefined,
      ),
    });
    const api = apiWith(agentRunner);
    const base = `/api/decks/${deckId}/ai-requests/${requestId}/runs/${running.runId}`;
    expect(await (await api.request(base)).json()).toMatchObject({
      runId: running.runId,
      state: "running",
    });
    const cancelled = await api.request(`${base}/cancel`, { method: "POST" });
    expect(await cancelled.json()).toMatchObject({ state: "cancelled" });
    expect((await api.request(`${base}/nope`)).status).toBe(404);
    expect(
      (await api.request(`${base}/nope/cancel`, { method: "POST" })).status,
    ).toBe(404);
  });
});
