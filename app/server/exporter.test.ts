import { describe, expect, it } from "vitest";
import { type AssetResponse, fetchAssets } from "./exporter.ts";

// 配布 HTML に写す画像とフォントは、取れたものだけ。取れなかった画像の代わりに
// エラーの応答を画像の名前で書かない

const response = (ok: boolean, text: string): AssetResponse => ({
  ok,
  body: async () => Buffer.from(text),
});

describe("fetchAssets", () => {
  it("取れたものだけを返し、404 や通信の失敗は落とす", async () => {
    const assets = [
      { url: "http://x/api/decks/d/assets/hero.svg", name: "hero.svg" },
      { url: "http://x/api/profile/logo.svg", name: "logo.svg" },
      { url: "http://x/api/decks/d/assets/gone.png", name: "gone.png" },
    ];
    const fetched = await fetchAssets(assets, async (url) => {
      if (url.endsWith("hero.svg")) return response(true, "<svg/>");
      if (url.endsWith("logo.svg"))
        return response(false, '{"error":"画像が見つからない"}');
      throw new Error("network");
    });
    expect(fetched.map(({ asset }) => asset.name)).toEqual(["hero.svg"]);
    expect(fetched[0]?.body.toString()).toBe("<svg/>");
  });
});
