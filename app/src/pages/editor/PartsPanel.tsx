import {
  ChartColumn,
  Columns2,
  Heading,
  Image,
  LayoutGrid,
  List,
  type LucideIcon,
  PanelBottom,
  Table,
  Text,
  Workflow,
} from "lucide-react";
import { insertBlock } from "../../editor/operations";
import { parts } from "../../editor/parts";
import type { EditorAction } from "../../editor/state";
import { partLabelFor, partNoteFor, useLanguage } from "../../i18n/language";
import type { KnownBlockType } from "../../schema/block";
import type { Deck, Slide } from "../../schema/deck";

const partIcons: { [T in KnownBlockType]: LucideIcon } = {
  heading: Heading,
  text: Text,
  bullets: List,
  "card-grid": LayoutGrid,
  "kpi-row": ChartColumn,
  "two-col": Columns2,
  process: Workflow,
  table: Table,
  image: Image,
  footer: PanelBottom,
};

export const PartsPanel = ({
  deck,
  slide,
  onEdit,
}: {
  deck: Deck;
  slide: Slide;
  onEdit: (action: EditorAction) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="parts-panel">
      <ul className="parts-grid">
        {parts.map((part) => {
          const Icon = partIcons[part.type];
          return (
            <li key={part.type}>
              <button
                type="button"
                className="part-card"
                onClick={() => {
                  const result = insertBlock(deck, slide.id, part.create());
                  onEdit({
                    type: "edit",
                    deck: result.deck,
                    selection: { slideId: slide.id, blockId: result.blockId },
                  });
                }}
              >
                <Icon size={28} strokeWidth={1.5} aria-hidden />
                <span className="part-card__label">
                  {partLabelFor(part.type, t)}
                </span>
                <span className="part-card__note">
                  {partNoteFor(part.type, t)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="prop-panel__hint">{t("parts.hint")}</p>
    </div>
  );
};
