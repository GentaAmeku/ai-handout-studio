import { useQuery } from "@tanstack/react-query";
import {
  Link,
  type NavigateOptions,
  useNavigate,
} from "@tanstack/react-router";
import {
  ClipboardList,
  FileText,
  LayoutTemplate,
  type LucideIcon,
  Presentation,
  Search,
  X,
} from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  decksQuery,
  designTemplatesQuery,
  handoutsQuery,
} from "../api/queries";
import type { MessageKey } from "../i18n/ja";
import { useLanguage } from "../i18n/language";
import {
  deckEntries,
  handoutEntries,
  type SearchEntry,
  type SearchKind,
  searchGroups,
  templateEntries,
} from "./entries";
import { highlight, termsOf } from "./match";

// サイト内検索の窓。
// 打つと6区分ごとに当たったものの行を全部並べ、1件目を選んだ状態で始める。↑↓ で移り、Enter かマウスで開く。
// 閉じるのは Esc・×・外の暗い所。開き直すと欄は空(中身は開いている間だけ描く)。
// 画面読み上げソフト向けの作り込みはしない(利用者の回答)

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  slide: Presentation,
  slideTemplate: LayoutTemplate,
  sheet: ClipboardList,
  sheetTemplate: LayoutTemplate,
  document: FileText,
  documentTemplate: LayoutTemplate,
};

const KIND_LABEL: Record<SearchKind, MessageKey> = {
  slide: "nav.section.slide",
  slideTemplate: "templates.title.slide",
  sheet: "nav.section.sheet",
  sheetTemplate: "templates.title.sheet",
  document: "nav.section.document",
  documentTemplate: "templates.title.document",
};

// 行き先は区分ごとに経路の型が違うので、Link と navigate の型へいったん unknown を通してゆるめる
const linkProps = (entry: SearchEntry) =>
  entry.target as unknown as ComponentProps<typeof Link>;

const Marked = ({ text, terms }: { text: string; terms: readonly string[] }) =>
  highlight(text, terms).map((segment, index) =>
    segment.hit ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: 字の切れ目は id を持たず、並び順で区別する
      <mark key={index}>{segment.text}</mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: 字の切れ目は id を持たず、並び順で区別する
      <span key={index}>{segment.text}</span>
    ),
  );

const SearchPanel = ({ onClose }: { onClose: () => void }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const decks = useQuery(decksQuery);
  const sheets = useQuery(handoutsQuery("sheet"));
  const documents = useQuery(handoutsQuery("document"));
  const templates = useQuery(designTemplatesQuery);

  const terms = termsOf(query);
  const byKind = templates.data?.templates;
  const groups = searchGroups(
    {
      slide: deckEntries(decks.data ?? []),
      slideTemplate: templateEntries("slide", byKind?.slide ?? []),
      sheet: handoutEntries("sheet", sheets.data ?? []),
      sheetTemplate: templateEntries("sheet", byKind?.sheet ?? []),
      document: handoutEntries("document", documents.data ?? []),
      documentTemplate: templateEntries("document", byKind?.document ?? []),
    },
    terms,
  );
  const flat = groups.flatMap((group) => group.entries);
  // 読み込みが後から届いて件数が減っても、選んだ行が並びの外へ出ないようにする
  const current = Math.min(active, flat.length - 1);
  const offsets = groups.map((_group, index) =>
    groups
      .slice(0, index)
      .reduce((sum, group) => sum + group.entries.length, 0),
  );
  const sources = [
    { query: decks, label: t("nav.section.slide") },
    { query: sheets, label: t("nav.section.sheet") },
    { query: documents, label: t("nav.section.document") },
    { query: templates, label: t("nav.templates") },
  ];
  const loading = sources.some((source) => source.query.isPending);
  const failed = sources
    .filter((source) => source.query.isError)
    .map((source) => source.label);

  const openEntry = (entry: SearchEntry) => {
    onClose();
    navigate(entry.target as unknown as NavigateOptions);
  };

  const move = (next: number) => {
    setActive(next);
    listRef.current
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換を確定する Enter と、変換中の ↑↓ は窓では使わない
    if (event.nativeEvent.isComposing || flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(Math.min(current + 1, flat.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(Math.max(current - 1, 0));
      return;
    }
    const entry = flat[current];
    if (event.key === "Enter" && entry) {
      event.preventDefault();
      openEntry(entry);
    }
  };

  return (
    <div className="search-dialog__panel">
      <div className="search-dialog__head">
        <Search size={22} aria-hidden />
        <input
          type="text"
          className="search-dialog__input"
          placeholder={t("search.label")}
          aria-label={t("search.label")}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="icon-button search-dialog__close"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X size={22} aria-hidden />
        </button>
      </div>
      {terms.length > 0 && (
        <div className="search-dialog__body" ref={listRef}>
          {groups.map((group, groupIndex) => {
            const Icon = KIND_ICON[group.kind];
            return (
              <section
                key={group.kind}
                className="search-dialog__group"
                aria-label={t(KIND_LABEL[group.kind])}
              >
                <h2 className="search-dialog__label">
                  {t(KIND_LABEL[group.kind])}
                  <span className="search-dialog__count">
                    {group.entries.length}
                  </span>
                </h2>
                {group.entries.map((entry, entryIndex) => {
                  const index = (offsets[groupIndex] ?? 0) + entryIndex;
                  return (
                    <Link
                      key={entry.key}
                      {...linkProps(entry)}
                      className={
                        index === current
                          ? "search-dialog__row is-active"
                          : "search-dialog__row"
                      }
                      data-index={index}
                      onMouseMove={() => {
                        if (index !== current) setActive(index);
                      }}
                      onClick={onClose}
                    >
                      <Icon
                        className="search-dialog__icon"
                        size={20}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="search-dialog__title">
                        <Marked text={entry.title} terms={terms} />
                      </span>
                      <span className="search-dialog__meta">
                        <Marked text={entry.meta} terms={terms} />
                      </span>
                    </Link>
                  );
                })}
              </section>
            );
          })}
          {groups.length === 0 && (
            <p className="search-dialog__state">
              {t(loading ? "common.loading" : "search.noMatch")}
            </p>
          )}
          {failed.length > 0 && (
            <p className="search-dialog__state search-dialog__state--error">
              {t("search.loadError", { names: failed.join("・") })}
            </p>
          )}
        </div>
      )}
      {groups.length > 0 && (
        <p className="search-dialog__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {t("search.hintMove")}
          </span>
          <span>
            <kbd>Enter</kbd>
            {t("search.hintOpen")}
          </span>
          <span>
            <kbd>Esc</kbd>
            {t("search.hintClose")}
          </span>
        </p>
      )}
    </div>
  );
};

export const SearchDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // 窓の外の暗い所を押すと dialog そのものに届く(中身は窓いっぱいに敷いてある)。
  // キーボードで閉じるのは Esc で、dialog がそのまま受ける
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 外を押して閉じるのはマウスの補い。キーボードは Esc で閉じる
    <dialog
      ref={ref}
      className="search-dialog"
      aria-label={t("search.label")}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && <SearchPanel onClose={onClose} />}
    </dialog>
  );
};
