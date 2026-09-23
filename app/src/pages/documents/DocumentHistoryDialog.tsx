import { useQuery } from "@tanstack/react-query";
import {
  documentVersionQuery,
  documentVersionsQuery,
  useRestoreDocumentVersion,
} from "../../api/queries";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { HistoryDialogShell } from "../editor/HistoryDialog";

// 版の見本。文書は1枚の紙なので、セクションの見出しを並べて中身の当たりをつける
const VersionPreview = ({
  id,
  versionId,
}: {
  id: string;
  versionId: string;
}) => {
  const { t } = useLanguage();
  const version = useQuery(documentVersionQuery(id, versionId));
  if (version.isPending)
    return <p className="state-message">{t("common.loading")}</p>;
  if (version.isError) {
    return (
      <p className="state-message state-message--error">
        {version.error.message}
      </p>
    );
  }
  const document = version.data.document;
  return (
    <div className="version-sections">
      <p className="prop-panel__hint">{document.head.title}</p>
      <ol>
        {document.sections.map((section) => (
          <li key={section.id} data-level={section.level === 3 ? "3" : "2"}>
            {section.heading || t("doc.noHeading")}
          </li>
        ))}
      </ol>
    </div>
  );
};

export const DocumentHistoryDialog = ({
  open,
  id,
  dirty,
  onClose,
  onRestored,
}: {
  open: boolean;
  id: string;
  dirty: boolean;
  onClose: () => void;
  onRestored: (document: DocumentFile) => void;
}) => {
  const { t } = useLanguage();
  const versions = useQuery({ ...documentVersionsQuery(id), enabled: open });
  const restore = useRestoreDocumentVersion(id, (document) => {
    onRestored(document);
    onClose();
  });

  return (
    <HistoryDialogShell
      open={open}
      dirty={dirty}
      versions={versions}
      amount={(version) =>
        version.sectionCount === undefined
          ? ""
          : t("unit.sectionsSlash", { n: version.sectionCount })
      }
      preview={(versionId) => <VersionPreview id={id} versionId={versionId} />}
      restore={restore}
      onClose={onClose}
    />
  );
};
