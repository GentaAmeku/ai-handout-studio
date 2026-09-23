import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { deckAssetBase } from "../../api/client";
import { useElementSize } from "../../components/useElementSize";
import {
  type Corner,
  corners,
  moveRect,
  resizeRect,
  snapPosition,
  snapResize,
} from "../../editor/geometry";
import { inlineTextOf, withInlineText } from "../../editor/inline-text";
import {
  fitRect,
  type Rect,
  replaceBlock,
  setBlockRect,
} from "../../editor/operations";
import type { EditorAction, Selection } from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import { SlideView } from "../../renderer/SlideView";
import type { Block } from "../../schema/block";
import {
  type Deck,
  deckTemplate,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Slide,
} from "../../schema/deck";

type Zoom = "fit" | "actual";

type Gesture = {
  blockId: string;
  mode: "move" | Corner;
  startX: number;
  startY: number;
  origin: Rect;
};

// これより小さい動きはクリックとして扱い、編集にしない
const CLICK_TOLERANCE_PX = 3;

const rectOf = (block: Block): Rect => ({
  x: block.x,
  y: block.y,
  w: block.w,
  h: block.h,
});

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const handlePosition = (rect: Rect, corner: Corner) => ({
  left: corner === "nw" || corner === "sw" ? rect.x : rect.x + rect.w,
  top: corner === "nw" || corner === "ne" ? rect.y : rect.y + rect.h,
});

const InlineEditor = ({
  block,
  onCommit,
  onCancel,
}: {
  block: Block;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  const { t } = useLanguage();

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      className={`canvas__inline canvas__inline--${block.type}`}
      data-level={
        block.type === "heading" && "level" in block.props
          ? String(block.props.level)
          : undefined
      }
      aria-label={t("canvas.editText")}
      defaultValue={inlineTextOf(block) ?? ""}
      style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancelled.current = true;
        onCancel();
      }}
      onBlur={(event) => {
        if (!cancelled.current) onCommit(event.currentTarget.value);
      }}
    />
  );
};

