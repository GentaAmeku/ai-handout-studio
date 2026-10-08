import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentHit, DeckSummary, HandoutSummary } from "../api/types";
import { SearchButton } from "./SearchButton";
import { SearchProvider } from "./SearchProvider";

// サイト内検索。見出しの Search のボタンで窓が開き、打つと6区分ごとに当たったものが並ぶ。
// 1件目を選んだ状態で始め、↑↓ と Enter、またはマウスで開く。
// その下に「資料の中身」の区分が足される(179。GET /api/search)

const DATE = "2026-09-22T00:00:00Z";

const decks: DeckSummary[] = [
  {
    state: "ready",
    deckId: "deck_001",
    title: "AI が作る資料",
    status: "draft",
    tags: [],
    slideCount: 3,
    updatedAt: DATE,
    cover: null,
  },
];

const handout = (
  kind: HandoutSummary["kind"],
  id: string,
  title: string,
): HandoutSummary => ({
  kind,
  id,
  title,
  template: "cobalt",
  createdAt: DATE,
  updatedAt: DATE,
});

const lists: Record<string, unknown> = {
  "/api/decks": decks.map((deck) => ({ ...deck, favorite: false })),
  "/api/sheets": [
    handout("sheet", "sheet_001", "資料一覧の決めごと"),
    handout("sheet", "sheet_002", "メモリの棚卸し"),
  ].map((item) => ({ ...item, favorite: false })),
  "/api/documents": [handout("document", "doc_001", "使い方と仕組み")].map(
    (item) => ({ ...item, favorite: false }),
  ),
  "/api/design/templates": {
    tokens: {},
    components: {},
    templates: {
      slide: [{ name: "lumen", label: "Lumen" }],
      sheet: [{ name: "cobalt", label: "Cobalt" }],
      document: [
        {
          name: "cobalt",
          label: "Cobalt",
          description: "公共機関の資料でよく見る組み",
        },
      ],
    },
    selection: { slide: "lumen", sheet: "cobalt", document: "cobalt" },
  },
};

// 中身の当たり。打った文ごとに返す(無い文は0件)
const contentHits: Record<string, ContentHit[]> = {
  週次: [
    {
      kind: "document",
      id: "doc_001",
      title: "使い方と仕組み",
      place: { type: "section", heading: "保存" },
      snippet: [
        { text: "…控えを", hit: false },
        { text: "週次", hit: true },
        { text: "で取る", hit: false },
      ],
    },
    {
      kind: "slide",
      id: "deck_001",
      title: "AI が作る資料",
      place: { type: "slide", number: 3, slideId: "s3" },
      snippet: [{ text: "週次の振り返り", hit: false }],
    },
  ],
  資料: [
    {
      kind: "document",
      id: "doc_002",
      title: "週次の記録",
      place: { type: "overview" },
      snippet: [{ text: "資料", hit: true }],
    },
  ],
};

const SEARCH_PATH = "/api/search?q=";

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = url.startsWith(SEARCH_PATH)
    ? {
        hits:
          contentHits[decodeURIComponent(url.slice(SEARCH_PATH.length))] ?? [],
      }
    : lists[url];
  return body === undefined
    ? new Response(JSON.stringify({ error: "無い" }), { status: 404 })
    : new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Page = () => (
  <header className="page-header">
    <h1>資料一覧</h1>
    <SearchButton />
  </header>
);

const Blank = () => null;

