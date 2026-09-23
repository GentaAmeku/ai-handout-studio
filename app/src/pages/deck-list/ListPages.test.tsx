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
import { z } from "zod";
import type { DeckSummary, HandoutSummary } from "../../api/types";
import { SearchProvider } from "../../search/SearchProvider";
import { SectionListPage } from "../sections/SectionPages";
import { DeckListPage } from "./DeckListPage";

// 資料一覧の写真のカード。3区分とも、題名・中央の印・🗑 を出し、外した項目は出さない。
// お気に入りは ☆ で付け外しし、付いたものは「お気に入り」の区切りに分けて並べる。
// 残りは見出しを付けずに、その下に並べる

const DATE = "2026-09-01T10:00:00.000Z";

const decks: DeckSummary[] = [
  {
    state: "ready",
    deckId: "deck-ready",
    title: "四半期の報告",
    status: "draft",
    tags: [],
    slideCount: 3,
    updatedAt: DATE,
    cover: null,
  },
  {
    state: "invalid",
    deckId: "deck-broken",
    message: "deck.json が読めない",
    updatedAt: DATE,
  },
];

const handout = (
  kind: HandoutSummary["kind"],
  id: string,
  title: string,
  extra: Partial<HandoutSummary> = {},
): HandoutSummary => ({
  kind,
  id,
  title,
  template: "civic",
  createdAt: DATE,
  updatedAt: DATE,
  ...extra,
});

const handouts: Record<HandoutSummary["kind"], HandoutSummary[]> = {
  sheet: [
    handout("sheet", "sheet-a", "要件の確認", {
      questionCount: 4,
      hasAnswers: true,
    }),
    handout("sheet", "sheet-broken", "壊れた質問票", { error: "読めない" }),
  ],
  document: [
    handout("document", "doc-a", "設計の説明"),
    handout("document", "doc-broken", "壊れた資料", { error: "読めない" }),
  ],
};

// お気に入り。一覧は favorite を持ち、PUT /api/favorites/:id で付け外しする
const favorites = { ids: new Set<string>(), fail: false };

const withFavorite = <T,>(items: readonly T[], idOf: (item: T) => string) =>
  items.map((item) => ({ ...item, favorite: favorites.ids.has(idOf(item)) }));

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/decks") {
      return json(withFavorite(decks, (deck) => deck.deckId));
    }
    if (url === "/api/sheets") {
      return json(withFavorite(handouts.sheet, (item) => item.id));
    }
    if (url === "/api/documents") {
      return json(withFavorite(handouts.document, (item) => item.id));
    }
    const favorite = url.match(/^\/api\/favorites\/([^/]+)$/);
    if (favorite?.[1] && method === "PUT") {
      if (favorites.fail) return json({ error: "書き込めない" }, 500);
      const id = favorite[1];
      const next = (JSON.parse(String(init?.body)) as { favorite: boolean })
        .favorite;
      if (next) favorites.ids.add(id);
      if (!next) favorites.ids.delete(id);
      return json({ id, favorite: next });
    }
    const removed = url.match(/^\/api\/(?:decks|sheets|documents)\/([^/]+)$/);
    if (removed && method === "DELETE") {
      return json({ deckId: removed[1], id: removed[1] });
    }
    if (url.endsWith("/preview")) return new Response(null, { status: 200 });
    return json({ error: "ファイルが見つからない" }, 404);
  },
);

