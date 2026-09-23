// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "./api.ts";
import {
  checkRequest,
  type GuardRequest,
  guardLocalRequests,
  isLoopbackAddress,
  isSameOrigin,
  LOCAL_ONLY_MESSAGE,
  SIDE_EFFECT_GET_PATHS,
} from "./request-guard.ts";
import { copyDesignWithDefaultSelection } from "./test-fixtures.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const HOST = "127.0.0.1:5190";

// 画面(同じ origin)からの JSON の書き込み。ここから1つずつ崩して確かめる
const fromScreen = (overrides: Partial<GuardRequest> = {}): GuardRequest => ({
  method: "POST",
  url: "/api/decks",
  remoteAddress: "127.0.0.1",
  ...overrides,
  headers: {
    host: HOST,
    origin: `http://${HOST}`,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...overrides.headers,
  },
});

// コマンドや Node の fetch からの要求。Origin も Sec-Fetch-Site も付かない
const fromCommand = (overrides: Partial<GuardRequest> = {}): GuardRequest => ({
  method: "POST",
  url: "/api/decks",
  remoteAddress: "127.0.0.1",
  ...overrides,
  headers: {
    host: HOST,
    "content-type": "application/json",
    ...overrides.headers,
  },
});

// 別のサイトのページが送る要求(ブラウザが Origin と Sec-Fetch-Site を付ける)
const fromOtherSite = (overrides: Partial<GuardRequest> = {}): GuardRequest =>
  fromScreen({
    ...overrides,
    headers: {
      origin: "https://example.com",
      "sec-fetch-site": "cross-site",
      ...overrides.headers,
    },
  });

// 同じ Wi-Fi のスマホが --lan の起動を開いたときの要求
const fromPhone = (overrides: Partial<GuardRequest> = {}): GuardRequest =>
  fromScreen({
    remoteAddress: "192.168.1.20",
    ...overrides,
    headers: {
      host: "192.168.1.10:5190",
      origin: "http://192.168.1.10:5190",
      ...overrides.headers,
    },
  });

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

