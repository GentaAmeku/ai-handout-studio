import { Trash2 } from "lucide-react";
import {
  deleteBlock,
  findBlock,
  findSection,
  replaceBlock,
  updateSection,
} from "../../editor/document-operations";
import type {
  DocumentEditorAction,
  DocumentSelection,
} from "../../editor/document-state";
import { documentPartLabelFor, useLanguage } from "../../i18n/language";
import type { DocumentFile, DocumentSection } from "../../schema/document";
import { SelectField, TextField } from "../editor/fields";
import { DocumentBlockFields } from "./DocumentBlockFields";
import { DocumentFrontFields } from "./DocumentFrontFields";

// 右の列。選んでいるものの中身だけを出す。
// 色・余白・字サイズ・角丸はテンプレートの編集(/documents/templates/<名前>)の役目

const SectionProperties = ({
  document,
  section,
  onEdit,
}: {
  document: DocumentFile;
  section: DocumentSection;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const { t } = useLanguage();
  const commit = (update: (section: DocumentSection) => DocumentSection) =>
    onEdit({
      type: "edit",
      document: updateSection(document, section.id, update),
      selection: { kind: "section", sectionId: section.id },
    });
  return (
    <div className="prop-panel">
      <div className="prop-panel__head">
        <h3 className="prop-panel__title">{t("doc.section")}</h3>
        <span className="prop-panel__id">{section.id}</span>
      </div>
      <TextField
        label={t("doc.sectionHeading")}
        value={section.heading}
        onCommit={(heading) => commit((current) => ({ ...current, heading }))}
      />
      <SelectField
        label={t("doc.level")}
        value={section.level === 3 ? "3" : "2"}
        options={[
          { value: "2", label: t("doc.level2") },
          { value: "3", label: t("doc.level3") },
        ]}
        onChange={(level) =>
          commit((current) => ({
            ...current,
            level: level === "3" ? 3 : undefined,
          }))
        }
      />
      <p className="prop-panel__hint">{t("doc.levelHint")}</p>
      <p className="prop-panel__hint">{t("doc.pickBlockHint")}</p>
    </div>
  );
};

export const DocumentProperties = ({
  document,
  selection,
  onEdit,
}: {
  document: DocumentFile;
  selection: DocumentSelection;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const { t } = useLanguage();

  if (selection.kind === "front") {
    return (
      <DocumentFrontFields
        document={document}
        onChange={(next) => onEdit({ type: "edit", document: next, selection })}
      />
    );
  }

  const section = findSection(document, selection.sectionId);
  if (!section) return null;

  const block =
    selection.kind === "block"
      ? findBlock(document, selection.sectionId, selection.blockId)
      : undefined;
  if (!block) {
    return (
      <SectionProperties
        document={document}
        section={section}
        onEdit={onEdit}
      />
    );
  }

  return (
    <div className="prop-panel">
      <div className="prop-panel__head">
        <h3 className="prop-panel__title">
          {documentPartLabelFor(block.type, t)}
        </h3>
        <span className="prop-panel__id">{block.id}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("props.deleteBlock")}
          title={t("props.deleteBlock")}
          onClick={() =>
            onEdit({
              type: "edit",
              document: deleteBlock(document, section.id, block.id),
              selection: { kind: "section", sectionId: section.id },
            })
          }
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      <section className="prop-section">
        <h4 className="prop-section__title">{t("props.content")}</h4>
        <DocumentBlockFields
          block={block}
          onChange={(next) =>
            onEdit({
              type: "edit",
              document: replaceBlock(document, section.id, next),
              selection,
            })
          }
        />
      </section>
    </div>
  );
};
