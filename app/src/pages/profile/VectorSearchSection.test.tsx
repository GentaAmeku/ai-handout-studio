import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VectorStatus } from "../../api/types";
import { VectorSearchSection } from "./VectorSearchSection";

// 設定の画面の「ベクトル検索」(180)。状態の印と、有効でなければその場で次の一手(コマンド)を出す

const status = { current: undefined as VectorStatus | undefined };

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    status.current === undefined
      ? new Response(JSON.stringify({ error: "無い" }), { status: 404 })
      : new Response(JSON.stringify(status.current), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderWith = (next: VectorStatus) => {
  status.current = next;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <VectorSearchSection />
    </QueryClientProvider>,
  );
};

const command = () => document.querySelector(".command-box__code")?.textContent;

describe("VectorSearchSection", () => {
  it("有効なら、インデックスの件数とモデルを出し、コマンドは出さない", async () => {
    renderWith({
      state: "ready",
      ollamaVersion: "0.40.1",
      model: "embeddinggemma-2:270m",
      indexed: 754,
      total: 754,
    });
    expect(await screen.findByText("有効")).toBeTruthy();
    expect(screen.getByText("754 区切りをインデックス済みです。")).toBeTruthy();
    expect(
      screen.getByText("embeddinggemma-2:270m ・ Ollama 0.40.1"),
    ).toBeTruthy();
    expect(command()).toBeUndefined();
  });

  it("モデルが無ければ、取得のコマンドをその場に出す", async () => {
    renderWith({
      state: "no-model",
      ollamaVersion: "0.40.1",
      pull: "embeddinggemma-2:270m",
    });
    expect(await screen.findByText("モデル未導入")).toBeTruthy();
    expect(command()).toBe("ollama pull embeddinggemma-2:270m");
    expect(screen.getByRole("button", { name: "コピー" })).toBeTruthy();
  });

  it("Ollama が古い・動いていないときは、下限の版を書いて同じコマンドを出す", async () => {
    renderWith({
      state: "outdated",
      ollamaVersion: "0.30.7",
      minVersion: "0.40.0",
      pull: "embeddinggemma-2:270m",
    });
    expect(await screen.findByText("Ollama が古い")).toBeTruthy();
    expect(
      screen.getByText(/0\.30\.7 では embeddinggemma-2 を取得できません/),
    ).toBeTruthy();
    cleanup();
    renderWith({
      state: "no-ollama",
      minVersion: "0.40.0",
      pull: "embeddinggemma-2:270m",
    });
    expect(await screen.findByText("Ollama 未起動")).toBeTruthy();
    expect(command()).toBe("ollama pull embeddinggemma-2:270m");
  });

  it("設定で止めていれば、戻すコマンドを出す", async () => {
    renderWith({ state: "off" });
    expect(await screen.findByText("無効(設定で停止中)")).toBeTruthy();
    expect(command()).toBe(
      "ai-handout-studio settings --set features.vectorSearch=true",
    );
  });

  it("画面を開いたら、足りない区切りのベクトル作りを頼む", async () => {
    renderWith({
      state: "indexing",
      ollamaVersion: "0.40.1",
      model: "embeddinggemma-2:270m",
      indexed: 100,
      total: 754,
    });
    expect(await screen.findByText("インデックス作成中")).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([request, init]) =>
            String(request) === "/api/search/index" && init?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});
