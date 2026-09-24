import { Download, FileCode, FileImage, Presentation, X } from "lucide-react";
import { useExportDeck } from "../../api/queries";
import type { ExportFormat, ExportResult } from "../../api/types";
import { ExportLocation } from "../../components/ExportLocation";
import { useLanguage } from "../../i18n/language";

const ExportSummary = ({ result }: { result: ExportResult }) => {
  const { t } = useLanguage();
  const issues = result.overflow.flatMap((report) =>
    report.issues.map((issue) => ({ slideId: report.slideId, ...issue })),
  );
  return (
    <>
      <p className="export-notice__title">
        {t("export.exported", {
          format: result.format.toUpperCase(),
          n: result.files.length,
        })}
      </p>
      <ExportLocation path={result.path} openCommand={result.openCommand} />
      {issues.length > 0 && (
        <div className="export-notice__warnings">
          <p>{t("export.warnings", { n: issues.length })}</p>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.slideId}-${issue.blockId}`}>
                {issue.slideId} / {issue.blockId}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

// 書き出しは保存済みの deck.json から作る。disabledReason があれば止めて理由を出す。
// 4つとも枠のボタンにする。塗りの色は、その画面でいちばん大事な操作1つ(保存)だけに使う
export const ExportControls = ({
  deckId,
  disabledReason,
  beforeExport,
}: {
  deckId: string;
  disabledReason?: string;
  // false を返したら書き出さない(はみ出しの確認に使う)
  beforeExport?: () => Promise<boolean>;
}) => {
  const exportDeck = useExportDeck(deckId);
  const showNotice = !exportDeck.isIdle;
  const { t } = useLanguage();

  const start = async (format: ExportFormat) => {
    if (beforeExport && !(await beforeExport())) return;
    exportDeck.mutate(format);
  };

  return (
    <div className="viewer__actions">
      <button
        type="button"
        className="button button--secondary"
        disabled={exportDeck.isPending || disabledReason !== undefined}
        title={disabledReason}
        onClick={() => void start("png")}
      >
        <FileImage size={18} aria-hidden />
        PNG
      </button>
      <button
        type="button"
        className="button button--secondary"
        disabled={exportDeck.isPending || disabledReason !== undefined}
        title={disabledReason}
        onClick={() => void start("html")}
      >
        <FileCode size={18} aria-hidden />
        HTML
      </button>
      <button
        type="button"
        className="button button--secondary"
        disabled={exportDeck.isPending || disabledReason !== undefined}
        title={disabledReason}
        onClick={() => void start("pptx")}
      >
        <Presentation size={18} aria-hidden />
        PPTX
      </button>
      <button
        type="button"
        className="button button--secondary"
        disabled={exportDeck.isPending || disabledReason !== undefined}
        title={disabledReason}
        onClick={() => void start("pdf")}
      >
        <Download size={18} aria-hidden />
        PDF
      </button>
      <div
        className="export-notice"
        role="status"
        aria-live="polite"
        hidden={!showNotice}
      >
        {exportDeck.isPending && (
          <p className="export-notice__title">{t("export.exporting")}</p>
        )}
        {exportDeck.isError && (
          <p className="export-notice__title export-notice__title--error">
            {t("export.fail", { message: exportDeck.error.message })}
          </p>
        )}
        {exportDeck.isSuccess && <ExportSummary result={exportDeck.data} />}
        {!exportDeck.isPending && (
          <button
            type="button"
            className="icon-button export-notice__close"
            aria-label={t("export.closeNotice")}
            onClick={() => exportDeck.reset()}
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};