const renderApp = () => {
  const root = createRootRoute({ component: Outlet });
  const shell = createRoute({
    getParentRoute: () => root,
    id: "_shell",
    component: () => (
      <SearchProvider>
        <Outlet />
      </SearchProvider>
    ),
  });
  const route = (path: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => shell, path, component });
  const router = createRouter({
    routeTree: root.addChildren([
      shell.addChildren([
        route("/slides", Page),
        route("/decks/$deckId", Blank),
        route("/sheets/$id", Blank),
        route("/documents/$id", Blank),
        route("/slides/templates/$name", Blank),
        route("/sheets/templates/$name", Blank),
        route("/documents/templates/$name", Blank),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: ["/slides"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

const dialog = () =>
  document.querySelector<HTMLDialogElement>("dialog.search-dialog");

const openSearch = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Search" }));
  return screen.getByRole("textbox", { name: "Search" });
};

const rows = () =>
  [...document.querySelectorAll<HTMLElement>(".search-dialog__row")].map(
    (row) => row.querySelector(".search-dialog__title")?.textContent,
  );

const contentPlaces = () =>
  [...document.querySelectorAll(".search-dialog__place")].map(
    (place) => place.textContent,
  );

const groupLabels = () =>
  [...document.querySelectorAll(".search-dialog__group")].map((group) =>
    group.getAttribute("aria-label"),
  );

const activeRow = () =>
  document.querySelector(".search-dialog__row.is-active .search-dialog__title")
    ?.textContent;

describe("サイト内検索", () => {
  it("Search のボタンで窓が開き、打つまでは欄だけ", async () => {
    renderApp();
    const input = await openSearch();
    expect(dialog()?.open).toBe(true);
    expect((input as HTMLInputElement).value).toBe("");
    expect(input.getAttribute("placeholder")).toBe("Search");
    expect(document.querySelector(".search-dialog__body")).toBeNull();
  });

  it("打つと区分ごとに当たったものが並び、1件目が選ばれている", async () => {
    renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "資料" } });
    await waitFor(() =>
      expect(rows()).toEqual(["AI が作る資料", "資料一覧の決めごと", "Cobalt"]),
    );
    const labels = [...document.querySelectorAll(".search-dialog__group")].map(
      (group) => group.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["スライド", "質問票", "HTML 資料のテンプレート"]);
    expect(activeRow()).toBe("AI が作る資料");
    // 当たった所は印になる
    const marks = [...document.querySelectorAll(".search-dialog mark")].map(
      (mark) => mark.textContent,
    );
    expect(marks.every((mark) => mark === "資料")).toBe(true);
  });

  it("↓ と Enter で選んだものが開き、窓が閉じる", async () => {
    const router = renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "資料" } });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRow()).toBe("資料一覧の決めごと");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/sheets/sheet_001"),
    );
    expect(dialog()?.open).toBe(false);
  });

  it("マウスで行を押すと、テンプレートの編集が開く", async () => {
    const router = renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "lumen" } });
    await waitFor(() => expect(rows()).toEqual(["Lumen"]));
    const group = screen.getByRole("region", {
      name: "スライドのテンプレート",
    });
    fireEvent.click(within(group).getByRole("link"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/slides/templates/lumen"),
    );
    expect(dialog()?.open).toBe(false);
  });

  it("当たらなければ「見つかりませんでした」と出す", async () => {
    renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "存在しない語" } });
    expect(await screen.findByText("見つかりませんでした")).toBeTruthy();
    expect(rows()).toEqual([]);
  });

  it("中身の当たりは「資料の中身」に並び、場所の札と前後の文を出す", async () => {
    renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "週次" } });
    await waitFor(() =>
      expect(rows()).toEqual(["使い方と仕組み", "AI が作る資料"]),
    );
    expect(groupLabels()).toEqual(["資料の中身"]);
    expect(contentPlaces()).toEqual(["保存", "スライド 3"]);
    expect(activeRow()).toBe("使い方と仕組み");
    expect(
      [...document.querySelectorAll(".search-dialog__snippet mark")].map(
        (mark) => mark.textContent,
      ),
    ).toEqual(["週次"]);
  });

  it("↓ で題名の行から中身の行へ移り、Enter で資料を開く", async () => {
    const router = renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "資料" } });
    await waitFor(() =>
      expect(rows()).toEqual([
        "AI が作る資料",
        "資料一覧の決めごと",
        "Cobalt",
        "週次の記録",
      ]),
    );
    expect(groupLabels().at(-1)).toBe("資料の中身");
    expect(contentPlaces()).toEqual(["概要"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeRow()).toBe("週次の記録");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents/doc_002"),
    );
    expect(dialog()?.open).toBe(false);
  });

  it("スライドの中身の行は、当たったスライドを開く", async () => {
    const router = renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "週次" } });
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole("link", { name: /AI が作る資料/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/decks/deck_001"),
    );
    expect(router.state.location.search).toEqual({ slide: "s3" });
  });

  it("1字では中身を問い合わせない", async () => {
    renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "資" } });
    await waitFor(() => expect(rows()).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      fetchMock.mock.calls.some(([request]) =>
        String(request).startsWith(SEARCH_PATH),
      ),
    ).toBe(false);
  });

  it("× で閉じ、開き直すと欄は空", async () => {
    renderApp();
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "資料" } });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(dialog()?.open).toBe(false);
    const reopened = await openSearch();
    expect((reopened as HTMLInputElement).value).toBe("");
  });
});
