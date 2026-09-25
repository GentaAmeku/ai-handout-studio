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

// 上の帯。HTML 資料と質問票の帯(DocumentBar.tsx)と同じく1行に収める。戻る・はみ出し検査・履歴・保存は
// アイコンだけにして(名前は読み上げと吹き出し data-tooltip に持たせる)、書き出しの PNG・HTML・PPTX・PDF は
// アイコンだけでは見分けられないので形式名を残す

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
  const template = templateLabel(resolveTemplateName(deckTemplate(deck)));
  return (
    <header className="viewer__bar viewer__bar--single">
      <Link
        to="/slides"
        className="button button--ghost button--icon"
        aria-label={t("common.backToList")}
        data-tooltip={t("common.backToList")}
      >
        <ArrowLeft size={18} aria-hidden />
      </Link>
      <span className="viewer__divider" aria-hidden />
      <h1 className="viewer__title" title={deck.title}>
        {deck.title}
      </h1>

      <div className="editor__tools">
        <InfoPopover label={t("handouts.info")} rows={deckInfoRows(deck, t)} />
        <button
          type="button"
          className="icon-button"
          aria-label={t("editorBar.undo")}
          data-tooltip={t("editorBar.undoTitle")}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("editorBar.redo")}
          data-tooltip={t("editorBar.redoTitle")}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={18} aria-hidden />
        </button>
        {/* 帯を1行に収めるため、見た目はパレットとテンプレートの名前だけにする */}
        <button
          type="button"
          className="button button--ghost editor__theme"
          aria-label={t("editorBar.template", { template })}
          title={t("editorBar.templateTitle")}
          onClick={onTemplate}
        >
          <Palette size={18} aria-hidden />
          {template}
        </button>
      </div>

      <button
        type="button"
        className="button button--ghost button--icon"
        aria-label={
          checking ? t("editorBar.inspecting") : t("editorBar.inspect")
        }
        data-tooltip={
          checking ? t("editorBar.inspecting") : t("editorBar.inspect")
        }
        disabled={checking}
        onClick={onInspect}
      >
        <ScanSearch size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="button button--ghost button--icon"
        aria-label={t("editorBar.history")}
        data-tooltip={t("editorBar.history")}
        onClick={onHistory}
      >
        <History size={18} aria-hidden />
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
          className="button button--primary button--icon"
          aria-label={t("editorBar.save")}
          data-tooltip={t("editorBar.saveTitle")}
          disabled={saving || !dirty}
          onClick={onSave}
        >
          <Save size={18} aria-hidden />
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
