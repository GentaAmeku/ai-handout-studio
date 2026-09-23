import { Link, Outlet } from "@tanstack/react-router";
import {
  CircleHelp,
  ClipboardList,
  FileText,
  LayoutTemplate,
  type LucideIcon,
  Presentation,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage } from "../i18n/language";
import { SearchProvider } from "../search/SearchProvider";

type NavPath =
  | "/slides"
  | "/slides/templates"
  | "/sheets"
  | "/sheets/templates"
  | "/documents"
  | "/documents/templates"
  | "/help"
  | "/settings";

// exact でない項目は、その下の経路(テンプレートの編集など)でも選ばれた印を付ける
const NavItem = ({
  to,
  icon: Icon,
  exact = true,
  children,
}: {
  to: NavPath;
  icon: LucideIcon;
  exact?: boolean;
  children: ReactNode;
}) => (
  <li>
    <Link
      to={to}
      className="sidebar__link"
      activeProps={{ className: "is-active" }}
      activeOptions={{ exact, includeSearch: false }}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  </li>
);

const sections = [
  { key: "slides", icon: Presentation, label: "nav.section.slide" },
  { key: "sheets", icon: ClipboardList, label: "nav.section.sheet" },
  { key: "documents", icon: FileText, label: "nav.section.document" },
] as const;

export const AppShell = () => {
  const { t } = useLanguage();
  // 検索の窓は枠に1つだけ持ち、各画面の見出しの Search のボタンから開く
  return (
    <SearchProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <p className="sidebar__brand">AI Handout Studio</p>
          <nav aria-label={t("nav.main")}>
            <ul className="sidebar__nav">
              {sections.map(({ key, icon, label }) => (
                <li key={key}>
                  <p className="sidebar__section">{t(label)}</p>
                  <ul className="sidebar__nav sidebar__nav--sub">
                    <NavItem to={`/${key}`} icon={icon}>
                      {t("nav.decks")}
                    </NavItem>
                    <NavItem
                      to={`/${key}/templates`}
                      icon={LayoutTemplate}
                      exact={false}
                    >
                      {t("nav.templates")}
                    </NavItem>
                  </ul>
                </li>
              ))}
              <li className="sidebar__rule" aria-hidden />
              <NavItem to="/help" icon={CircleHelp}>
                {t("nav.help")}
              </NavItem>
              <NavItem to="/settings" icon={Settings}>
                {t("nav.settings")}
              </NavItem>
            </ul>
          </nav>
        </aside>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </SearchProvider>
  );
};
