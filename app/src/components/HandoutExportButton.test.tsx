import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandoutExportButton } from "./HandoutExportButton";

// 押すと書き出し、知らせにパスと「パスをコピー」「フォルダを開くコマンドをコピー」を並べる

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const exportResult = {
  kind: "sheet",
  id: "sheet_20260923_007",
  path: "/workspace/sheets/sheet_20260923_007/exports/20260923T150000/sheet_20260923_007-20260923T150000.html",
  openCommand:
    "open -R '/workspace/sheets/sheet_20260923_007/exports/20260923T150000/sheet_20260923_007-20260923T150000.html'",
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const exportNow = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "1枚の HTML に書き出す" }),
  );

describe("HandoutExportButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(exportResult), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("押すと書き出して、パスと2つのコピーのボタンを出す。ダウンロードはしない", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    render(
      <Wrapper>
        <HandoutExportButton kind="sheet" id="sheet_20260923_007" />
      </Wrapper>,
    );
    exportNow();
    expect(await screen.findByText(exportResult.path)).toBeTruthy();
    expect(screen.getByRole("button", { name: /パスをコピー/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /フォルダを開くコマンドをコピー/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBe(null);
    expect(click).not.toHaveBeenCalled();
  });

  it("パスをコピーすると、そのボタンだけがコピーしましたに替わる", async () => {
    render(
      <Wrapper>
        <HandoutExportButton kind="sheet" id="sheet_20260923_007" />
      </Wrapper>,
    );
    exportNow();
    fireEvent.click(
      await screen.findByRole("button", { name: /パスをコピー/ }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(exportResult.path),
    );
    expect(
      await screen.findByRole("button", { name: /コピーしました/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /フォルダを開くコマンドをコピー/ }),
    ).toBeTruthy();
  });

  it("フォルダを開くコマンドをコピーすると、サーバーが作ったコマンドが入る", async () => {
    render(
      <Wrapper>
        <HandoutExportButton kind="sheet" id="sheet_20260923_007" />
      </Wrapper>,
    );
    exportNow();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /フォルダを開くコマンドをコピー/,
      }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(exportResult.openCommand),
    );
  });
});