describe("送り手と origin の確かめ", () => {
  it("ループバックは 127.0.0.0/8・::1・IPv4 を写した IPv6 だけ", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.1.2.3")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackAddress("::ffff:192.168.1.20")).toBe(false);
    expect(isLoopbackAddress("10.0.0.127")).toBe(false);
    expect(isLoopbackAddress("fe80::1")).toBe(false);
    expect(isLoopbackAddress("127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it("Origin が無いか、Host と同じ origin のときだけ同じとみなす", () => {
    expect(isSameOrigin(undefined, HOST)).toBe(true);
    expect(isSameOrigin(`http://${HOST}`, HOST)).toBe(true);
    expect(isSameOrigin("http://localhost:5190", HOST)).toBe(false);
    expect(isSameOrigin("http://127.0.0.1:5191", HOST)).toBe(false);
    expect(isSameOrigin(`https://${HOST}`, HOST)).toBe(false);
    expect(isSameOrigin("https://example.com", HOST)).toBe(false);
    expect(isSameOrigin("null", HOST)).toBe(false);
    expect(isSameOrigin(`http://${HOST}`, undefined)).toBe(false);
  });
});

describe("書き込みの守り", () => {
  it("画面(同じ origin)からの JSON の書き込みは、どの方法でも通す", () => {
    for (const method of WRITE_METHODS) {
      expect(checkRequest(fromScreen({ method }))).toEqual({ allowed: true });
    }
  });

  it("Origin の無いループバックからの要求(コマンド・fetch)は通す", () => {
    for (const method of WRITE_METHODS) {
      expect(checkRequest(fromCommand({ method }))).toEqual({ allowed: true });
    }
    expect(
      checkRequest(fromCommand({ remoteAddress: "::ffff:127.0.0.1" })),
    ).toEqual({ allowed: true });
    expect(checkRequest(fromCommand({ remoteAddress: "::1" }))).toEqual({
      allowed: true,
    });
    expect(
      checkRequest(
        fromCommand({
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it("別のサイトからの書き込みは 403 で断る", () => {
    for (const method of WRITE_METHODS) {
      expect(checkRequest(fromOtherSite({ method }))).toMatchObject({
        allowed: false,
        status: 403,
        message: LOCAL_ONLY_MESSAGE,
      });
    }
    // 受入確認の curl と同じ形(Origin だけ、Content-Type は text/plain)
    expect(
      checkRequest(
        fromCommand({
          headers: {
            origin: "https://example.com",
            "content-type": "text/plain",
          },
        }),
      ),
    ).toMatchObject({ allowed: false, status: 403 });
  });

  it("Sec-Fetch-Site が same-origin でなければ、Origin が無くても断る", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(
        checkRequest(fromCommand({ headers: { "sec-fetch-site": site } })),
      ).toMatchObject({ allowed: false, status: 403 });
    }
  });

  it("Origin が Host と違えば、Sec-Fetch-Site が無くても断る", () => {
    for (const origin of [
      "https://example.com",
      "http://127.0.0.1:3000",
      "http://localhost:5190",
      "null",
    ]) {
      expect(checkRequest(fromCommand({ headers: { origin } }))).toMatchObject({
        allowed: false,
        status: 403,
      });
    }
  });

  it("ループバック以外(LAN のほかの端末)からの書き込みは、同じ origin でも断る", () => {
    for (const method of WRITE_METHODS) {
      expect(checkRequest(fromPhone({ method }))).toMatchObject({
        allowed: false,
        status: 403,
        message: LOCAL_ONLY_MESSAGE,
      });
    }
    expect(
      checkRequest(fromCommand({ remoteAddress: "192.168.1.20" })),
    ).toMatchObject({ allowed: false, status: 403 });
    expect(
      checkRequest(fromCommand({ remoteAddress: undefined })),
    ).toMatchObject({ allowed: false, status: 403 });
  });

  it("本文が JSON でない書き込みは、PC の画面からでも断る", () => {
    for (const contentType of [
      "text/plain",
      "text/plain;charset=UTF-8",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      undefined,
    ]) {
      expect(
        checkRequest(fromScreen({ headers: { "content-type": contentType } })),
      ).toMatchObject({ allowed: false, status: 415 });
    }
  });
});

describe("読むだけの要求", () => {
  it("GET・HEAD・OPTIONS は、LAN のほかの端末からも別のサイトからも通す", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      for (const url of [
        "/api/decks",
        "/api/sheets/sheet_20260923_001/preview",
        "/",
        "/sheets/sheet_20260923_001",
      ]) {
        expect(checkRequest(fromPhone({ method, url }))).toEqual({
          allowed: true,
        });
        expect(checkRequest(fromOtherSite({ method, url }))).toEqual({
          allowed: true,
        });
      }
    }
  });

  it("GET でも動きを起こす口(/__open-in-editor)は、書き込みと同じに断る", () => {
    const url = "/__open-in-editor?file=/etc/hosts";
    expect(checkRequest(fromPhone({ method: "GET", url }))).toMatchObject({
      allowed: false,
      status: 403,
    });
    expect(checkRequest(fromOtherSite({ method: "GET", url }))).toMatchObject({
      allowed: false,
      status: 403,
    });
    // connect は口の名前を大文字小文字を区別せずに比べ、次の文字が "." でも同じ口へ渡す。
    // 絶対形式の要求ターゲット(http://host/path)も道に直して比べる
    for (const variant of [
      "/__OPEN-IN-EDITOR?file=/etc/hosts",
      "/__Open-In-Editor",
      "/__open-in-editor.x",
      "/__open-in-editor/x",
      "/__open-in-editor#x",
      "http://192.168.1.10:5190/__open-in-editor?file=/etc/hosts",
      "HTTP://192.168.1.10:5190/__OPEN-IN-EDITOR",
      "not a url",
    ]) {
      expect(
        checkRequest(fromPhone({ method: "GET", url: variant })),
        variant,
      ).toMatchObject({ allowed: false, status: 403 });
      expect(
        checkRequest(fromOtherSite({ method: "GET", url: variant })),
        variant,
      ).toMatchObject({ allowed: false, status: 403 });
    }
    // 名前が続く別の口(次の文字が "/" "." 以外)は、動きを起こす口として扱わない
    expect(
      checkRequest(fromPhone({ method: "GET", url: "/__open-in-editorx" })),
    ).toEqual({ allowed: true });
    // PC の画面(Vite のエラー表示)からは今までどおり開ける。GET は本文を持たない
    expect(
      checkRequest(
        fromScreen({
          method: "GET",
          url,
          headers: { "content-type": undefined },
        }),
      ),
    ).toEqual({ allowed: true });
  });
});

// アプリが持つ全ての口の一覧。口を足したら、ここと守りの扱いを見直す
const WRITE_ROUTES = [
  "DELETE /api/decks/:deckId",
  "DELETE /api/documents/:id",
  "DELETE /api/sheets/:id",
  "POST /api/decks",
  "POST /api/decks/:deckId/ai-requests",
  "POST /api/decks/:deckId/ai-requests/:requestId/runs",
  "POST /api/decks/:deckId/ai-requests/:requestId/runs/:runId/cancel",
  "POST /api/decks/:deckId/exports",
  "POST /api/decks/:deckId/versions/:versionId/restore",
  "POST /api/design/build",
  "POST /api/documents",
  "POST /api/documents/:id/ai-requests",
  "POST /api/documents/:id/exports",
  "POST /api/documents/:id/share",
  "POST /api/documents/:id/versions/:versionId/restore",
  "POST /api/sheets",
  "POST /api/sheets/:id/exports",
  "POST /api/sheets/:id/share",
  "PUT /api/decks/:deckId",
  "PUT /api/design/selection",
  "PUT /api/design/templates/:surface/:name",
  "PUT /api/documents/:id",
  "PUT /api/documents/:id/template",
  "PUT /api/favorites/:id",
  "PUT /api/profile",
  "PUT /api/sheets/:id",
  "PUT /api/sheets/:id/answers",
  "PUT /api/sheets/:id/template",
];

// 読むだけの GET。どれもファイルを書かず、プロセスも起こさないことをコードで確かめた
const READ_ROUTES = [
  "GET /api/decks",
  "GET /api/decks/:deckId",
  "GET /api/decks/:deckId/ai-requests/:requestId",
  "GET /api/decks/:deckId/ai-requests/:requestId/runs/:runId",
  "GET /api/decks/:deckId/assets/*",
  "GET /api/decks/:deckId/versions",
  "GET /api/decks/:deckId/versions/:versionId",
  "GET /api/design/files/*",
  "GET /api/design/templates",
  "GET /api/design/templates/:surface/:name",
  "GET /api/design/templates/:surface/:name/sample",
  "GET /api/documents",
  "GET /api/documents/:id",
  "GET /api/documents/:id/ai-requests/:requestId",
  "GET /api/documents/:id/ai-requests/:requestId/preview",
  "GET /api/documents/:id/document",
  "GET /api/documents/:id/preview",
  "GET /api/documents/:id/versions",
  "GET /api/documents/:id/versions/:versionId",
  "GET /api/profile",
  "GET /api/sheets",
  "GET /api/sheets/:id",
  "GET /api/sheets/:id/preview",
];

// 経路の型(:id など)を、実際に来る要求の道へ置き換える
const concretePath = (path: string): string =>
  path
    .replace(":deckId", "deck_20260923_001")
    .replace(":id", "sheet_20260923_001")
    .replace(/:[a-zA-Z]+/g, "x")
    .replace("*", "a.png");

describe("アプリの全ての口に守りが効く", () => {
  const routes = createApi({
    repoRoot,
    workspaceRoot: join(tmpdir(), "ai-handout-studio-guard-unused"),
  })
    .routes.filter((route) => route.method !== "ALL")
    .map((route) => `${route.method} ${route.path}`);
  const unique = [...new Set(routes)].sort();

  it("口の一覧は、書き込みと読むだけの GET に分けたものと一致する(足したら見直す)", () => {
    expect(unique).toEqual([...WRITE_ROUTES, ...READ_ROUTES].sort());
    expect(
      unique.every(
        (route) => route.startsWith("GET ") || WRITE_ROUTES.includes(route),
      ),
    ).toBe(true);
  });

  it("書き込みの口は、全て別のサイトと LAN のほかの端末から断られ、PC の画面から通る", () => {
    for (const route of WRITE_ROUTES) {
      const [method, path = ""] = route.split(" ");
      const url = concretePath(path);
      expect(checkRequest(fromOtherSite({ method, url })), route).toMatchObject(
        { allowed: false, status: 403 },
      );
      expect(checkRequest(fromPhone({ method, url })), route).toMatchObject({
        allowed: false,
        status: 403,
      });
      expect(
        checkRequest(
          fromCommand({
            method,
            url,
            headers: { "content-type": "text/plain" },
          }),
        ),
        route,
      ).toMatchObject({ allowed: false, status: 415 });
      expect(checkRequest(fromScreen({ method, url })), route).toEqual({
        allowed: true,
      });
    }
  });

  it("読むだけの GET は、LAN のほかの端末からも通る", () => {
    for (const route of READ_ROUTES) {
      const url = concretePath(route.slice("GET ".length));
      expect(
        SIDE_EFFECT_GET_PATHS.some((prefix) => url.startsWith(prefix)),
      ).toBe(false);
      expect(checkRequest(fromPhone({ method: "GET", url })), route).toEqual({
        allowed: true,
      });
    }
  });
});

// 送り手の住所は本物の接続から取る。ループバック以外は作れないので、中間処理に直接渡して確かめる
const callMiddleware = (
  input: GuardRequest,
): { status: number; body: string; passed: boolean } => {
  const captured = { status: 200, body: "", passed: false };
  const req = {
    method: input.method,
    url: input.url,
    headers: Object.fromEntries(
      Object.entries(input.headers).filter(([, value]) => value !== undefined),
    ),
    socket: { remoteAddress: input.remoteAddress },
  } as unknown as IncomingMessage;
  const res = {
    set statusCode(value: number) {
      captured.status = value;
    },
    setHeader: () => undefined,
    end: (body: string) => {
      captured.body = body;
    },
  } as unknown as ServerResponse;
  guardLocalRequests(req, res, () => {
    captured.passed = true;
  });
  return captured;
};

describe("中間処理", () => {
  it("LAN のほかの端末からの書き込みは、API に渡さず 403 と決まった文言を返す", () => {
    const result = callMiddleware(fromPhone({ method: "DELETE" }));
    expect(result.passed).toBe(false);
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      error: LOCAL_ONLY_MESSAGE,
      code: "local-only",
    });
  });

  it("LAN のほかの端末からの GET は API に渡す", () => {
    expect(
      callMiddleware(fromPhone({ method: "GET", url: "/api/sheets" })).passed,
    ).toBe(true);
  });
});

// 本物のサーバー(守り → API)に HTTP で送る。送り手はループバック
describe("本物のサーバーで", () => {
  const context: {
    server?: Server;
    port: number;
    workspaceRoot: string;
    designDir: string;
  } = { port: 0, workspaceRoot: "", designDir: "" };

  beforeAll(async () => {
    context.workspaceRoot = await mkdtemp(
      join(tmpdir(), "ai-handout-studio-guard-"),
    );
    context.designDir = await copyDesignWithDefaultSelection();
    const listener = getRequestListener(
      createApi({
        repoRoot,
        workspaceRoot: context.workspaceRoot,
        designDir: context.designDir,
      }).fetch,
    );
    const server = createServer((req, res) =>
      guardLocalRequests(req, res, () => void listener(req, res)),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    context.server = server;
    context.port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      context.server?.close(() => resolve()),
    );
    await rm(context.workspaceRoot, { recursive: true, force: true });
    await rm(context.designDir, { recursive: true, force: true });
  });

  const send = (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: context.port, method, path, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });

  const sheetBody = JSON.stringify({
    questions: {
      schemaVersion: 1,
      id: "guard",
      revision: "1",
      title: "守りの確かめ",
      questions: [
        {
          id: "which",
          title: "どちらにしますか",
          type: "single",
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
        },
      ],
    },
  });

  it("別のサイトからの text/plain の POST は 403 で、資料は増えない", async () => {
    const response = await send(
      "POST",
      "/api/sheets",
      {
        origin: "https://example.com",
        "sec-fetch-site": "cross-site",
        "content-type": "text/plain",
      },
      sheetBody,
    );
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body).error).toBe(LOCAL_ONLY_MESSAGE);
    const list = await send("GET", "/api/sheets", {});
    expect(JSON.parse(list.body)).toEqual([]);
  });

  it("Origin の無い text/plain の POST は 415 で、資料は増えない", async () => {
    const response = await send(
      "POST",
      "/api/sheets",
      { "content-type": "text/plain" },
      sheetBody,
    );
    expect(response.status).toBe(415);
    const list = await send("GET", "/api/sheets", {});
    expect(JSON.parse(list.body)).toEqual([]);
  });

  it("同じ origin の JSON と、Origin の無い JSON の POST は API まで届く", async () => {
    const origin = `http://127.0.0.1:${context.port}`;
    const fromPage = await send(
      "POST",
      "/api/sheets",
      {
        origin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      sheetBody,
    );
    expect(fromPage.status).toBe(201);
    const fromCli = await send(
      "POST",
      "/api/sheets",
      { "content-type": "application/json" },
      sheetBody,
    );
    expect(fromCli.status).toBe(201);
    const list = await send("GET", "/api/sheets", {
      origin: "https://example.com",
      "sec-fetch-site": "cross-site",
    });
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body)).toHaveLength(2);
  });
});

