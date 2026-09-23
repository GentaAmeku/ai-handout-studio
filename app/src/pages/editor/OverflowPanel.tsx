import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { useLanguage } from "../../i18n/language";
import type { OverflowReport } from "../../renderer/overflow";

// 検査の結果。項目を押すと、そのスライドとブロックを選ぶ
export const OverflowPanel = ({
  reports,
  onSelect,
  onClose,
}: {
  reports: OverflowReport[];
  onSelect: (slideId: string, blockId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const issues = reports.flatMap((report) =>
    report.issues.map((issue) => ({ slideId: report.slideId, ...issue })),
  );

  return (
    <div className="editor__banner overflow-panel" role="status">
      {issues.length === 0 ? (
        <>
          <CircleCheck size={18} aria-hidden />
          <span>{t("overflow.none")}</span>
        </>
      ) : (
        <div className="overflow-panel__body">
          <p className="overflow-panel__title">
            <TriangleAlert size={18} aria-hidden />
            {t("overflow.some", { n: issues.length })}
          </p>
          <ul className="overflow-panel__list">
            {issues.map((issue) => (
              <li key={`${issue.slideId}-${issue.blockId}`}>
                <button
                  type="button"
                  className="overflow-panel__item"
                  onClick={() => onSelect(issue.slideId, issue.blockId)}
                >
                  <span className="overflow-panel__where">
                    {issue.slideId} / {issue.blockId}
                  </span>
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={t("overflow.close")}
        onClick={onClose}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
};
