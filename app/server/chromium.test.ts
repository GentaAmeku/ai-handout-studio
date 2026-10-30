import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHROMIUM_MISSING, launchChromium } from "./chromium.ts";
import { createExporter } from "./exporter.ts";

const launch = vi.hoisted(() => vi.fn());
vi.mock("playwright", () => ({ chromium: { launch } }));

// Chromium を入れていないときに Playwright が投げる文(罫線の箱は短くしてある)
const missing = () =>
  new Error(
    "browserType.launch: Executable doesn't exist at /Users/me/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-mac/headless_shell\n╔═══╗\n║ npx playwright install ║\n╚═══╝",
  );

beforeEach(() => {
  launch.mockReset();
});

describe("launchChromium", () => {
  it("Chromium が無いときは、この repo での入れ方を案内する", async () => {
    launch.mockRejectedValue(missing());
    await expect(launchChromium()).rejects.toThrow(CHROMIUM_MISSING);
  });

  it("ほかの失敗は、そのまま投げる", async () => {
    launch.mockRejectedValue(new Error("Host system is missing dependencies"));
    await expect(launchChromium()).rejects.toThrow(
      "Host system is missing dependencies",
    );
  });
});

describe("createExporter", () => {
  it("起動に失敗したブラウザを持たず、次の書き出しで起動し直す", async () => {
    launch.mockRejectedValue(missing());
    const exporter = createExporter({ getOrigin: () => "http://127.0.0.1" });
    const job = {
      deckId: "deck",
      format: "pdf" as const,
      outDir: "/nowhere",
      title: "t",
    };
    await expect(exporter.exportDeck(job)).rejects.toThrow(CHROMIUM_MISSING);
    await expect(exporter.exportDeck(job)).rejects.toThrow(CHROMIUM_MISSING);
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
