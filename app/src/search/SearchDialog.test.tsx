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
import type { DeckSummary, HandoutSummary } from "../api/types";
import { SearchButton } from "./SearchButton";
import { SearchProvider } from "./SearchProvider";

// サイト内検索。見出しの Search のボタンで窓が開き、打つと6区分ごとに当たったものが並ぶ。
// 1件目を選んだ状態で始め、↑↓ と Enter、またはマウスで開く

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

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const body = lists[String(input)];
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
