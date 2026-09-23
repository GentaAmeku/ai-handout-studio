import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  History,
  Palette,
  Redo2,
  Save,
  ScanSearch,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { InfoPopover, type InfoRow } from "../../components/InfoPopover";
import { resolveTemplateName, templateLabel } from "../../design/registry";
import { formatDateTime } from "../../format/date";
import type { MessageKey } from "../../i18n/ja";
import { useLanguage, type Vars } from "../../i18n/language";
import { type Deck, deckTemplate } from "../../schema/deck";
import { ExportControls } from "./ExportControls";

// 上の帯の ⓘ に出す行。スライドは枚数と状態(下書き/完成)も出す
export const deckInfoRows = (
  deck: Deck,
  t: (key: MessageKey, vars?: Vars) => string,
): InfoRow[] => [
  { label: t("handouts.id"), value: deck.id },
  {
    label: t("handouts.createdAt"),
    value: formatDateTime(deck.meta.createdAt),
  },
  {
    label: t("handouts.updatedAt"),
    value: formatDateTime(deck.meta.updatedAt),
  },
  {
    label: t("handouts.template"),
    value: templateLabel(resolveTemplateName(deckTemplate(deck))),
  },
  {
    label: t("handouts.slideCount"),
    value: t("unit.slides", { n: deck.slides.length }),
  },
  {
    label: t("handouts.status"),
    value: t(
      deck.status === "done" ? "deckCard.statusDone" : "deckCard.statusDraft",
    ),
  },
];

const SaveStatus = ({ dirty, saving }: { dirty: boolean; saving: boolean }) => {
  const { t } = useLanguage();
  if (saving)
    return <span className="editor__status">{t("editorBar.saving")}</span>;
  return dirty ? (
    <span className="editor__status editor__status--dirty">
      {t("editorBar.dirty")}
    </span>
  ) : (
    <span className="editor__status">{t("editorBar.saved")}</span>
  );
};

export const EditorBar = ({
  deckId,
  deck,
  canUndo,
  canRedo,
  dirty,
  saving,
  saveError,
  conflict,
  checking,
  onUndo,
  onRedo,
  onSave,
  onReload,
  onKeepEditing,
  onInspect,
  onHistory,
  onTemplate,
  beforeExport,
}: {
  deckId: string;
  deck: Deck;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
  saveError?: string;
  conflict: boolean;
  checking: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onReload: () => void;
  onKeepEditing: () => void;
  onInspect: () => void;
  onHistory: () => void;
  onTemplate: () => void;
  beforeExport: () => Promise<boolean>;
}) => {
  const { t } = useLanguage();
  return (
    <header className="viewer__bar">
      <Link to="/slides" className="button button--ghost">
        <ArrowLeft size={18} aria-hidden />
        {t("common.backToList")}
      </Link>
      <span className="viewer__divider" aria-hidden />
      <h1 className="viewer__title">{deck.title}</h1>

      <div className="editor__tools">
        <InfoPopover label={t("handouts.info")} rows={deckInfoRows(deck, t)} />
        <button
          type="button"
          className="icon-button"
          aria-label={t("editorBar.undo")}
          title={t("editorBar.undoTitle")}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("editorBar.redo")}
          title={t("editorBar.redoTitle")}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="button button--ghost editor__theme"
          title={t("editorBar.templateTitle")}
          onClick={onTemplate}
        >
          <Palette size={18} aria-hidden />
          {t("editorBar.template", {
            template: templateLabel(resolveTemplateName(deckTemplate(deck))),
          })}
        </button>
      </div>

      <button
        type="button"
        className="button button--ghost"
        disabled={checking}
        onClick={onInspect}
      >
        <ScanSearch size={18} aria-hidden />
        {checking ? t("editorBar.inspecting") : t("editorBar.inspect")}
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={onHistory}
      >
        <History size={18} aria-hidden />
        {t("editorBar.history")}
      </button>

      <ExportControls
        deckId={deckId}
        disabledReason={dirty ? t("editorBar.exportDisabled") : undefined}
        beforeExport={beforeExport}
      />

      <div className="editor__save">
        <SaveStatus dirty={dirty} saving={saving} />
        <button
          type="button"
          className="button button--primary"
          title={t("editorBar.saveTitle")}
          disabled={saving || !dirty}
          onClick={onSave}
        >
          <Save size={18} aria-hidden />
          {t("editorBar.save")}
        </button>
      </div>

      {(conflict || saveError) && (
        <div className="editor__banner" role="alert">
          <TriangleAlert size={18} aria-hidden />
          <span>
            {conflict
              ? t("editorBar.conflict")
              : t("editorBar.saveFail", { message: saveError ?? "" })}
          </span>
          {conflict && (
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={onReload}
              >
                {t("editorBar.reload")}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={onKeepEditing}
              >
                {t("editorBar.keepEditing")}
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
