import { insertBlock } from "../../editor/document-operations";
import { documentParts } from "../../editor/document-parts";
import type { DocumentEditorAction } from "../../editor/document-state";
import {
  documentPartLabelFor,
  documentPartNoteFor,
  useLanguage,
} from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { documentPartIcons } from "./part-icons";

// 選んでいるセクションの、選んでいるブロックの後ろへ足す(選んでいなければセクションの末尾)
export const DocumentPartsPanel = ({
  document,
  sectionId,
  afterBlockId,
  onEdit,
}: {
  document: DocumentFile;
  sectionId: string;
  afterBlockId?: string;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="parts-panel">
      <ul className="parts-grid">
        {documentParts.map((part) => {
          const Icon = documentPartIcons[part.type];
          return (
            <li key={part.type}>
              <button
                type="button"
                className="part-card"
                onClick={() => {
                  const result = insertBlock(
                    document,
                    sectionId,
                    part.create(),
                    afterBlockId,
                  );
                  onEdit({
                    type: "edit",
                    document: result.document,
                    selection: {
                      kind: "block",
                      sectionId,
                      blockId: result.blockId,
                    },
                  });
                }}
              >
                <Icon size={28} strokeWidth={1.5} aria-hidden />
                <span className="part-card__label">
                  {documentPartLabelFor(part.type, t)}
                </span>
                <span className="part-card__note">
                  {documentPartNoteFor(part.type, t)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="prop-panel__hint">{t("doc.partsHint")}</p>
    </div>
  );
};
