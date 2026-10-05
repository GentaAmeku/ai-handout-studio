// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandoutExportResult, HandoutSummary } from "../src/api/types";
import { createApi } from "./api";
import {
  appActionsHtml,
  appActionsScript,
  appActionsScriptHash,
} from "./app-actions";
import { documentSample } from "./document-sample";

// 質問票と HTML 資料をアプリで原寸に開いたときだけ、署名の行の右端に出す操作(資料一覧・お気に入り)。
// アプリを動かしている PC から枠に入れずに開いたときだけ出し、LAN の端末・アプリの中の枠・書き出しには出さない

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { workspaceRoot: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-actions-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

// 送ってきた端末。@hono/node-server が env.incoming に渡すのと同じ形
const from = (remoteAddress: string) => ({
  incoming: { socket: { remoteAddress } },
});
const LOCAL = from("127.0.0.1");

const send = (
  method: string,
  path: string,
  {
    body,
    headers = {},
    env,
  }: {
    body?: unknown;
    headers?: Record<string, string>;
    env?: unknown;
  } = {},
) =>
  createApi({ repoRoot, workspaceRoot: context.workspaceRoot }).request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );

const createSheet = async (): Promise<string> => {
  const response = await send("POST", "/api/sheets", {
    body: {
      questions: {
        schemaVersion: 1,
        id: "demo",
        revision: "1",
        title: "配布の進め方を決める",
        questions: [{ id: "where", title: "どこに置きますか", type: "text" }],
      },
    },
  });
  return ((await response.json()) as HandoutSummary).id;
};

// 署名(組織名・添え書き)の無い HTML 資料。画像の取り込みは要らないので画像は外す
const createDocument = async (): Promise<string> => {
  const doc = documentSample();
  const response = await send("POST", "/api/documents", {
    body: {
      title: "保存の仕組み",
      document: {
        ...doc,
        signature: { org: "" },
        sections: doc.sections.map((section) => ({
          ...section,
          blocks: section.blocks.filter((block) => block.type !== "image"),
        })),
      },
    },
  });
  return ((await response.json()) as HandoutSummary).id;
};

const actionsOf = (html: string): Element | null =>
  new JSDOM(html).window.document.querySelector(
    ".ds-signature .ds-app-actions",
  );

describe("原寸の画面の操作", () => {
  it("PC から開いた質問票は、署名の行の右端に資料一覧と ☆ を出し、☆ の通信とスクリプトを CSP で許す", async () => {
    const id = await createSheet();
    const preview = await send("GET", `/api/sheets/${id}/preview`, {
      env: LOCAL,
    });
    const actions = actionsOf(await preview.text());
    expect(actions?.querySelector("a")?.getAttribute("href")).toBe("/sheets");
    expect(actions?.querySelector("a")?.textContent).toBe("資料一覧");
    const star = actions?.querySelector("button");
    expect(star?.getAttribute("aria-pressed")).toBe("false");
    expect(star?.getAttribute("data-favorite-id")).toBe(id);
    const csp = preview.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain(appActionsScriptHash());
  });

  it("お気に入りの資料は ☆ が押された印で出る", async () => {
    const id = await createDocument();
    await send("PUT", `/api/favorites/${id}`, { body: { favorite: true } });
    const preview = await send("GET", `/api/documents/${id}/preview`, {
      env: LOCAL,
    });
    const actions = actionsOf(await preview.text());
    expect(actions?.querySelector("a")?.getAttribute("href")).toBe(
      "/documents",
    );
    expect(actions?.querySelector("button")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it.each([
    ["LAN の端末から開いたとき", from("192.168.3.45"), {}, ""],
    ["送り手が分からないとき", undefined, {}, ""],
    [
      "アプリの画面の中の枠に入れたとき",
      LOCAL,
      { "sec-fetch-dest": "iframe" },
      "",
    ],
    ["HTML 資料の編集画面の枠のとき", LOCAL, {}, "?view=edit"],
  ])("%sは出さず、CSP も広げない", async (_label, env, headers, query) => {
    const id = await createDocument();
    const preview = await send("GET", `/api/documents/${id}/preview${query}`, {
      env,
      headers,
    });
    expect(preview.status).toBe(200);
    expect(actionsOf(await preview.text())).toBeNull();
    const csp = preview.headers.get("content-security-policy") ?? "";
    expect(csp).not.toContain("connect-src");
    expect(csp).not.toContain(appActionsScriptHash());
  });

  it("書き出したファイルには出さない", async () => {
    const id = await createSheet();
    const exported = await send("POST", `/api/sheets/${id}/exports`, {
      env: LOCAL,
    });
    const { path } = (await exported.json()) as HandoutExportResult;
    // 部品の CSS は埋まるが、操作の要素とスクリプトは入らない
    const html = await readFile(path, "utf8");
    expect(actionsOf(html)).toBeNull();
    expect(html).not.toContain("data-favorite-id");
  });
});

// 埋め込みと同じ形で動かす。<\/ の逃がしだけ戻す
const run = (
  favorite: boolean,
  respond: () => Promise<Response>,
): { page: Document; fetch: ReturnType<typeof vi.fn> } => {
  const dom = new JSDOM(
    `<!doctype html><body><div class="ds-signature">${appActionsHtml(
      { id: "sheet_20261005_001", listPath: "/sheets", favorite },
      "ja",
    )}</div></body>`,
    { runScripts: "outside-only" },
  );
  const fetch = vi.fn(respond);
  Object.assign(dom.window, { fetch });
  dom.window.eval(appActionsScript().replaceAll("<\\/", "</"));
  return { page: dom.window.document, fetch };
};

const starOf = (page: Document): HTMLButtonElement => {
  const star = page.querySelector<HTMLButtonElement>("[data-favorite-id]");
  if (!star) throw new Error("☆ が無い");
  return star;
};

describe("☆ のスクリプト", () => {
  it("押すとお気に入りの API へ送り、付いた印と「お気に入りから外す」の吹き出しに替える", async () => {
    const { page, fetch } = run(false, async () => new Response("{}"));
    const star = starOf(page);
    expect(star.title).toBe("お気に入りにする");
    star.click();
    await vi.waitFor(() =>
      expect(star.getAttribute("aria-pressed")).toBe("true"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/favorites/sheet_20261005_001",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ favorite: true }),
      }),
    );
    expect(star.title).toBe("お気に入りから外す");
    expect(star.disabled).toBe(false);
  });

  it("付け外しできなかったら印はそのままで、一言を出す", async () => {
    const { page } = run(true, async () => new Response("{}", { status: 403 }));
    const star = starOf(page);
    star.click();
    await vi.waitFor(() =>
      expect(page.querySelector(".ds-app-actions-status")?.textContent).toBe(
        "お気に入りを変えられませんでした",
      ),
    );
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.disabled).toBe(false);
  });
});
