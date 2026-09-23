import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { useLanguage } from "./i18n/language";
import { AppShell } from "./pages/AppShell";
import { DeckListPage } from "./pages/deck-list/DeckListPage";
import { TemplateEditPage } from "./pages/design/TemplateEditPage";
import { DocumentEditorPage } from "./pages/documents/DocumentEditorPage";
import { EditorPage } from "./pages/editor/EditorPage";
import { HelpPage } from "./pages/help/HelpPage";
import { PrintPage } from "./pages/print/PrintPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import {
  SectionDetailPage,
  SectionListPage,
} from "./pages/sections/SectionPages";
import { TemplateListPage } from "./pages/templates/TemplateListPage";

const NotFound = () => {
  const { t } = useLanguage();
  return (
    <div className="state-message">
      <p>{t("nav.notFound")}</p>
      <Link to="/slides" className="button button--secondary">
        {t("nav.notFoundBack")}
      </Link>
    </div>
  );
};

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_shell",
  component: AppShell,
});

// 旧い経路。区分の下の経路へ転送する
const rootRedirectRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/slides", replace: true });
  },
});

const legacyTemplatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/templates",
  beforeLoad: () => {
    throw redirect({ to: "/slides/templates", replace: true });
  },
});

const deckListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/slides",
  // 題名での検索はサイト内検索へ移した。古い ?q= は読まずに捨てる
  validateSearch: z.object({
    tag: z.string().optional().catch(undefined),
  }),
  component: DeckListPage,
});

// 区分ごとのテンプレートの一覧と編集
const templatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/slides/templates",
  component: () => <TemplateListPage surface="slide" />,
});

const slideTemplateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/slides/templates/$name",
  // 資料の編集画面から来たときは、戻り先の資料の名前を持つ
  validateSearch: z.object({
    from: z.string().optional().catch(undefined),
  }),
  component: () => (
    <TemplateEditPage
      surface="slide"
      name={slideTemplateRoute.useParams().name}
      fromDeckId={slideTemplateRoute.useSearch().from}
    />
  ),
});

const sheetsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sheets",
  component: () => <SectionListPage section="sheet" />,
});

// 質問票と HTML 資料の1件。見本・テンプレートの入れ替え・書き出し
const sheetViewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sheets/$id",
  component: () => (
    <SectionDetailPage section="sheet" id={sheetViewRoute.useParams().id} />
  ),
});

const sheetTemplatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sheets/templates",
  component: () => <TemplateListPage surface="sheet" />,
});

const sheetTemplateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/sheets/templates/$name",
  component: () => (
    <TemplateEditPage
      surface="sheet"
      name={sheetTemplateRoute.useParams().name}
    />
  ),
});

const documentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/documents",
  component: () => <SectionListPage section="document" />,
});

const documentTemplatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/documents/templates",
  component: () => <TemplateListPage surface="document" />,
});

const documentTemplateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/documents/templates/$name",
  component: () => (
    <TemplateEditPage
      surface="document"
      name={documentTemplateRoute.useParams().name}
    />
  ),
});

const helpRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/help",
  component: HelpPage,
});

// 設定(旧「プロフィール」。57 で言い換えた)
const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: ProfilePage,
});

const legacyProfileRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/profile",
  beforeLoad: () => {
    throw redirect({ to: "/settings", replace: true });
  },
});

// 旧いデザインの経路(段 G・H)。区分ごとのテンプレートの一覧へ転送する
const legacyDesignRoutes = (
  [
    ["/design", "/slides/templates"],
    ["/design/slide", "/slides/templates"],
    ["/design/sheet", "/sheets/templates"],
    ["/design/document", "/documents/templates"],
  ] as const
).map(([path, to]) =>
  createRoute({
    getParentRoute: () => shellRoute,
    path,
    beforeLoad: () => {
      throw redirect({ to, replace: true });
    },
  }),
);

// HTML 資料の1件は編集画面。スライドの編集と同じく、枠を外して画面いっぱいに使う。
// 質問票の1件は読む画面のまま
const documentViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents/$id",
  component: () => <DocumentEditorPage id={documentViewRoute.useParams().id} />,
});

const deckViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decks/$deckId",
  validateSearch: z.object({
    slide: z.string().optional().catch(undefined),
  }),
  component: EditorPage,
});

// 書き出し用。Playwright が開いて PDF / PNG を撮る
const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print/$deckId",
  component: PrintPage,
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    rootRedirectRoute,
    legacyTemplatesRoute,
    deckListRoute,
    templatesRoute,
    slideTemplateRoute,
    sheetsRoute,
    sheetTemplatesRoute,
    sheetTemplateRoute,
    sheetViewRoute,
    documentsRoute,
    documentTemplatesRoute,
    documentTemplateRoute,
    helpRoute,
    settingsRoute,
    legacyProfileRoute,
    ...legacyDesignRoutes,
  ]),
  documentViewRoute,
  deckViewRoute,
  printRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
