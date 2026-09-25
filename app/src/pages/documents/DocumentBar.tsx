import { Link } from "@tanstack/react-router";
import { ArrowLeft, History, Pencil, Save, TriangleAlert } from "lucide-react";
import { useSetHandoutTemplate } from "../../api/queries";
import type { DesignTemplateSummary } from "../../api/types";
import { HandoutExportButton } from "../../components/HandoutExportButton";
import { InfoPopover, type InfoRow } from "../../components/InfoPopover";
import { OpenFullLink } from "../../components/OpenFullLink";
import { ShareButton } from "../../components/ShareButton";
import { formatDateTime } from "../../format/date";
import type { MessageKey } from "../../i18n/ja";
import { useLanguage, type Vars } from "../../i18n/language";
import { templateEditPath } from "../templates/paths";

// 上の帯。戻る・題・テンプレートの入れ替え・履歴・原寸で開く・書き出し・共有・保存を1本にまとめる。
// スライドの EditorBar.tsx と同じ並びで、はみ出し検査と取り消しは持たない。
// ボタンはアイコンだけにして(名前は読み上げと、マウスを重ねるか選んだときの吹き出し data-tooltip に持たせる)、帯を1行に収める

// 上の帯の ⓘ に出す行(ID・作成日時・更新日時・テンプレート)
export const documentInfoRows = (
  handout: { id: string; createdAt: string; updatedAt: string },
  templateLabel: string,
  t: (key: MessageKey, vars?: Vars) => string,
): InfoRow[] => [
  { label: t("handouts.id"), value: handout.id },
  {
    label: t("handouts.createdAt"),
    value: formatDateTime(handout.createdAt),
  },
  {
    label: t("handouts.updatedAt"),
    value: formatDateTime(handout.updatedAt),
  },
  { label: t("handouts.template"), value: templateLabel },
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

const TemplatePicker = ({
  id,
  current,
  templates,
}: {
  id: string;
  current: string;
  templates: readonly DesignTemplateSummary[];
}) => {
  const { t } = useLanguage();
  const setTemplate = useSetHandoutTemplate("document", id);
  return (
    <>
      <label className="document-bar__template">
        <select
          className="input"
          aria-label={t("handouts.template")}
          title={t("handouts.template")}
          value={current}
          disabled={setTemplate.isPending}
          onChange={(event) => setTemplate.mutate(event.target.value)}
        >
          {templates.map((template) => (
            <option key={template.name} value={template.name}>
              {template.label}
            </option>
          ))}
        </select>
      </label>
      <Link
        to={templateEditPath.document}
        params={{ name: current }}
        className="button button--ghost button--icon"
        data-tooltip={t("handouts.editTemplate")}
        aria-label={t("handouts.editTemplate")}
      >
        <Pencil size={18} aria-hidden />
      </Link>
    </>
  );
};

export const DocumentBar = ({
  id,
  title,
  template,
  templates,
  createdAt,
  updatedAt,
  dirty,
  saving,
  saveError,
  conflict,
  shareUrl,
  onSave,
  onReload,
  onKeepEditing,
  onHistory,
}: {
  id: string;
  title: string;
  template: string;
  templates: readonly DesignTemplateSummary[];
  // 資料の作成日時・更新日時(meta.json)。105 の ⓘ に出す
  createdAt: string;
  updatedAt: string;
  dirty: boolean;
  saving: boolean;
  saveError?: string;
  conflict: boolean;
  // 公開した Artifact の URL(share.json)。無ければ null
  shareUrl: string | null;
  onSave: () => void;
  onReload: () => void;
  onKeepEditing: () => void;
  onHistory: () => void;
}) => {
  const { t } = useLanguage();
  const templateLabel =
    templates.find((entry) => entry.name === template)?.label ?? template;
  return (
    <header className="viewer__bar viewer__bar--single">
      <Link
        to="/documents"
        className="button button--ghost button--icon"
        aria-label={t("doc.backToList")}
        data-tooltip={t("doc.backToList")}
      >
        <ArrowLeft size={18} aria-hidden />
      </Link>
      <span className="viewer__divider" aria-hidden />
      <h1 className="viewer__title" title={title}>
        {title}
      </h1>

      <div className="editor__tools">
        <InfoPopover
          label={t("handouts.info")}
          rows={documentInfoRows(
            { id, createdAt, updatedAt },
            templateLabel,
            t,
          )}
        />
        <TemplatePicker id={id} current={template} templates={templates} />
      </div>

      <button
        type="button"
        className="button button--ghost button--icon"
        aria-label={t("editorBar.history")}
        data-tooltip={t("editorBar.history")}
        onClick={onHistory}
      >
        <History size={18} aria-hidden />
      </button>

      <OpenFullLink kind="document" id={id} />

      <HandoutExportButton
        kind="document"
        id={id}
        disabledReason={dirty ? t("editorBar.exportDisabled") : undefined}
      />

      <ShareButton
        kind="document"
        id={id}
        sharedUrl={shareUrl}
        disabledReason={dirty ? t("editorBar.shareDisabled") : undefined}
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
              ? t("doc.conflict")
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