export const Canvas = ({
  deck,
  deckId,
  slide,
  slideIndex,
  selection,
  overflowIds,
  onEdit,
}: {
  deck: Deck;
  deckId: string;
  slide: Slide;
  slideIndex: number;
  selection: Selection;
  // はみ出し検査で見つかったブロック
  overflowIds?: readonly string[];
  onEdit: (action: EditorAction) => void;
}) => {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { t } = useLanguage();
  const { ref, width, height } = useElementSize<HTMLDivElement>();

  const scale =
    zoom === "actual"
      ? 1
      : Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT);

  // ドラッグ中は、確定前の位置で描く
  const shownSlide: Slide =
    gesture && preview
      ? {
          ...slide,
          blocks: slide.blocks.map((block) =>
            block.id === gesture.blockId ? { ...block, ...preview } : block,
          ),
        }
      : slide;

  const selectedBlock = shownSlide.blocks.find(
    (block) => block.id === selection.blockId,
  );
  const editingBlock = slide.blocks.find((block) => block.id === editingId);

  const select = (blockId?: string) =>
    onEdit({ type: "select", selection: { slideId: slide.id, blockId } });

  const startGesture = (
    event: PointerEvent<HTMLElement>,
    block: Block,
    mode: Gesture["mode"],
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    select(block.id);
    setGesture({
      blockId: block.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: rectOf(block),
    });
  };

  const rectFor = (event: PointerEvent<HTMLElement>, current: Gesture) => {
    const dx = (event.clientX - current.startX) / scale;
    const dy = (event.clientY - current.startY) / scale;
    const rect =
      current.mode === "move"
        ? snapPosition(moveRect(current.origin, dx, dy))
        : snapResize(
            resizeRect(current.origin, current.mode, dx, dy),
            current.mode,
          );
    return fitRect(rect, { snapToGrid: false });
  };

  const isClick = (event: PointerEvent<HTMLElement>, current: Gesture) =>
    Math.hypot(event.clientX - current.startX, event.clientY - current.startY) <
    CLICK_TOLERANCE_PX;

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!gesture || isClick(event, gesture)) return;
    setPreview(rectFor(event, gesture));
  };

  // 1回のドラッグ・リサイズを「戻す」1回分として確定する
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!gesture) return;
    const rect = rectFor(event, gesture);
    setGesture(null);
    setPreview(null);
    if (isClick(event, gesture) || sameRect(rect, gesture.origin)) return;
    onEdit({
      type: "edit",
      deck: setBlockRect(deck, slide.id, gesture.blockId, rect, {
        snapToGrid: false,
      }),
      selection: { slideId: slide.id, blockId: gesture.blockId },
    });
  };

  const onBlockKeyDown = (event: KeyboardEvent<HTMLElement>, block: Block) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (selection.blockId === block.id && inlineTextOf(block) !== undefined) {
      setEditingId(block.id);
      return;
    }
    select(block.id);
  };

  const commitText = (block: Block, text: string) => {
    setEditingId(null);
    if (text === inlineTextOf(block)) return;
    onEdit({
      type: "edit",
      deck: replaceBlock(deck, slide.id, withInlineText(block, text)),
      selection: { slideId: slide.id, blockId: block.id },
    });
  };

  return (
    <section className="viewer__stage" aria-label={t("canvas.stage")}>
      <div className="viewer__meta">
        <span>16:9(1280x720)</span>
        <fieldset className="zoom-toggle">
          <legend className="visually-hidden">{t("canvas.zoom")}</legend>
          <button
            type="button"
            aria-pressed={zoom === "fit"}
            onClick={() => setZoom("fit")}
          >
            {t("canvas.fit")}
          </button>
          <button
            type="button"
            aria-pressed={zoom === "actual"}
            onClick={() => setZoom("actual")}
          >
            1:1
          </button>
        </fieldset>
        <span>
          {slideIndex + 1} / {deck.slides.length}
        </span>
      </div>
      <div ref={ref} className={`canvas canvas--${zoom}`}>
        {scale > 0 && (
          <div
            className="canvas__frame"
            style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
          >
            <div
              className="canvas__scaler"
              style={{
                transform: `scale(${scale})`,
                ["--canvas-scale" as string]: scale,
              }}
            >
              <SlideView
                slide={shownSlide}
                context={{
                  pageNumber: slideIndex + 1,
                  pageCount: deck.slides.length,
                  assetBaseUrl: deckAssetBase(deckId),
                  template: deckTemplate(deck),
                }}
              />
              <div
                className="canvas__overlay"
                onPointerDown={() => select(undefined)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  setGesture(null);
                  setPreview(null);
                }}
              >
                {shownSlide.blocks.map((block) => (
                  // biome-ignore lint/a11y/useSemanticElements: 絶対配置の枠をボタン要素にすると描画と重ならないため、role で示す
                  <div
                    key={block.id}
                    role="button"
                    tabIndex={0}
                    className="canvas__hit"
                    data-selected={block.id === selection.blockId}
                    data-overflow={overflowIds?.includes(block.id)}
                    aria-label={t("canvas.block", {
                      type: block.type,
                      id: block.id,
                    })}
                    aria-pressed={block.id === selection.blockId}
                    style={{
                      left: block.x,
                      top: block.y,
                      width: block.w,
                      height: block.h,
                    }}
                    onPointerDown={(event) =>
                      startGesture(event, block, "move")
                    }
                    onDoubleClick={() => {
                      if (inlineTextOf(block) !== undefined) {
                        setEditingId(block.id);
                      }
                    }}
                    onKeyDown={(event) => onBlockKeyDown(event, block)}
                  />
                ))}
                {selectedBlock &&
                  !editingBlock &&
                  corners.map((corner) => (
                    <span
                      key={corner}
                      className={`canvas__handle canvas__handle--${corner}`}
                      style={handlePosition(rectOf(selectedBlock), corner)}
                      onPointerDown={(event) =>
                        startGesture(event, selectedBlock, corner)
                      }
                    />
                  ))}
                {editingBlock && (
                  <InlineEditor
                    key={editingBlock.id}
                    block={editingBlock}
                    onCommit={(text) => commitText(editingBlock, text)}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
