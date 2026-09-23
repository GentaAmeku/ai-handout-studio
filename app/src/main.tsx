import "@fontsource-variable/noto-sans-jp";
// 見出し用。テンプレートが tokens の font.display で名前を指すと使われる
import "@fontsource/zen-maru-gothic/700.css";
import "../../design/dist/app.css";
import "../../design/dist/slide.css";
// スライドのテンプレートの専用の CSS。.ds-slide[data-template] に閉じ込めてある
import "../../design/dist/slide-templates.css";
import "./app.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "./i18n/language";
import { ProfileProvider } from "./renderer/profile-context";
import { router } from "./router";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root が見つからない");

// 資料はエージェントが外から書き換えるので、画面に戻ったら取り直す(既定のまま)
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

createRoot(rootElement).render(
  <StrictMode>
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ProfileProvider>
          <RouterProvider router={router} />
        </ProfileProvider>
      </QueryClientProvider>
    </LanguageProvider>
  </StrictMode>,
);
