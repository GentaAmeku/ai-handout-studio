import { type KeyboardEvent, useId, useState } from "react";
import type { EditorAction, Selection } from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import type { Deck, Slide } from "../../schema/deck";
import { AiPanel } from "./AiPanel";
import { JsonPanel } from "./JsonPanel";
import { PartsPanel } from "./PartsPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { SideResizeHandle } from "./SideResizeHandle";

const tabs = [
  { id: "properties", labelKey: "props.tabProperties" },
  { id: "parts", labelKey: "props.tabParts" },
  { id: "ai", labelKey: "props.tabAi" },
  { id: "json", labelKey: "props.tabJson" },
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

export const SidePanel = ({
  deck,
  deckId,
  slide,
  selection,
  sideWidth,
  sideWidthMin,
  sideWidthMax,
  onSideWidthChange,
  onEdit,
}: {
  deck: Deck;
  deckId: string;
  slide: Slide;
  selection: Selection;
  sideWidth: number;
  sideWidthMin: number;
  sideWidthMax: number;
  onSideWidthChange: (width: number) => void;
  onEdit: (action: EditorAction) => void;
}) => {
  const [tab, setTab] = useState<TabId>("properties");
  const { t } = useLanguage();
  const baseId = useId();
  const tabId = (id: TabId) => `${baseId}-${id}-tab`;
  const panelId = (id: TabId) => `${baseId}-${id}-panel`;

  return (
    <aside className="side-panel" aria-label={t("props.panel")}>
      <SideResizeHandle
        width={sideWidth}
        min={sideWidthMin}
        max={sideWidthMax}
        onChange={onSideWidthChange}
      />
      {/* タブの帯は横並びの行で包む。包まないと .side-panel__tabs の flex: 1 が縦に効き、帯が欄の半分まで伸びる */}
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
      </div>
      <div
        id={panelId(tab)}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="side-panel__body"
      >
        {tab === "properties" && (
          <PropertiesPanel
            deck={deck}
            slide={slide}
            selection={selection}
            onEdit={onEdit}
          />
        )}
        {tab === "parts" && (
          <PartsPanel deck={deck} slide={slide} onEdit={onEdit} />
        )}
        {tab === "ai" && (
          <AiPanel deck={deck} deckId={deckId} slide={slide} onEdit={onEdit} />
        )}
        {tab === "json" && (
          <JsonPanel
            key={JSON.stringify(slide)}
            deck={deck}
            slide={slide}
            onEdit={onEdit}
          />
        )}
      </div>
    </aside>
  );
};
