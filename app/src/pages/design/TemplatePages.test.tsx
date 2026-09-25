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
import components from "../../../../design/components.json";
import sheetFocusSample from "../../../../design/samples/sheet.focus.html?raw";
import defaultDocument from "../../../../design/templates/document/default/template.json";
import defaultSheet from "../../../../design/templates/sheet/default/template.json";
import cobaltSlide from "../../../../design/templates/slide/cobalt/template.json";
import defaultSlide from "../../../../design/templates/slide/default/template.json";
import tokens from "../../../../design/tokens.json";
import type { Surface } from "../../schema/design";
import { TemplateListPage } from "../templates/TemplateListPage";
import { TemplateEditPage } from "./TemplateEditPage";

const defaults = {
  slide: defaultSlide,
  sheet: defaultSheet,
  document: defaultDocument,
} as Record<string, { label: string; tokens: { color: object } }>;

const ACME_PRIMARY = "#0f766e";

// 区分ごとに、default と acme(主色だけ違う)の2つを持つ。複製で作ったものは created に入る
const created = new Map<string, unknown>();

const templateOf = (surface: string, name: string) => {
  const saved = created.get(`${surface}/${name}`);
  if (saved) return saved;
  const base = defaults[surface];
  if (!base) throw new Error(`知らない区分 ${surface}`);
  return name === "acme"
    ? {
        ...base,
        label: "Acme",
        tokens: { color: { ...base.tokens.color, primary: ACME_PRIMARY } },
      }
    : base;
};

const selection = {
  slide: "default",
  sheet: "default",
  document: "default",
};

const summaries = [
  { name: "acme", label: "Acme" },
  {
    name: "default",
    label: "Default",
    description: "いつもの見た目",
  },
];

const templatesBody = () => ({
  tokens,
  components,
  templates: { slide: summaries, sheet: summaries, document: summaries },
  selection,
});

// jsdom はレイアウトを計算しないので、見本の枠を 640x360 として知らせる
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

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

// 見本の HTML(design/samples/)があるかどうか。テストごとに切り替える
const samples = { ready: true };

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/design/templates") return json(templatesBody());
    const template = url.match(
      /^\/api\/design\/templates\/([a-z]+)\/([a-z-]+)$/,
    );
    if (template && method === "GET") {
      const [, surface = "", name = ""] = template;
      return json({ surface, name, template: templateOf(surface, name) });
    }
    if (template && method === "PUT") {
      const sent = JSON.parse(String(init?.body));
      if (sent.create)
        created.set(`${template[1]}/${template[2]}`, sent.template);
      return json(
        { surface: template[1], name: template[2], template: sent.template },
        sent.create ? 201 : 200,
      );
    }
    if (url === "/api/design/selection" && method === "PUT") {
      return json(JSON.parse(String(init?.body)));
    }
    if (url === "/api/design/build") return json({ files: ["dist/slide.css"] });
    const component = url.match(
      /^\/api\/design\/components\/([a-z-]+)\/variants$/,
    )?.[1];
    if (component && method === "POST") {
      const sent = JSON.parse(String(init?.body));
      return json(
        { component, id: sent.id, variant: { label: sent.label, vars: {} } },
        201,
      );
    }
    if (samples.ready && url.startsWith("/api/design/files/samples/")) {
      return new Response(null, { status: 200 });
    }
    return json({ error: "ファイルが見つからない" }, 404);
  },
);

beforeEach(() => {
  // jsdom は dialog を開けないので、open を立てるだけにする
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  vi.stubGlobal("ResizeObserver", FixedSizeObserver);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  created.clear();
  samples.ready = true;
});

const sectionPaths: Record<Surface, string> = {
  slide: "/slides/templates",
  sheet: "/sheets/templates",
  document: "/documents/templates",
};

