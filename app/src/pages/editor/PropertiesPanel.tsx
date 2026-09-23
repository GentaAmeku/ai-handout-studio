import { Trash2 } from "lucide-react";
import {
  deleteBlock,
  type Rect,
  replaceBlock,
  setBlockRect,
  updateSlide,
} from "../../editor/operations";
import type { EditorAction, Selection } from "../../editor/state";
import { partLabelFor, useLanguage } from "../../i18n/language";
import { isKnownBlock } from "../../schema/block";
import type { Deck, Slide, SlideLayout } from "../../schema/deck";
import { BlockFields } from "./BlockFields";
import { NumberField, type Option, SelectField, TextField } from "./fields";

const rectKeys = ["x", "y", "w", "h"] as const;

const SlideProperties = ({
  deck,
  slide,
  onEdit,
}: {
  deck: Deck;
  slide: Slide;
  onEdit: (action: EditorAction) => void;
}) => {
  const { t } = useLanguage();
  const layoutOptions: readonly Option<SlideLayout>[] = [
    { value: "cover", label: t("props.layoutCover") },
    { value: "section", label: t("props.layoutSection") },
    { value: "content", label: t("props.layoutContent") },
    { value: "closing", label: t("props.layoutClosing") },
  ];
  const commit = (update: (slide: Slide) => Slide) =>
    onEdit({
      type: "edit",
      deck: updateSlide(deck, slide.id, update),
      selection: { slideId: slide.id },
    });
  return (
    <div className="prop-panel">
      <div className="prop-panel__head">
        <h3 className="prop-panel__title">{t("props.slide")}</h3>
        <span className="prop-panel__id">{slide.id}</span>
      </div>
      <SelectField
        label={t("props.layout")}
        value={slide.layout}
        options={layoutOptions}
        onChange={(layout) => commit((current) => ({ ...current, layout }))}
      />
      <TextField
        label={t("props.notes")}
        multiline
        rows={6}
        hint={t("props.notesHint")}
        value={slide.notes ?? ""}
        onCommit={(notes) => commit((current) => ({ ...current, notes }))}
      />
      <p className="prop-panel__hint">{t("props.pickBlockHint")}</p>
    </div>
  );
};

export const PropertiesPanel = ({
  deck,
  slide,
  selection,
  onEdit,
}: {
  deck: Deck;
  slide: Slide;
  selection: Selection;
  onEdit: (action: EditorAction) => void;
}) => {
  const block = slide.blocks.find((item) => item.id === selection.blockId);
  const { t } = useLanguage();
  if (!block) {
    return <SlideProperties deck={deck} slide={slide} onEdit={onEdit} />;
  }

  const edit = (next: Deck) =>
    onEdit({
      type: "edit",
      deck: next,
      selection: { slideId: slide.id, blockId: block.id },
    });
  const rect: Rect = { x: block.x, y: block.y, w: block.w, h: block.h };

  return (
    <div className="prop-panel">
      <div className="prop-panel__head">
        <h3 className="prop-panel__title">{partLabelFor(block.type, t)}</h3>
        <span className="prop-panel__id">{block.id}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("props.deleteBlock")}
          title={t("props.deleteTitle")}
          onClick={() =>
            onEdit({
              type: "edit",
              deck: deleteBlock(deck, slide.id, block.id),
              selection: { slideId: slide.id },
            })
          }
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      <section className="prop-section">
        <h4 className="prop-section__title">{t("props.rect")}</h4>
        <div className="prop-grid">
          {rectKeys.map((key) => (
            <NumberField
              key={key}
              label={key}
              value={block[key]}
              onCommit={(value) =>
                edit(
                  setBlockRect(
                    deck,
                    slide.id,
                    block.id,
                    { ...rect, [key]: value },
                    { snapToGrid: false },
                  ),
                )
              }
            />
          ))}
        </div>
      </section>

      <section className="prop-section">
        <h4 className="prop-section__title">{t("props.content")}</h4>
        {isKnownBlock(block) ? (
          <BlockFields
            block={block}
            onChange={(next) => edit(replaceBlock(deck, slide.id, next))}
          />
        ) : (
          <p className="prop-panel__hint">{t("props.unknownBlock")}</p>
        )}
      </section>

      <p className="prop-panel__hint">{t("props.partHint")}</p>
    </div>
  );
};