class FixedSizeObserver {
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    this.callback(
      [{ contentRect: { width: 640, height: 360 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  vi.stubGlobal("ResizeObserver", FixedSizeObserver);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockClear();
  favorites.ids.clear();
  favorites.fail = false;
});

const Blank = () => null;

// 資料一覧(/_shell/slides の経路名を読む)と、カードの行き先を持つ経路の木
const renderAt = (path: string) => {
  const root = createRootRoute({ component: Outlet });
  const shell = createRoute({
    getParentRoute: () => root,
    id: "_shell",
    // 見出しの Search のボタンは枠の検索の窓を開く
    component: () => (
      <SearchProvider>
        <Outlet />
      </SearchProvider>
    ),
  });
  const route = (routePath: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => shell, path: routePath, component });
  const slides = createRoute({
    getParentRoute: () => shell,
    path: "/slides",
    validateSearch: z.object({
      tag: z.string().optional().catch(undefined),
    }),
    component: DeckListPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      shell.addChildren([
        slides,
        route("/sheets", () => <SectionListPage section="sheet" />),
        route("/documents", () => <SectionListPage section="document" />),
        route("/decks/$deckId", Blank),
        route("/sheets/$id", Blank),
        route("/documents/$id", Blank),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

const card = (title: string) => screen.findByRole("article", { name: title });

const cases = [
  {
    path: "/slides",
    title: "四半期の報告",
    open: "四半期の報告を編集",
    icon: "lucide-pencil",
    to: "/decks/deck-ready",
    api: "/api/decks/deck-ready",
    id: "deck-ready",
    other: "deck-broken",
  },
  {
    path: "/sheets",
    title: "要件の確認",
    open: "要件の確認を開く",
    icon: "lucide-search",
    to: "/sheets/sheet-a",
    api: "/api/sheets/sheet-a",
    id: "sheet-a",
    other: "壊れた質問票",
  },
  {
    path: "/documents",
    title: "設計の説明",
    open: "設計の説明を編集",
    icon: "lucide-pencil",
    to: "/documents/doc-a",
    api: "/api/documents/doc-a",
    id: "doc-a",
    other: "壊れた資料",
  },
] as const;

describe("資料一覧の写真のカード", () => {
  it.each(cases)(
    "$path は写真のカードで、題名・中央の印・🗑 を出す",
    async ({ path, title, open, icon }) => {
      renderAt(path);
      const item = await card(title);
      expect(item.classList.contains("photo-card")).toBe(true);
      expect(
        within(item).getByText(title, { selector: ".photo-card__name" }),
      ).toBeTruthy();
      const picture = within(item).getByRole("link", { name: open });
      const mark = picture.querySelector(".photo-card__icon");
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(mark?.querySelector(`svg.${icon}`)).not.toBeNull();
      expect(
        within(item).getByRole("button", { name: `${title}を削除` }),
      ).toBeTruthy();
      expect(item.closest(".photo-card-grid")).not.toBeNull();
    },
  );

  it.each(cases)(
    "$path のカードを押すと行き先が開く",
    async ({ path, title, open, to }) => {
      const router = renderAt(path);
      const item = await card(title);
      fireEvent.click(within(item).getByRole("link", { name: open }));
      await waitFor(() => expect(router.state.location.pathname).toBe(to));
    },
  );

  it.each(cases)(
    "$path の 🗑 は確かめるダイアログを出し、はいのときだけ消す",
    async ({ path, title, api }) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      renderAt(path);
      const item = await card(title);
      const trash = within(item).getByRole("button", {
        name: `${title}を削除`,
      });
      fireEvent.click(trash);
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining(`「${title}」`),
      );
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
      ).toBe(false);
      confirm.mockReturnValue(true);
      fireEvent.click(trash);
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([url, init]) => init?.method === "DELETE" && String(url) === api,
          ),
        ).toBe(true),
      );
    },
  );

  it.each(cases)(
    "$path は ID・問数・回答・テンプレート・日付・状態・枚数・見本を開く・編集する・標準/コンパクトを出さない",
    async ({ path, title }) => {
      renderAt(path);
      await card(title);
      const main = document.body;
      for (const text of [
        "deck-ready",
        "sheet-a",
        "doc-a",
        "4 問",
        "回答あり",
        "civic",
        "2026/09/01",
        "作成中",
        "完成",
        "3 ページ",
        "見本を開く",
        "編集する",
        "標準",
        "コンパクト",
      ]) {
        expect(within(main).queryByText(text)).toBeNull();
      }
      expect(screen.queryByRole("group", { name: "一覧の表示" })).toBeNull();
      expect(document.querySelector(".density-toggle")).toBeNull();
    },
  );

  it("読めないスライドは印と一言を出し、題名を合わせなくても出す", async () => {
    const router = renderAt("/slides");
    const broken = await card("deck-broken");
    expect(broken.classList.contains("photo-card--titled")).toBe(true);
    expect(within(broken).getByText("読み込めません")).toBeTruthy();
    expect(
      within(broken).getByRole("button", { name: "deck-brokenを削除" }),
    ).toBeTruthy();
    // 読めない資料も今と同じ行き先(内容の確認)が開く
    fireEvent.click(
      within(broken).getByRole("link", { name: "deck-brokenを開く" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/decks/deck-broken"),
    );
  });

  it.each([
    ["/sheets", "壊れた質問票", "壊れた質問票を開く", "/sheets/sheet-broken"],
    ["/documents", "壊れた資料", "壊れた資料を編集", "/documents/doc-broken"],
  ])(
    "%s の読めない資料は印と一言を出し、題名を合わせなくても出す",
    async (path, title, open, to) => {
      const router = renderAt(path);
      const broken = await card(title);
      expect(broken.classList.contains("photo-card--titled")).toBe(true);
      expect(within(broken).getByText("中身が読めません")).toBeTruthy();
      expect(
        within(broken).getByText(title, { selector: ".photo-card__name" }),
      ).toBeTruthy();
      fireEvent.click(within(broken).getByRole("link", { name: open }));
      await waitFor(() => expect(router.state.location.pathname).toBe(to));
    },
  );

  it.each(cases)(
    "$path の見出しの右端に Search のボタンがある(117)",
    async ({ path, title }) => {
      renderAt(path);
      await card(title);
      const header = document.querySelector<HTMLElement>(".page-header");
      expect(header).toBeTruthy();
      expect(
        within(header as HTMLElement).getByRole("button", { name: "Search" }),
      ).toBeTruthy();
    },
  );

  it("スライドの一覧の中の検索欄は外し、作る口も無い", async () => {
    renderAt("/slides");
    await card("四半期の報告");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "テンプレートから作成" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "テキストから作成" }),
    ).toBeNull();
  });
});