const renderAt = (path: string) => {
  const root = createRootRoute({ component: Outlet });
  const route = (routePath: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => root, path: routePath, component });
  const sections = (Object.keys(sectionPaths) as Surface[]).flatMap(
    (surface) => {
      const edit = createRoute({
        getParentRoute: () => root,
        path: `${sectionPaths[surface]}/$name`,
        component: () => (
          <TemplateEditPage surface={surface} name={edit.useParams().name} />
        ),
      });
      return [
        route(sectionPaths[surface], () => (
          <TemplateListPage surface={surface} />
        )),
        edit,
      ];
    },
  );
  const router = createRouter({
    routeTree: root.addChildren(sections),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${init?.method ?? "GET"} ${String(url)}`,
  );

const sentBody = (path: string) => {
  const put = fetchMock.mock.calls.find(
    ([url, init]) =>
      init?.method === "PUT" && String(url) === `/api/design/templates/${path}`,
  );
  return JSON.parse(String(put?.[1]?.body));
};

const sentSelection = () => {
  const put = fetchMock.mock.calls.find(
    ([url]) => String(url) === "/api/design/selection",
  );
  return JSON.parse(String(put?.[1]?.body));
};

const save = () =>
  screen.getByRole("button", {
    name: "保存して CSS を作る",
  }) as HTMLButtonElement;

const stageSlide = () =>
  document.querySelector<HTMLElement>(".design-stage [data-slide-id]");

const card = async (label: string) =>
  screen.findByRole("article", { name: label });

const DEFAULT_LABEL = "Default";

// 文字の大きさの節の今の値(例: 110%)
const currentScale = () =>
  document.querySelector(".text-scale__value")?.textContent;

const starOf = (item: HTMLElement, label: string) =>
  within(item).getByRole("button", { name: `${label}を既定にする` });

describe("テンプレートの一覧", () => {
  it.each(Object.entries(sectionPaths))(
    "%s も写真のカードで、名前・☆(既定にする)・✎(編集)を出す",
    async (_surface, path) => {
      renderAt(path);
      const acme = await card("Acme");
      expect(
        within(acme).getByText("Acme", {
          selector: ".photo-card__name",
        }),
      ).toBeTruthy();
      expect(starOf(acme, "Acme").getAttribute("aria-pressed")).toBe("false");
      // 編集を開くのは絵そのもの。✎ は絵の中央に出る飾りで、読み上げは絵の名前に任せる
      const picture = within(acme).getByRole("link", { name: "Acmeを編集" });
      expect(picture.classList.contains("photo-card__preview")).toBe(true);
      const pencil = picture.querySelector(".photo-card__icon");
      expect(pencil?.getAttribute("aria-hidden")).toBe("true");
      // 既定のカードは ★ が押された状態で出る
      const standard = await card(DEFAULT_LABEL);
      expect(starOf(standard, DEFAULT_LABEL).getAttribute("aria-pressed")).toBe(
        "true",
      );
    },
  );

  it("スライドは見本の表紙だけを、そのテンプレートの値で描く", async () => {
    renderAt("/slides/templates");
    const acme = await card("Acme");
    await waitFor(() =>
      expect(
        acme
          .querySelector<HTMLElement>("[data-slide-id]")
          ?.style.getPropertyValue("--color-primary"),
      ).toBe(ACME_PRIMARY),
    );
    expect(acme.querySelectorAll("[data-slide-id]")).toHaveLength(1);
  });

  it("質問票はテンプレートの骨格で1問の画面を、文書は紙を見本にし、そのテンプレートの CSS で描く", async () => {
    renderAt("/sheets/templates");
    const sheet = await card(DEFAULT_LABEL);
    await waitFor(() =>
      expect(within(sheet).getByTitle(DEFAULT_LABEL).getAttribute("src")).toBe(
        "/api/design/files/samples/sheet.focus.html?template=default",
      ),
    );
    cleanup();
    renderAt("/documents/templates");
    const paper = await card(DEFAULT_LABEL);
    await waitFor(() =>
      expect(within(paper).getByTitle(DEFAULT_LABEL).getAttribute("src")).toBe(
        "/api/design/files/samples/document.html?template=default",
      ),
    );
  });

  it("説明・識別子・既定の札・複製・この見た目で作成・表示の切り替えは出さない", async () => {
    renderAt("/slides/templates");
    const standard = await card(DEFAULT_LABEL);
    expect(within(standard).queryByText("いつもの見た目")).toBeNull();
    expect(within(standard).queryByText("default")).toBeNull();
    expect(within(standard).queryByText("既定")).toBeNull();
    expect(screen.queryByRole("button", { name: /複製/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "この見た目で作成" }),
    ).toBeNull();
    expect(screen.queryByRole("group", { name: "一覧の表示" })).toBeNull();
    expect(screen.queryByRole("button", { name: "コンパクト" })).toBeNull();
  });

  it("☆ で既定が移り、選択を保存して build する。既定の ★ は押しても何もしない", async () => {
    renderAt("/sheets/templates");
    const standard = await card(DEFAULT_LABEL);
    fireEvent.click(starOf(standard, DEFAULT_LABEL));
    expect(calls()).not.toContain("PUT /api/design/selection");

    const acme = await card("Acme");
    fireEvent.click(starOf(acme, "Acme"));
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    expect(sentSelection()).toEqual({ ...selection, sheet: "acme" });
    expect(calls().indexOf("POST /api/design/build")).toBeGreaterThan(
      calls().indexOf("PUT /api/design/selection"),
    );
    // 既定が移るとカードは区切りを移って作り直されるので、引き直す
    await waitFor(async () =>
      expect(
        starOf(await card("Acme"), "Acme").getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      starOf(await card(DEFAULT_LABEL), DEFAULT_LABEL).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    const pinned = screen.getByRole("region", { name: "既定" });
    expect(within(pinned).getByRole("article", { name: "Acme" })).toBeTruthy();
    expect(
      within(pinned).queryByRole("article", { name: DEFAULT_LABEL }),
    ).toBeNull();
  });

  it.each(Object.entries(sectionPaths))(
    "%s は既定のテンプレートを「既定」の見出しの下に分け、残りは見出しを付けずに下に並べる(116)",
    async (_surface, path) => {
      renderAt(path);
      await card("Acme");
      const pinned = screen.getByRole("region", { name: "既定" });
      expect(
        within(pinned)
          .getAllByRole("article")
          .map((item) => item.getAttribute("aria-label")),
      ).toEqual([DEFAULT_LABEL]);
      const rest = document.querySelector<HTMLElement>(".list-rest");
      expect(rest?.closest(".list-section")).toBeNull();
      expect(
        within(rest as HTMLElement).getByRole("article", { name: "Acme" }),
      ).toBeTruthy();
      expect(
        within(rest as HTMLElement).queryByRole("article", {
          name: DEFAULT_LABEL,
        }),
      ).toBeNull();
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    },
  );

  it("カードの絵(中央の ✎ を含む)でテンプレートの編集を開く", async () => {
    const router = renderAt("/documents/templates");
    const acme = await card("Acme");
    fireEvent.click(
      within(acme)
        .getByRole("link", { name: "Acmeを編集" })
        .querySelector(".photo-card__icon") as Element,
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/documents/templates/acme"),
    );
  });
});

describe("テンプレートの編集", () => {
  it("スライドはレイアウトの節が無く、名前・説明・色などの欄も無い", async () => {
    renderAt("/slides/templates/default");
    // 既定の印(★)が出るのを待って読み込み終わりとする
    await screen.findByRole("button", { name: "既定" });
    expect(screen.queryByRole("heading", { name: "レイアウト" })).toBeNull();
    expect(screen.queryByLabelText("テンプレートの表示名")).toBeNull();
    expect(screen.queryByLabelText("説明")).toBeNull();
    expect(
      document.querySelector('input[aria-label="--color-primary"]'),
    ).toBeNull();
    // 未保存・保存済みの文字は上の帯から外した
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("質問票と文書は「レイアウト」の節だけを出し、消した欄・タブ・導線は無い", async () => {
    renderAt("/documents/templates/default");
    await screen.findByRole("heading", { name: "レイアウト" });
    expect(screen.queryByLabelText("テンプレートの表示名")).toBeNull();
    expect(screen.queryByLabelText("説明")).toBeNull();
    expect(screen.queryByRole("button", { name: "色" })).toBeNull();
    expect(screen.queryByRole("button", { name: "書体と大きさ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "余白と角" })).toBeNull();
    expect(screen.queryByRole("button", { name: "部品" })).toBeNull();
    expect(screen.queryByLabelText("色を写す元のテンプレート")).toBeNull();
    expect(screen.queryByRole("link", { name: "部品の形を作る" })).toBeNull();
    expect(
      document.querySelector('input[aria-label="--color-primary"]'),
    ).toBeNull();
  });

  it("サムネイルで見本のページを切り替え、倍率を選べる", async () => {
    renderAt("/slides/templates/default");
    fireEvent.click(await screen.findByLabelText("スライド 3 を選ぶ"));
    expect(screen.getByText("3 / 10 ページ")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    const box = document.querySelector<HTMLElement>(".design-stage__box");
    expect(box?.style.width).toBe("1280px");
  });

  it("質問票のレイアウトは1問ずつ・全問の2つで、一覧の位置は1問ずつのときだけ出す。保存で layout に書く", async () => {
    renderAt("/sheets/templates/default");
    // 選択肢の下に、見本の一覧が開閉できることを添える
    await screen.findByText(/1問ずつは質問一覧が開いた状態で始まります/);
    const choices = screen
      .getAllByRole("radio")
      .filter((input) => input.getAttribute("name") === "skeleton-base");
    expect(choices.map((input) => input.closest("label")?.textContent)).toEqual(
      ["1問ずつ", "全問"],
    );
    expect((screen.getByLabelText("1問ずつ") as HTMLInputElement).checked).toBe(
      true,
    );
    // 移動の帯の位置は廃止
    expect(screen.queryByText("移動の帯の位置")).toBeNull();
    expect(screen.queryByLabelText("帯を上")).toBeNull();
    await waitFor(() =>
      expect(screen.getByTitle("質問票").getAttribute("src")).toBe(
        "/api/design/files/samples/sheet.focus.html?template=default",
      ),
    );
    fireEvent.click(screen.getByLabelText("右"));
    expect((screen.getByLabelText("右") as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByLabelText("全問"));
    await waitFor(() =>
      expect(screen.getByTitle("質問票").getAttribute("src")).toBe(
        "/api/design/files/samples/sheet.all.html?template=default",
      ),
    );
    // 全問には一覧が無いので、一覧の位置は出さない
    expect(screen.queryByText("一覧の位置")).toBeNull();
    fireEvent.click(save());
    await screen.findByText("保存時の検査");
    const sent = sentBody("sheet/default");
    expect(sent.template.layout).toEqual({
      ...defaultSheet.layout,
      base: "all",
      list: { ...defaultSheet.layout.list, side: "right" },
    });
    expect(sent.template.layout).not.toHaveProperty("navigation");
    // 画面から外した色・部品は、保存でも消えず残る
    expect(sent.template.tokens).toEqual(defaultSheet.tokens);
    expect(sent.template.components).toEqual(defaultSheet.components);
    expect(calls().indexOf("POST /api/design/build")).toBeGreaterThan(
      calls().indexOf("PUT /api/design/templates/sheet/default"),
    );
    // jsdom は寸法が 0 なので、はみ出しは出ない。検査が回り切ることを見る
    await waitFor(() =>
      expect(screen.getByText("見本にはみ出しはありません")).toBeTruthy(),
    );
  });

  it("overview と移動の帯の位置を持つ前の形のテンプレートは、1問ずつが選ばれ、保存で帯の位置を捨てる", async () => {
    created.set("sheet/acme", {
      ...defaultSheet,
      label: "Acme",
      layout: { ...defaultSheet.layout, base: "overview", navigation: "top" },
    });
    renderAt("/sheets/templates/acme");
    const focus = (await screen.findByLabelText("1問ずつ")) as HTMLInputElement;
    expect(focus.checked).toBe(true);
    expect((screen.getByLabelText("全問") as HTMLInputElement).checked).toBe(
      false,
    );
    // overview は1問ずつと同じに描くので、見本も1問ずつを出す
    await waitFor(() =>
      expect(screen.getByTitle("質問票").getAttribute("src")).toBe(
        "/api/design/files/samples/sheet.focus.html?template=acme",
      ),
    );
    fireEvent.click(screen.getByLabelText("右"));
    fireEvent.click(save());
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    expect(sentBody("sheet/acme").template.layout).toEqual({
      ...defaultSheet.layout,
      base: "overview",
      list: { ...defaultSheet.layout.list, side: "right" },
    });
  });

  it("質問票の見本は「質問一覧を閉じる/開く」で一覧が開閉する", async () => {
    renderAt("/sheets/templates/default");
    const frame = (await screen.findByTitle("質問票")) as HTMLIFrameElement;
    // jsdom は iframe の中身を読まないので、見本(pnpm design:build の生成物)の
    // <main> を書き込んでから読み込みを知らせる
    const inner = frame.contentDocument;
    if (!inner) throw new Error("見本の iframe に文書が無い");
    const root =
      inner.documentElement ?? inner.appendChild(inner.createElement("html"));
    root.innerHTML = `<body>${sheetFocusSample.slice(
      sheetFocusSample.indexOf("<main"),
      sheetFocusSample.indexOf("</main>") + "</main>".length,
    )}</body>`;
    fireEvent.load(frame);
    const toggle = inner.querySelector<HTMLButtonElement>(".ds-sidebar-toggle");
    const sidebar = inner.getElementById("question-sidebar");
    expect(toggle?.textContent).toBe("質問一覧を閉じる");
    expect(sidebar?.hidden).toBe(false);
    toggle?.click();
    expect(sidebar?.hidden).toBe(true);
    expect(toggle?.textContent).toBe("質問一覧を開く");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(
      inner
        .querySelector(".ds-board-layout")
        ?.classList.contains("ds-sidebar-collapsed"),
    ).toBe(true);
    toggle?.click();
    expect(sidebar?.hidden).toBe(false);
    expect(toggle?.textContent).toBe("質問一覧を閉じる");
    // 読み込みの知らせが重なっても、1回押して1回だけ開閉する
    fireEvent.load(frame);
    toggle?.click();
    expect(sidebar?.hidden).toBe(true);
  });

  it("文書は用意した並びのカードから選ぶ", async () => {
    renderAt("/documents/templates/default");
    const standard = (await screen.findByLabelText(
      "標準(目次は上、脇は右)",
    )) as HTMLInputElement;
    expect(standard.checked).toBe(true);
    fireEvent.click(screen.getByLabelText("1列"));
    fireEvent.click(save());
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    const sent = sentBody("document/default");
    expect(sent.template.layout).toEqual({
      columns: [720],
      areas: [["toc"], ["main"]],
    });
    // 画面から外した色・部品は、保存でも消えず残る
    expect(sent.template.tokens).toEqual(defaultDocument.tokens);
    expect(sent.template.components).toEqual(defaultDocument.components);
  });

  it("既定でないテンプレートは上の帯から★既定にでき、一覧へ戻れる。既定のものは押しても何もしない", async () => {
    renderAt("/documents/templates/acme");
    const makeDefault = await screen.findByRole("button", { name: "既定" });
    expect(makeDefault.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(makeDefault);
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    expect(sentSelection().document).toBe("acme");
    expect(
      screen
        .getByRole("link", { name: "HTML 資料のテンプレート" })
        .getAttribute("href"),
    ).toBe("/documents/templates");

    cleanup();
    renderAt("/documents/templates/default");
    const already = (await screen.findByRole("button", {
      name: "既定",
    })) as HTMLButtonElement;
    expect(already.getAttribute("aria-pressed")).toBe("true");
    expect(already.disabled).toBe(true);
  });

  it.each([
    ["slide", "/slides/templates/default"],
    ["sheet", "/sheets/templates/default"],
    ["document", "/documents/templates/default"],
  ])(
    "%s にも「文字の大きさ」の節があり、80〜130% を 5% 刻みで選べる(101)",
    async (_surface, path) => {
      renderAt(path);
      await screen.findByRole("heading", { name: "文字の大きさ" });
      const slider = screen.getByRole("slider", {
        name: "文字の大きさの倍率",
      }) as HTMLInputElement;
      expect([slider.min, slider.max, slider.step, slider.value]).toEqual([
        "80",
        "130",
        "5",
        "100",
      ]);
      expect(currentScale()).toBe("100%");
      expect(
        (
          screen.getByRole("button", {
            name: "100% に戻す",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    },
  );

  it("スライダーを動かすとすぐ見本の字がそろって大きくなり、保存で textScale を書く。100% に戻すと書かない", async () => {
    renderAt("/slides/templates/default");
    const slider = (await screen.findByRole("slider", {
      name: "文字の大きさの倍率",
    })) as HTMLInputElement;
    const fontSize = (name: string) =>
      stageSlide()?.style.getPropertyValue(name);
    expect(fontSize("--fs-body")).toBe(`${tokens.size.body}px`);
    fireEvent.change(slider, { target: { value: "120" } });
    expect(currentScale()).toBe("120%");
    // 見出し・本文・注記が同じ割合で替わり、余白は替わらない
    expect(fontSize("--fs-body")).toBe("19.2px");
    expect(fontSize("--fs-h1")).toBe(
      `${Math.round(tokens.size.h1 * 12) / 10}px`,
    );
    expect(fontSize("--fs-small")).toBe(
      `${Math.round(tokens.size.small * 12) / 10}px`,
    );
    expect(stageSlide()?.style.getPropertyValue("--space-md")).toBe(
      `${tokens.space.md}px`,
    );
    fireEvent.click(save());
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    expect(sentBody("slide/default").template.textScale).toBe(1.2);

    fireEvent.click(screen.getByRole("button", { name: "100% に戻す" }));
    expect(slider.value).toBe("100");
    expect(fontSize("--fs-body")).toBe(`${tokens.size.body}px`);
    // 保存した 120% からの変更なので保存でき、1 のときはキーを送らない
    fetchMock.mockClear();
    fireEvent.click(save());
    await waitFor(() => expect(calls()).toContain("POST /api/design/build"));
    expect("textScale" in sentBody("slide/default").template).toBe(false);
  });

  it("HTML 資料の見本には倍率(図を大きくする --text-scale)を書き、100% に戻すと消す", async () => {
    renderAt("/documents/templates/default");
    const frame = (await screen.findByTitle("文書")) as HTMLIFrameElement;
    // jsdom は iframe の中身を読まないので、根の要素を置いてから読み込みを知らせる
    const inner = frame.contentDocument;
    if (!inner) throw new Error("見本の iframe に文書が無い");
    const root =
      inner.documentElement ?? inner.appendChild(inner.createElement("html"));
    fireEvent.load(frame);
    const slider = (await screen.findByRole("slider", {
      name: "文字の大きさの倍率",
    })) as HTMLInputElement;
    const variable = (name: string) => root.style.getPropertyValue(name);
    const ui =
      (defaultDocument.tokens as { size?: { ui?: number } }).size?.ui ??
      tokens.size.ui;
    expect(variable("--text-scale")).toBe("");
    fireEvent.change(slider, { target: { value: "120" } });
    expect(variable("--text-scale")).toBe("1.2");
    expect(variable("--fs-ui")).toBe(`${Math.round(ui * 12) / 10}px`);
    // 1 のときは変数を書かないので、前に書いた値を残すと図だけ大きいままになる
    fireEvent.click(screen.getByRole("button", { name: "100% に戻す" }));
    expect(variable("--text-scale")).toBe("");
    expect(variable("--fs-ui")).toBe(`${ui}px`);
  });

  it("最小の字の検査を持つテンプレートは、その字を割るところまで下げられない", async () => {
    created.set("slide/cobalt", cobaltSlide);
    renderAt("/slides/templates/cobalt");
    const slider = (await screen.findByRole("slider", {
      name: "文字の大きさの倍率",
    })) as HTMLInputElement;
    // Cobalt は最小の字(注記 18px)がすでに検査の下限なので、100% より下げない
    expect(slider.min).toBe("100");
    expect(
      screen.getByText(
        `このテンプレートは最小の字を ${cobaltSlide.checks.minFontSize}px と決めているので、100% より小さくできません。`,
      ),
    ).toBeTruthy();
  });

  it("無いテンプレートは読めないことを出す", async () => {
    renderAt("/sheets/templates/nothing");
    expect(
      await screen.findByRole("link", { name: "質問票のテンプレート" }),
    ).toBeTruthy();
  });

  it("見本が無いときは作り方を出す", async () => {
    samples.ready = false;
    renderAt("/documents/templates/default");
    await waitFor(() =>
      expect(
        screen.getByText("見本がありません。pnpm design:build で作ります"),
      ).toBeTruthy(),
    );
  });
});
