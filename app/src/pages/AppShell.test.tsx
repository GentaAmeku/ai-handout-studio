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
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// 狭い画面では、左のメニューを上の帯に畳み、≡ で帯の下に広げる。
// 広げたメニューは、項目を選ぶか、外を押すか、Esc で閉じる。
// 幅で帯とメニューを出し分けるのは CSS(app.css)なので、ここでは開閉の状態を確かめる

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderAt = (path: string) => {
  const root = createRootRoute({ component: Outlet });
  const shell = createRoute({
    getParentRoute: () => root,
    id: "_shell",
    component: AppShell,
  });
  const page = (to: string, text: string) =>
    createRoute({
      getParentRoute: () => shell,
      path: to,
      component: () => <p>{text}</p>,
    });
  const router = createRouter({
    routeTree: root.addChildren([
      shell.addChildren([
        page("/slides", "スライドの画面"),
        page("/settings", "設定の画面"),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const openMenu = async () => {
  const toggle = await screen.findByRole("button", { name: "メニュー" });
  fireEvent.click(toggle);
  const menu = document.getElementById(
    toggle.getAttribute("aria-controls") ?? "",
  );
  if (!menu) throw new Error("メニューが無い");
  return { toggle, menu };
};

const isOpen = (toggle: HTMLElement, menu: HTMLElement) =>
  toggle.getAttribute("aria-expanded") === "true" &&
  menu.classList.contains("is-open") &&
  document.querySelector(".app-backdrop") !== null;

describe("狭い画面のメニュー", () => {
  it("≡ で広げ、もう一度押すと閉じる", async () => {
    renderAt("/slides");
    const { toggle, menu } = await openMenu();
    expect(isOpen(toggle, menu)).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(menu.classList.contains("is-open")).toBe(false);
    expect(document.querySelector(".app-backdrop")).toBeNull();
  });

  it("項目を選ぶと、その画面へ移って閉じる", async () => {
    renderAt("/slides");
    const { toggle, menu } = await openMenu();
    fireEvent.click(screen.getByRole("link", { name: "設定" }));
    expect(await screen.findByText("設定の画面")).toBeTruthy();
    expect(isOpen(toggle, menu)).toBe(false);
  });

  it("メニューの中を押しても閉じず、外を押すと閉じる", async () => {
    renderAt("/slides");
    const { toggle, menu } = await openMenu();
    fireEvent.pointerDown(screen.getByText("質問票"));
    expect(isOpen(toggle, menu)).toBe(true);
    fireEvent.pointerDown(screen.getByText("スライドの画面"));
    await waitFor(() => expect(isOpen(toggle, menu)).toBe(false));
  });

  it("Esc で閉じて、≡ にフォーカスを戻す", async () => {
    renderAt("/slides");
    const { toggle, menu } = await openMenu();
    screen.getByRole("link", { name: "設定" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(isOpen(toggle, menu)).toBe(false));
    expect(document.activeElement).toBe(toggle);
  });
});