const favoriteButton = (item: HTMLElement, title: string) =>
  within(item).getByRole("button", { name: `${title}をお気に入りにする` });

const region = (name: string) => screen.queryByRole("region", { name });

// お気に入りでない資料の並び(見出しは付けない)
const rest = () => document.querySelector<HTMLElement>(".list-rest");

describe("資料一覧のお気に入り", () => {
  it.each(cases)(
    "$path の ☆ を押すと「お気に入り」の区切りへ移り、もう一度押すと戻る",
    async ({ path, title, id, other }) => {
      renderAt(path);
      const item = await card(title);
      expect(region("お気に入り")).toBeNull();
      expect(favoriteButton(item, title).getAttribute("aria-pressed")).toBe(
        "false",
      );
      // ☆ は角、🗑 はその左
      const actions = item.querySelector(".photo-card__actions");
      expect(
        [...(actions?.children ?? [])].map((button) =>
          button.getAttribute("aria-label"),
        ),
      ).toEqual([`${title}を削除`, `${title}をお気に入りにする`]);

      fireEvent.click(favoriteButton(item, title));
      await waitFor(() => expect(region("お気に入り")).not.toBeNull());
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url) === `/api/favorites/${id}` &&
            init?.method === "PUT" &&
            init.body === JSON.stringify({ favorite: true }),
        ),
      ).toBe(true);
      const favoriteSection = region("お気に入り") as HTMLElement;
      const moved = within(favoriteSection).getByRole("article", {
        name: title,
      });
      expect(favoriteButton(moved, title).getAttribute("aria-pressed")).toBe(
        "true",
      );
      // お気に入りは下に重ねない。下の並びには見出しを付けない
      const others = rest() as HTMLElement;
      expect(others.closest(".list-section")).toBeNull();
      expect(within(others).queryByRole("article", { name: title })).toBeNull();
      expect(within(others).getByRole("article", { name: other })).toBeTruthy();
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
      expect(screen.queryByText("そのほか")).toBeNull();

      fireEvent.click(favoriteButton(moved, title));
      await waitFor(() => expect(region("お気に入り")).toBeNull());
      expect(rest()).toBeNull();
    },
  );

  it("全部がお気に入りなら下の並びを出さない", async () => {
    favorites.ids.add("doc-a");
    favorites.ids.add("doc-broken");
    renderAt("/documents");
    await card("設計の説明");
    expect(region("お気に入り")).not.toBeNull();
    expect(rest()).toBeNull();
  });

  it("題名での検索はサイト内検索へ移したので、古い ?q= は読まずに全部を出す", async () => {
    favorites.ids.add("deck-ready");
    renderAt("/slides?q=読めない");
    await card("deck-broken");
    expect(await card("四半期の報告")).toBeTruthy();
    expect(region("お気に入り")).not.toBeNull();
  });

  it("付け外しに失敗したら元に戻し、カードに知らせを出す", async () => {
    favorites.fail = true;
    renderAt("/sheets");
    const item = await card("要件の確認");
    fireEvent.click(favoriteButton(item, "要件の確認"));
    const restored = await card("要件の確認");
    await waitFor(() =>
      expect(within(restored).getByRole("alert").textContent).toContain(
        "書き込めない",
      ),
    );
    expect(
      favoriteButton(restored, "要件の確認").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(region("お気に入り")).toBeNull();
  });
});
