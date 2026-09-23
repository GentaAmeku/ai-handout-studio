import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import type {
  DocumentEditorAction,
  DocumentSelection,
} from "../../editor/document-state";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { SideResizeHandle } from "../editor/SideResizeHandle";
import { DocumentAiPanel, type DocumentCompare } from "./DocumentAiPanel";
import { DocumentPartsPanel } from "./DocumentPartsPanel";
import { DocumentProperties } from "./DocumentProperties";

// 右の列の枠。スライドの SidePanel.tsx と同じ形で、タブは3つ(JSON は持たない)。
// 畳むと細い帯だけが残り、中央のプレビューがその分広がる

const tabs = [
  { id: "properties", labelKey: "props.tabProperties" },
  { id: "parts", labelKey: "props.tabParts" },
  { id: "ai", labelKey: "docai.tab" },
] as const;

type TabId = (typeof tabs)[number]["id"];

// 左右の矢印キーでタブを移る(タブの標準的な操作)
const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  const offset =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (offset === 0) return undefined;
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const active = document.activeElement;
  const current = buttons.findIndex((button) => button.isSameNode(active));
  const next = buttons[(current + offset + buttons.length) % buttons.length];
  next?.focus();
  return next?.dataset.tab as TabId | undefined;
};

export const DocumentSidePanel = ({
  document: doc,
  id,
  compare,
  onCompare,
  selection,
  sideWidth,
  sideWidthMin,
  sideWidthMax,
  open,
  onSideWidthChange,
  onOpenChange,
  onEdit,
}: {
  document: DocumentFile;
  id: string;
  compare: DocumentCompare | undefined;
  onCompare: (compare: DocumentCompare | undefined) => void;
  selection: DocumentSelection;
  sideWidth: number;
  sideWidthMin: number;
  sideWidthMax: number;
  open: boolean;
  onSideWidthChange: (width: number) => void;
  onOpenChange: (open: boolean) => void;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const [tab, setTab] = useState<TabId>("properties");
  const { t } = useLanguage();
  const baseId = useId();
  const tabId = (id: TabId) => `${baseId}-${id}-tab`;
  const panelId = (id: TabId) => `${baseId}-${id}-panel`;

  if (!open) {
    return (
      <aside
        className="side-panel side-panel--collapsed"
        aria-label={t("props.panel")}
      >
        <button
          type="button"
          className="side-panel__toggle"
          aria-expanded={false}
          aria-label={t("props.expand")}
          title={t("props.expand")}
          onClick={() => onOpenChange(true)}
        >
          <PanelRightOpen size={18} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel" aria-label={t("props.panel")}>
      <SideResizeHandle
        width={sideWidth}
        min={sideWidthMin}
        max={sideWidthMax}
        onChange={onSideWidthChange}
      />
      <div className="side-panel__head">
        <div
          role="tablist"
          aria-label={t("props.tabs")}
          className="side-panel__tabs"
          onKeyDown={(event) => {
            const next = moveFocus(event);
            if (next) setTab(next);
          }}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              id={tabId(item.id)}
              type="button"
              role="tab"
              data-tab={item.id}
              className="side-panel__tab"
              aria-selected={tab === item.id}
              aria-controls={panelId(item.id)}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="side-panel__toggle"
          aria-expanded={true}
          aria-label={t("props.collapse")}
          title={t("props.collapse")}
          onClick={() => onOpenChange(false)}
        >
          <PanelRightClose size={18} aria-hidden />
        </button>
      </div>
      <div
        id={panelId(tab)}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="side-panel__body"
      >
        {tab === "properties" && (
          <DocumentProperties
            document={doc}
            selection={selection}
            onEdit={onEdit}
          />
        )}
        {/* 依頼の途中でタブを移っても案を失わないよう、AI の欄は作ったまま隠す */}
        <div hidden={tab !== "ai"}>
          <DocumentAiPanel
            document={doc}
            id={id}
            selection={selection}
            compare={compare}
            onCompare={onCompare}
            onEdit={onEdit}
          />
        </div>
        {tab === "parts" &&
          (selection.kind === "front" ? (
            <p className="prop-panel__hint">{t("doc.partsNeedSection")}</p>
          ) : (
            <DocumentPartsPanel
              document={doc}
              sectionId={selection.sectionId}
              afterBlockId={
                selection.kind === "block" ? selection.blockId : undefined
              }
              onEdit={onEdit}
            />
          ))}
      </div>
    </aside>
  );
};
