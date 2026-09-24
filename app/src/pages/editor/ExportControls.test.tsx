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
import type { ExportResult } from "../../api/types";
import { ExportControls } from "./ExportControls";

// スライドの書き出し。知らせにパスを出し、HTML 資料・質問票と同じ2つのコピーのボタンを並べる

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const directory = "/workspace/decks/deck_20260924_001/exports/20260924T100000";

const exportResult: ExportResult = {
  format: "pdf",
  directory,
  files: ["deck.pdf"],
  path: `${directory}/deck.pdf`,
  openCommand: `open -R '${directory}/deck.pdf'`,
  overflow: [],
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("ExportControls", () => {
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

  it("書き出すとパスを出し、パスとフォルダを開くコマンドをコピーできる", async () => {
    render(
      <Wrapper>
        <ExportControls deckId="deck_20260924_001" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(await screen.findByText(exportResult.path)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /パスをコピー/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(exportResult.path),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /フォルダを開くコマンドをコピー/ }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(exportResult.openCommand),
    );
  });
});
