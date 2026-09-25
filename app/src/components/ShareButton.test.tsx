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
import { ShareButton } from "./ShareButton";

// 押すと束を作り直して依頼文をコピーし、押したボタンの下に吹き出しで知らせる。
// コピーは3段(123 と同じ): clipboard → execCommand → 手で写す欄

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const shareResult = {
  bundle: "/workspace/sheets/sheet_20260923_007/share",
  files: [{ name: "index.html", bytes: 1200 }],
  textBytes: 1200,
  url: null,
  prompt: "次の束を Claude の Artifact として公開してください。",
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("ShareButton", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => json(shareResult));
    vi.stubGlobal("fetch", fetchMock);
    writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("押すと束を作り、依頼文をクリップボードにコピーして知らせを出す", async () => {
    render(
      <Wrapper>
        <ShareButton kind="sheet" id="sheet_20260923_007" sharedUrl={null} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /共有の依頼をコピー/ }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(shareResult.prompt),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sheets/sheet_20260923_007/share",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/共有の依頼をコピーしました/)).toBeTruthy();
  });

  it("クリップボードが使えないときは execCommand で試し、それも失敗すれば手で写す欄を出す", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    render(
      <Wrapper>
        <ShareButton kind="sheet" id="sheet_20260923_007" sharedUrl={null} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /共有の依頼をコピー/ }));

    expect(await screen.findByText(/コピーできませんでした/)).toBeTruthy();
    const fallback = (await screen.findByDisplayValue(
      shareResult.prompt,
    )) as HTMLTextAreaElement;
    expect(fallback.tagName).toBe("TEXTAREA");
  });

  it("警告は吹き出しの下の札に出し、閉じるまで残す", async () => {
    fetchMock.mockImplementation(async () =>
      json({ ...shareResult, warning: "[[要確認]] が 2 か所残っている" }),
    );
    render(
      <Wrapper>
        <ShareButton kind="sheet" id="sheet_20260923_007" sharedUrl={null} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /共有の依頼をコピー/ }));

    expect(
      await screen.findByText("[[要確認]] が 2 か所残っている"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "お知らせを閉じる" }));
    expect(screen.queryByText("[[要確認]] が 2 か所残っている")).toBeNull();
    expect(screen.queryByText(/共有の依頼をコピーしました/)).toBeNull();
  });

  it("束を作れなかったときは理由を札に出し、コピーしない", async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: "資料が見つからない" }, 404),
    );
    render(
      <Wrapper>
        <ShareButton kind="sheet" id="sheet_20260923_007" sharedUrl={null} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /共有の依頼をコピー/ }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "資料が見つからない",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("公開済みの URL があれば「共有中」とリンクを出す", () => {
    render(
      <Wrapper>
        <ShareButton
          kind="document"
          id="doc_20260923_001"
          sharedUrl="https://claude.ai/artifacts/demo"
        />
      </Wrapper>,
    );
    const link = screen.getByRole("link", { name: /共有中/ });
    expect(link.getAttribute("href")).toBe("https://claude.ai/artifacts/demo");
    expect(link.getAttribute("target")).toBe("_blank");
    // URL の文字は帯に出さず、マウスを合わせたときの表示に残す
    expect(link.textContent).not.toContain("claude.ai");
    expect(link.getAttribute("title")).toBe("https://claude.ai/artifacts/demo");
  });

  it("disabledReason を渡すと押せず、理由が吹き出し(data-tooltip)に出る", () => {
    render(
      <Wrapper>
        <ShareButton
          kind="document"
          id="doc_20260923_001"
          sharedUrl={null}
          disabledReason="保存してから共有します"
        />
      </Wrapper>,
    );
    const button = screen.getByRole("button", {
      name: /共有の依頼をコピー/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.dataset.tooltip).toBe("保存してから共有します");
    // ブラウザーの title は使わない(吹き出しと二重になる)
    expect(button.hasAttribute("title")).toBe(false);
    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
