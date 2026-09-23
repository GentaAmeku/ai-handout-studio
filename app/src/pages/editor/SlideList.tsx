import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { deckAssetBase } from "../../api/client";
import { ScaledSlide } from "../../components/ScaledSlide";
import {
  addSlide,
  deleteSlide,
  duplicateSlide,
  reorderSlides,
} from "../../editor/operations";
import type { EditorAction } from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import { type Deck, deckTemplate } from "../../schema/deck";

// 左のスライド一覧。並べ替えは番号の下のつまみをドラッグする
// (HTML 資料の一覧と同じ @dnd-kit。つまみを選んで Space・矢印でも動く)

const SortableThumb = ({
  id,
  number,
  dragLabel,
  children,
}: {
  id: string;
  number: number;
  dragLabel: string;
  children: ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className="thumb"
      data-dragging={isDragging ? "true" : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <span className="thumb__lead">
        <span className="thumb__number">{number}</span>
        <button
          type="button"
          className="icon-button thumb__grip"
          aria-label={dragLabel}
          title={dragLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden />
        </button>
      </span>
      {children}
    </li>
  );
};

export const SlideList = ({
  deck,
  deckId,
  selectedSlideId,
  onEdit,
}: {
  deck: Deck;
  deckId: string;
  selectedSlideId?: string;
  onEdit: (action: EditorAction) => void;
}) => {
  const { t } = useLanguage();
  const select = (slideId: string) =>
    onEdit({ type: "select", selection: { slideId } });
  const commit = (result: { deck: Deck; slideId: string }) =>
    onEdit({
      type: "edit",
      deck: result.deck,
      selection: { slideId: result.slideId },
    });

  // 押しただけで動き出さないよう、少し動かしてから掴む
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const slideId = String(active.id);
    commit({
      deck: reorderSlides(deck, slideId, String(over.id)),
      slideId,
    });
  };

  return (
    <aside className="viewer__slides" aria-label={t("slides.list")}>
      <p className="viewer__slides-head">
        <span>{t("slides.head")}</span>
        <span className="count-badge">
          {t("unit.slides", { n: deck.slides.length })}
        </span>
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={deck.slides.map((slide) => slide.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="thumb-list">
            {deck.slides.map((slide, index) => {
              const selected = slide.id === selectedSlideId;
              return (
                <SortableThumb
                  key={slide.id}
                  id={slide.id}
                  number={index + 1}
                  dragLabel={t("slides.drag", { n: index + 1 })}
                >
                  <span className="thumb__frame">
                    <ScaledSlide
                      slide={slide}
                      decorative
                      context={{
                        pageNumber: index + 1,
                        pageCount: deck.slides.length,
                        assetBaseUrl: deckAssetBase(deckId),
                        template: deckTemplate(deck),
                      }}
                    />
                  </span>
                  <button
                    type="button"
                    className="thumb__button"
                    aria-label={t("slides.select", { n: index + 1 })}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => select(slide.id)}
                  />
                  {selected && (
                    // biome-ignore lint/a11y/useSemanticElements: 見出しの無い小さなボタンの組で、fieldset の枠は要らない
                    <div
                      className="thumb__actions"
                      role="group"
                      aria-label={t("slides.ops", { n: index + 1 })}
                    >
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("slides.duplicate")}
                        title={t("slides.duplicate")}
                        onClick={() => commit(duplicateSlide(deck, slide.id))}
                      >
                        <Copy size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("slides.delete")}
                        title={t("slides.delete")}
                        disabled={deck.slides.length <= 1}
                        onClick={() => commit(deleteSlide(deck, slide.id))}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  )}
                </SortableThumb>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="button button--outline button--block slide-list__add"
        onClick={() => commit(addSlide(deck, selectedSlideId))}
      >
        <Plus size={18} aria-hidden />
        {t("slides.add")}
      </button>
    </aside>
  );
};
