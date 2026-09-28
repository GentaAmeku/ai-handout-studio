import { useQuery } from "@tanstack/react-query";
import {
  documentVersionPreviewUrl,
  documentVersionQuery,
  documentVersionsQuery,
  useRestoreDocumentVersion,
} from "../../api/queries";
import type {
  SectionChange,
  VersionChanges,
  VersionSummary,
} from "../../api/types";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { FrameView } from "../design/SampleStage";
import { formatSavedAt, HistoryDialogShell } from "../editor/HistoryDialog";

// 見比べを始めるときに編集画面へ渡すもの。見比べの画面は中央のプレビューが持つ
export type DocumentHistoryCompare = {
  versionId: string;
  savedAt: string;
  view: "before" | "after";
};

const savedAtLabel = (
  savedAt: string,
  t: ReturnType<typeof useLanguage>["t"],
): string =>
  savedAt === "" ? t("history.unknownDate") : formatSavedAt(savedAt);

// 履歴の見比べ。中央のプレビューに変更前と変更後を切り替えて出し、変わったセクションに印を付ける
export const DocumentHistoryComparison = ({
  id,
  title,
  compare,
  onChange,
  onEnd,
}: {
  id: string;
  title: string;
  compare: DocumentHistoryCompare;
  onChange: (compare: DocumentHistoryCompare) => void;
  onEnd: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <div className="document-preview__note document-preview__compare">
        <span>
          {t("history.comparing", {
            time: savedAtLabel(compare.savedAt, t),
          })}
        </span>
        <div className="chips">
          {(["before", "after"] as const).map((view) => (
            <button
              key={view}
              type="button"
              className="chip"
              aria-pressed={compare.view === view}
              onClick={() => onChange({ ...compare, view })}
            >
              {t(
                view === "before" ? "history.viewBefore" : "history.viewAfter",
              )}
            </button>
          ))}
        </div>
        <button type="button" className="button button--ghost" onClick={onEnd}>
          {t("history.compareEnd")}
        </button>
      </div>
      <FrameView
        key={`${compare.versionId}-${compare.view}`}
        src={documentVersionPreviewUrl(id, compare.versionId, compare.view)}
        title={title}
      />
    </>
  );
};

// 一覧の行に並べる、変わった所の名前の数
const ROW_NAMES = 2;

const hasChanges = (changes: VersionChanges): boolean =>
  changes.front ||
  changes.reordered ||
  changes.sections.some((section) => section.change !== "same");

const ChangeMark = ({ change }: { change: Exclude<SectionChange, "same"> }) => {
  const { t } = useLanguage();
  return (
    <span className="version-mark" data-change={change}>
      {t(`history.mark.${change}`)}
    </span>
  );
};

// 版の見本。版が読めて比べる相手もあれば、その保存で変わったセクションに印を付けて並べる
const VersionChangesView = ({
  version,
  changes,
}: {
  version: VersionSummary;
  changes: VersionChanges;
}) => {
  const { t } = useLanguage();
  return (
    <div className="version-sections">
      <p className="prop-panel__hint">
        {t("history.changesLead", { time: savedAtLabel(version.savedAt, t) })}
      </p>
      {!hasChanges(changes) && (
        <p className="prop-panel__hint">{t("history.changesNone")}</p>
      )}
      {changes.front && (
        <p className="version-sections__note">
          <ChangeMark change="changed" />
          {t("history.changesFront")}
        </p>
      )}
      {changes.reordered && (
        <p className="version-sections__note">
          <ChangeMark change="changed" />
          {t("history.changesReordered")}
        </p>
      )}
      <ol>
        {changes.sections.map((section) => (
          <li
            key={section.id}
            data-level={section.level === 3 ? "3" : "2"}
            data-change={section.change}
          >
            {section.change !== "same" && (
              <ChangeMark change={section.change} />
            )}
            <span className="version-sections__heading">
              {section.heading || t("doc.noHeading")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

// 比べる相手が読めない版は、これまでどおりセクションの見出しを並べて中身の当たりをつける
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
  onCompare,
}: {
  open: boolean;
  id: string;
  dirty: boolean;
  onClose: () => void;
  onRestored: (document: DocumentFile) => void;
  onCompare: (compare: DocumentHistoryCompare) => void;
}) => {
  const { t } = useLanguage();
  const versions = useQuery({ ...documentVersionsQuery(id), enabled: open });
  const restore = useRestoreDocumentVersion(id, (document) => {
    onRestored(document);
    onClose();
  });

  // 行には変わった所の名前を先頭から ROW_NAMES 個まで出す
  const describe = (version: VersionSummary): string => {
    const changes = version.changes;
    if (!changes) return version.title ?? "";
    const names = [
      ...(changes.front ? [t("history.changesFront")] : []),
      ...(changes.reordered ? [t("history.changesReordered")] : []),
      ...changes.sections
        .filter((section) => section.change !== "same")
        .map((section) => section.heading || t("doc.noHeading")),
    ];
    if (names.length === 0) return t("history.changesNone");
    const shown = names.slice(0, ROW_NAMES).join(t("history.changesSeparator"));
    return names.length > ROW_NAMES
      ? t("history.changesMore", {
          names: shown,
          n: names.length - ROW_NAMES,
        })
      : shown;
  };

  return (
    <HistoryDialogShell
      open={open}
      dirty={dirty}
      versions={versions}
      describe={describe}
      amount={(version) =>
        version.sectionCount === undefined
          ? ""
          : t("unit.sectionsSlash", { n: version.sectionCount })
      }
      preview={(version) =>
        version.changes ? (
          <VersionChangesView version={version} changes={version.changes} />
        ) : (
          <VersionPreview id={id} versionId={version.versionId} />
        )
      }
      compare={{
        label: t("history.compare"),
        onCompare: (version) => {
          onCompare({
            versionId: version.versionId,
            savedAt: version.savedAt,
            view: "after",
          });
          onClose();
        },
      }}
      restore={restore}
      onClose={onClose}
    />
  );
};