// Vite の開発サーバー(connect の口の照合と launch-editor の中間処理)の前に守りを置いて確かめる。
// file を渡さないので、守りを抜けても中間処理は 500 を返すだけでエディターは起こさない
describe("Vite の開発サーバーで", () => {
  const context: { vite?: ViteDevServer; server?: Server; port: number } = {
    port: 0,
  };

  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-handout-studio-guard-vite-"));
    context.vite = await createViteServer({
      configFile: false,
      root,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false, cors: false },
      plugins: [
        {
          name: "guard",
          configureServer: (server) => {
            server.middlewares.use(guardLocalRequests);
          },
        },
      ],
    });
    const server = createServer(context.vite.middlewares);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    context.server = server;
    context.port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      context.server?.close(() => resolve()),
    );
    await context.vite?.close();
  });

  const get = (
    path: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: context.port, method: "GET", path, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });

  it('別のサイトからの /__open-in-editor は、大文字・"." 区切り・絶対形式でも 403', async () => {
    const crossSite = {
      origin: "https://example.com",
      "sec-fetch-site": "cross-site",
    };
    for (const path of [
      "/__open-in-editor",
      "/__OPEN-IN-EDITOR",
      "/__Open-In-Editor",
      "/__open-in-editor.x",
      `http://127.0.0.1:${context.port}/__open-in-editor`,
      `http://127.0.0.1:${context.port}/__OPEN-IN-EDITOR`,
    ]) {
      const response = await get(path, crossSite);
      expect(response.status, path).toBe(403);
      expect(JSON.parse(response.body).code, path).toBe("local-only");
    }
  });

  it("PC からの要求は、同じ形のまま launch-editor の中間処理まで届く", async () => {
    for (const path of ["/__OPEN-IN-EDITOR", "/__open-in-editor.x"]) {
      const response = await get(path, {});
      expect(response.status, path).toBe(500);
      expect(response.body, path).toContain('"file" is missing');
    }
  });
});
