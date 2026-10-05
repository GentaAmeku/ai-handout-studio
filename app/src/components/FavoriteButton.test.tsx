import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handoutQuery } from "../api/queries";
import type { HandoutDetail } from "../api/types";
import { FavoriteButton } from "./FavoriteButton";

// 質問票の1件のページと HTML 資料の編集画面の帯の ☆。
// 押すとすぐ印が替わり、付け外しできなかったときは元に戻して理由を出す

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = "sheet_20260921_001";

const detail = (favorite: boolean): HandoutDetail => ({
  kind: "sheet",
  id,
  title: "見本",
  template: "cobalt",
  createdAt: "2026-09-21T00:30:00.000Z",
  updatedAt: "2026-09-21T09:05:00.000Z",
  shareUrl: null,
  favorite,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// サーバーの代わり。お気に入りの印を1つ持ち、PUT で替えて GET で返す
const stubServer = (putStatus = 200) => {
  const state = { favorite: false };
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      if (putStatus !== 200) return json({ error: "資料が見つからない" }, 404);
      state.favorite = (
        JSON.parse(String(init.body)) as HandoutDetail
      ).favorite;
      return json({ id, favorite: state.favorite });
    }
    if (path === `/api/sheets/${id}`) return json(detail(state.favorite));
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

// 画面と同じく、1件の控えから印を読んで ☆ に渡す
const Bar = () => {
  const handout = useQuery(handoutQuery("sheet", id));
  return handout.data ? (
    <FavoriteButton kind="sheet" id={id} favorite={handout.data.favorite} />
  ) : null;
};

const renderBar = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(handoutQuery("sheet", id).queryKey, detail(false));
  render(
    <QueryClientProvider client={client}>
      <Bar />
    </QueryClientProvider>,
  );
};

const star = () => screen.getByRole("button", { name: "お気に入りにする" });

describe("FavoriteButton", () => {
  it("押すとお気に入りの API に送り、押された印と「お気に入りから外す」の吹き出しに替わる", async () => {
    const fetchMock = stubServer();
    renderBar();
    expect(star().getAttribute("aria-pressed")).toBe("false");
    expect(star().getAttribute("data-tooltip")).toBe("お気に入りにする");

    fireEvent.click(star());

    await waitFor(() =>
      expect(star().getAttribute("aria-pressed")).toBe("true"),
    );
    expect(star().getAttribute("data-tooltip")).toBe("お気に入りから外す");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/favorites/${id}`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ favorite: true }),
      }),
    );
  });

  it("付け外しできなかったら印を元に戻し、帯の下に理由を出す", async () => {
    stubServer(404);
    renderBar();
    fireEvent.click(star());

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("資料が見つからない")).toBeTruthy();
    expect(star().getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "お知らせを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBe(null));
  });
});
