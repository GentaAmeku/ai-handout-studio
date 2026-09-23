import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { KnownBlockType } from "../schema/block.ts";
import type { DocumentBlockType } from "../schema/document.ts";
import { en } from "./en.ts";
import { ja, type MessageKey } from "./ja.ts";

export type Language = "ja" | "en";

export type Vars = Record<string, string | number>;

const format = (template: string, vars?: Vars): string =>
  vars === undefined
    ? template
    : Object.entries(vars).reduce(
        (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
        template,
      );

// 画面の言語は設定の locale で決める(149)。<html lang> から読む。開発サーバーは
// リクエストごとにそこへ入れて返す(plugin.ts の transformIndexHtml)。
// ビルド済みを配るときは LanguageProvider が起動後に /api/profile の locale で直す。
// localStorage の前の選択は見ない
const readLanguage = (): Language =>
  document.documentElement.lang === "en" ? "en" : "ja";

// React の外(API の呼び出し)で使う訳。言語は <html lang> から読む
export const translate = (key: MessageKey, vars?: Vars): string => {
  const lang = (() => {
    try {
      return readLanguage();
    } catch {
      return "ja";
    }
  })();
  return format(lang === "en" ? en[key] : ja[key], vars);
};

const LanguageContext = createContext<{ lang: Language } | undefined>(
  undefined,
);

// 画面文言の言語。<html lang> の値で始め、起動後に /api/profile の locale で直す
// (ビルド済みを配るときの手当て。開発サーバーはすでに正しい値で返している)。
// 提供元が無い場所(テストなど)では日本語になる
export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Language>(readLanguage);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { locale?: Language } | undefined) => {
        const locale = body?.locale;
        if (cancelled || locale === undefined) return;
        document.documentElement.lang = locale;
        setLang((current) => (current === locale ? current : locale));
      })
      .catch(() => {
        // 取れなくても <html lang> の値(開発サーバーが入れたもの)のまま動く
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LanguageContext.Provider value={{ lang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): {
  lang: Language;
  t: (key: MessageKey, vars?: Vars) => string;
} => {
  const context = useContext(LanguageContext);
  const lang = context?.lang ?? "ja";
  const t = useCallback(
    (key: MessageKey, vars?: Vars): string =>
      format(lang === "en" ? en[key] : ja[key], vars),
    [lang],
  );
  return { lang, t };
};

// パーツの見出しと説明は UI の文言。作られる初期値は資料データなので訳さない
export const partTextKeys: Record<
  KnownBlockType,
  { label: MessageKey; note: MessageKey }
> = {
  heading: { label: "part.heading.label", note: "part.heading.note" },
  text: { label: "part.text.label", note: "part.text.note" },
  bullets: { label: "part.bullets.label", note: "part.bullets.note" },
  "card-grid": {
    label: "part.card-grid.label",
    note: "part.card-grid.note",
  },
  "kpi-row": { label: "part.kpi-row.label", note: "part.kpi-row.note" },
  "two-col": { label: "part.two-col.label", note: "part.two-col.note" },
  process: { label: "part.process.label", note: "part.process.note" },
  table: { label: "part.table.label", note: "part.table.note" },
  image: { label: "part.image.label", note: "part.image.note" },
  footer: { label: "part.footer.label", note: "part.footer.note" },
};

const isKnownPartType = (type: string): type is KnownBlockType =>
  (Object.keys(partTextKeys) as readonly string[]).includes(type);

// 未知の type はそのまま返す(partLabel と同じ振る舞い)
export const partLabelFor = (
  type: string,
  t: (key: MessageKey) => string,
): string => (isKnownPartType(type) ? t(partTextKeys[type].label) : type);

export const partNoteFor = (
  type: string,
  t: (key: MessageKey) => string,
): string => (isKnownPartType(type) ? t(partTextKeys[type].note) : type);

// HTML 資料の部品の見出しと説明。作られる初期値は資料データなので訳さない
export const documentPartTextKeys: Record<
  DocumentBlockType,
  { label: MessageKey; note: MessageKey }
> = {
  text: { label: "doc.part.text.label", note: "doc.part.text.note" },
  bullets: { label: "doc.part.bullets.label", note: "doc.part.bullets.note" },
  ordered: { label: "doc.part.ordered.label", note: "doc.part.ordered.note" },
  table: { label: "doc.part.table.label", note: "doc.part.table.note" },
  cards: { label: "doc.part.cards.label", note: "doc.part.cards.note" },
  notice: { label: "doc.part.notice.label", note: "doc.part.notice.note" },
  note: { label: "doc.part.note.label", note: "doc.part.note.note" },
  alert: { label: "doc.part.alert.label", note: "doc.part.alert.note" },
  open: { label: "doc.part.open.label", note: "doc.part.open.note" },
  quote: { label: "doc.part.quote.label", note: "doc.part.quote.note" },
  code: { label: "doc.part.code.label", note: "doc.part.code.note" },
  figure: { label: "doc.part.figure.label", note: "doc.part.figure.note" },
  image: { label: "doc.part.image.label", note: "doc.part.image.note" },
  html: { label: "doc.part.html.label", note: "doc.part.html.note" },
};

export const documentPartLabelFor = (
  type: DocumentBlockType,
  t: (key: MessageKey) => string,
): string => t(documentPartTextKeys[type].label);

export const documentPartNoteFor = (
  type: DocumentBlockType,
  t: (key: MessageKey) => string,
): string => t(documentPartTextKeys[type].note);
