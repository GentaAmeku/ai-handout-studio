import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, translate, useLanguage } from "./language";

// 画面の言語は <html lang> で決める(149)。localStorage の前の選択は見ない

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "";
});

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const Probe = () => {
  const { lang, t } = useLanguage();
  return (
    <p>
      {lang}:{t("nav.help")}
    </p>
  );
};

describe("translate(React の外の訳)", () => {
  it("<html lang> が en なら英語、無ければ(既定)日本語", () => {
    expect(translate("nav.help")).toBe("使い方");
    document.documentElement.lang = "en";
    expect(translate("nav.help")).toBe("Help");
  });

  it("localStorage に前の選択が残っていても無視する", () => {
    localStorage.setItem("ai-handout-studio:lang", "en");
    expect(translate("nav.help")).toBe("使い方");
  });
});

describe("LanguageProvider", () => {
  it("<html lang> の値で始める(開発サーバーがリクエストごとに入れる値)", () => {
    document.documentElement.lang = "en";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ profile: null, locale: "en" })),
    );
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("en:Help")).toBeTruthy();
  });

  it("ビルド済みを配るとき(<html lang> が既定のまま)は、起動後に /api/profile の locale で直す", async () => {
    document.documentElement.lang = "ja";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ profile: null, locale: "en" })),
    );
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("ja:使い方")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("en:Help")).toBeTruthy();
    });
    expect(document.documentElement.lang).toBe("en");
  });

  it("/api/profile が取れなくても、<html lang> の値のまま動く", async () => {
    document.documentElement.lang = "en";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("en:Help")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("en:Help")).toBeTruthy();
  });
});
