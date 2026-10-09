import { Link, Outlet } from "@tanstack/react-router";
import {
  CircleHelp,
  ClipboardList,
  FileText,
  LayoutTemplate,
  type LucideIcon,
  Menu,
  Presentation,
  Settings,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
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
  onNavigate,
  children,
}: {
  to: NavPath;
  icon: LucideIcon;
  exact?: boolean;
  onNavigate: () => void;
  children: ReactNode;
}) => (
  <li>
    <Link
      to={to}
      className="sidebar__link"
      activeProps={{ className: "is-active" }}
      activeOptions={{ exact, includeSearch: false }}
      onClick={onNavigate}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  </li>
);

const sections = [
  {
    key: "slides",
    icon: Presentation,
    label: "nav.section.slide",
    list: "nav.decks",
  },
  {
    key: "sheets",
    icon: ClipboardList,
    label: "nav.section.sheet",
    list: "nav.sheets",
  },
  {
    key: "documents",
    icon: FileText,
    label: "nav.section.document",
    list: "nav.documents",
  },
] as const;

export const AppShell = () => {
  const { t } = useLanguage();
  // 狭い画面(app.css の幅 768 未満)では、左のメニューを上の帯に畳み、≡ で帯の下に広げる
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();
  const closeMenu = () => setMenuOpen(false);

  // 外を押すか Esc で閉じる(InfoPopover と同じ)。Esc では ≡ にフォーカスを戻す
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (barRef.current?.contains(target) || navRef.current?.contains(target))
        return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // 検索の窓は枠に1つだけ持ち、各画面の見出しの Search のボタンから開く
  return (
    <SearchProvider>
      <div className="app-shell">
        <header className="app-bar" ref={barRef}>
          <button
            ref={toggleRef}
            type="button"
            className="app-bar__toggle"
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            aria-controls={navId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X size={22} strokeWidth={1.75} aria-hidden />
            ) : (
              <Menu size={22} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          <p className="app-bar__brand">AI Handout Studio</p>
        </header>
        <aside
          id={navId}
          ref={navRef}
          className={menuOpen ? "sidebar is-open" : "sidebar"}
        >
          <p className="sidebar__brand">AI Handout Studio</p>
          <nav aria-label={t("nav.main")}>
            <ul className="sidebar__nav">
              {sections.map(({ key, icon, label, list }) => (
                <li key={key} className="sidebar__group">
                  <p className="sidebar__section">{t(label)}</p>
                  <ul className="sidebar__nav sidebar__nav--sub">
                    <NavItem to={`/${key}`} icon={icon} onNavigate={closeMenu}>
                      {t(list)}
                    </NavItem>
                    <NavItem
                      to={`/${key}/templates`}
                      icon={LayoutTemplate}
                      exact={false}
                      onNavigate={closeMenu}
                    >
                      {t("nav.templates")}
                    </NavItem>
                  </ul>
                </li>
              ))}
              <li className="sidebar__rule" aria-hidden />
              <NavItem to="/help" icon={CircleHelp} onNavigate={closeMenu}>
                {t("nav.help")}
              </NavItem>
              <NavItem to="/settings" icon={Settings} onNavigate={closeMenu}>
                {t("nav.settings")}
              </NavItem>
            </ul>
          </nav>
        </aside>
        {menuOpen && <div className="app-backdrop" aria-hidden />}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </SearchProvider>
  );
};
