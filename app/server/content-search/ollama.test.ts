import { describe, expect, it } from "vitest";
import { createOllama, isOlderVersion, pickVectorModel } from "./ollama.ts";

// 手元の Ollama への問い合わせ。止まっている・形が違うときは undefined

const respond =
  (routes: Record<string, unknown>) =>
  async (input: RequestInfo | URL): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    return path in routes
      ? new Response(JSON.stringify(routes[path]), { status: 200 })
      : new Response("", { status: 404 });
  };

describe("createOllama", () => {
  it("版・モデルの名前・ベクトルを読む", async () => {
    const ollama = createOllama(
      "http://ollama.test",
      respond({
        "/api/version": { version: "0.40.1" },
        "/api/tags": {
          models: [{ name: "embeddinggemma-2:270m" }, { name: "gemma4" }],
        },
        "/api/embed": { embeddings: [[0.1, 0.2]] },
      }),
    );
    expect(await ollama.version()).toBe("0.40.1");
    expect(await ollama.models()).toEqual(["embeddinggemma-2:270m", "gemma4"]);
    expect(await ollama.embed("embeddinggemma-2:270m", ["a"], 1000)).toEqual([
      [0.1, 0.2],
    ]);
  });

  it("つながらない・形が違う・数が合わないときは undefined", async () => {
    const down = createOllama("http://ollama.test", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await down.version()).toBeUndefined();
    expect(await down.models()).toBeUndefined();
    const odd = createOllama(
      "http://ollama.test",
      respond({
        "/api/version": { v: 1 },
        "/api/embed": { embeddings: [[0.1]] },
      }),
    );
    expect(await odd.version()).toBeUndefined();
    expect(await odd.embed("m", ["a", "b"], 1000)).toBeUndefined();
  });

  it("時間内に返らなければ undefined", async () => {
    const slow = createOllama(
      "http://ollama.test",
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "TimeoutError")),
          );
        }),
    );
    expect(await slow.embed("m", ["a"], 20)).toBeUndefined();
  });
});

describe("isOlderVersion", () => {
  it("頭の数で比べる", () => {
    expect(isOlderVersion("0.30.7", "0.40.0")).toBe(true);
    expect(isOlderVersion("0.40.0", "0.40.0")).toBe(false);
    expect(isOlderVersion("0.40.1", "0.40.0")).toBe(false);
    expect(isOlderVersion("1.0.0-rc1", "0.40.0")).toBe(false);
    expect(isOlderVersion("0.9", "0.40.0")).toBe(true);
  });

  it("読めない版は古いとみなさない", () => {
    expect(isOlderVersion("dev", "0.40.0")).toBe(false);
  });
});

describe("pickVectorModel", () => {
  it("案内で落とす 270m があればそれ、無ければ名前の順で最初の embeddinggemma-2", () => {
    expect(
      pickVectorModel(["embeddinggemma-2:740m", "embeddinggemma-2:270m"]),
    ).toBe("embeddinggemma-2:270m");
    expect(pickVectorModel(["gemma4", "embeddinggemma-2:latest"])).toBe(
      "embeddinggemma-2:latest",
    );
    expect(pickVectorModel(["embeddinggemma:300m", "gemma4"])).toBeUndefined();
  });
});
