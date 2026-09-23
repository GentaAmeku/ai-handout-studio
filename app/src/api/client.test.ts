import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("API のエラーの文言", () => {
  it("サーバーの守りが断った書き込みは、画面の言語(<html lang>)で出す", async () => {
    const body = {
      error: "この操作は、アプリを動かしている PC の画面から行ってください",
      code: "local-only",
    };
    vi.stubGlobal("fetch", respond(403, body));
    await expect(
      requestJson("/api/decks", { method: "POST" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "この操作は、アプリを動かしている PC の画面から行ってください",
    });
    document.documentElement.lang = "en";
    await expect(
      requestJson("/api/decks", { method: "POST" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Do this from the screen on the computer that runs the app.",
    });
  });

  it("ほかのエラーはサーバーの文言のまま", async () => {
    vi.stubGlobal("fetch", respond(404, { error: "資料が見つからない" }));
    await expect(requestJson("/api/decks/x")).rejects.toMatchObject({
      status: 404,
      message: "資料が見つからない",
    });
  });
});
