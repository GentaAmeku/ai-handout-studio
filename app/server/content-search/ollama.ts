// 手元の Ollama(埋め込みのモデルを動かすアプリ)への問い合わせ(180)。
// 止まっている・遅い・形が違うときは undefined を返し、呼び手は文字の重なりだけの並び(段1)に戻す

export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";

// この版から embeddinggemma-2 を落とせる(v0.40.0。0.30.7 では「新しい Ollama が要る」と断られた)
export const MIN_OLLAMA_VERSION = "0.40.0";

// 名前がこれで始まるモデルを使う。案内で落としてもらうのは文字だけの 270m(378MB)
export const VECTOR_MODEL_PREFIX = "embeddinggemma-2";
export const VECTOR_MODEL_PULL = "embeddinggemma-2:270m";

export type Ollama = {
  version: () => Promise<string | undefined>;
  models: () => Promise<string[] | undefined>;
  embed: (
    model: string,
    inputs: readonly string[],
    timeoutMs: number,
  ) => Promise<number[][] | undefined>;
};

type Fetch = typeof fetch;

const STATUS_TIMEOUT = 1000;

const getJson = async (
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> => {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const createOllama = (
  origin: string = OLLAMA_ORIGIN,
  fetchImpl: Fetch = fetch,
): Ollama => ({
  version: async () => {
    const body = await getJson(
      fetchImpl,
      `${origin}/api/version`,
      {},
      STATUS_TIMEOUT,
    );
    return isRecord(body) && typeof body.version === "string"
      ? body.version
      : undefined;
  },
  models: async () => {
    const body = await getJson(
      fetchImpl,
      `${origin}/api/tags`,
      {},
      STATUS_TIMEOUT,
    );
    if (!isRecord(body) || !Array.isArray(body.models)) return undefined;
    return body.models.flatMap((model) =>
      isRecord(model) && typeof model.name === "string" ? [model.name] : [],
    );
  },
  embed: async (model, inputs, timeoutMs) => {
    const body = await getJson(
      fetchImpl,
      `${origin}/api/embed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: inputs }),
      },
      timeoutMs,
    );
    if (!isRecord(body) || !Array.isArray(body.embeddings)) return undefined;
    const vectors = body.embeddings.filter(
      (vector): vector is number[] =>
        Array.isArray(vector) &&
        vector.every((value) => typeof value === "number"),
    );
    return vectors.length === inputs.length ? vectors : undefined;
  },
});

// 「0.40.1」「0.40.0-rc1」の頭の数だけを比べる。読めない版は古いとみなさない
export const isOlderVersion = (version: string, minimum: string): boolean => {
  const parts = (text: string): number[] =>
    text
      .match(/\d+(\.\d+)*/)?.[0]
      .split(".")
      .map(Number) ?? [];
  const [a, b] = [parts(version), parts(minimum)];
  if (a.length === 0) return false;
  const diff = b
    .map((value, index) => (a[index] ?? 0) - value)
    .find((delta) => delta !== 0);
  return diff !== undefined && diff < 0;
};

// 入っているモデルのうち、使うもの。案内で落とすもの(270m)があればそれ、無ければ名前の順で最初
export const pickVectorModel = (
  models: readonly string[],
): string | undefined => {
  const candidates = models
    .filter((name) => name.startsWith(VECTOR_MODEL_PREFIX))
    .sort();
  return candidates.includes(VECTOR_MODEL_PULL)
    ? VECTOR_MODEL_PULL
    : candidates[0];
};
