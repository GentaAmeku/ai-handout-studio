import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proposalDeck } from "../../../server/test-fixtures.ts";
import { findBlock } from "../../editor/operations";
import type { EditorAction } from "../../editor/state";
import type { Block } from "../../schema/block";
import { type Deck, validateDeck } from "../../schema/deck";
import { Canvas } from "./Canvas";

const proposal = proposalDeck();

const deck = validateDeck(proposal);
const slideIndex = deck.slides.findIndex((slide) => slide.id === "s04");
const slide = deck.slides[slideIndex];

// jsdom はレイアウトを計算しないので、キャンバスの枠を等倍(1280x720)として知らせる
class FixedSizeObserver {
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    this.callback(
      [{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FixedSizeObserver);
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderCanvas = (blockId?: string) => {
  if (!slide) throw new Error("s04 が無い");
  const onEdit = vi.fn<(action: EditorAction) => void>();
  const view = render(
    <Canvas
      deck={deck}
      deckId="deck_20260916_001"
      slide={slide}
      slideIndex={slideIndex}
      selection={{ slideId: "s04", blockId }}
      onEdit={onEdit}
    />,
  );
  return { ...view, onEdit };
};

const editedBlock = (
  onEdit: ReturnType<typeof renderCanvas>["onEdit"],
  blockId: string,
): Block | undefined => {
  const edited: Deck | undefined = onEdit.mock.calls
    .map(([action]) => action)
    .flatMap((action) => (action.type === "edit" ? [action.deck] : []))
    .at(-1);
  return edited ? findBlock(edited, "s04", blockId) : undefined;
};

const elementOf = (container: HTMLElement, selector: string): Element => {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`${selector} が無い`);
  return element;
};

const drag = (
  element: Element,
  from: [number, number],
  to: [number, number],
) => {
  fireEvent.pointerDown(element, {
    button: 0,
    pointerId: 1,
    clientX: from[0],
    clientY: from[1],
  });
  fireEvent.pointerMove(element, {
    pointerId: 1,
    clientX: to[0],
    clientY: to[1],
  });
  fireEvent.pointerUp(element, {
    pointerId: 1,
    clientX: to[0],
    clientY: to[1],
  });
};

describe("Canvas", () => {
  it("右下のつまみのドラッグで、左上を動かさずに大きさを変える", () => {
    const { container, onEdit } = renderCanvas("b12");
    drag(elementOf(container, ".canvas__handle--se"), [1216, 416], [1131, 373]);
    expect(editedBlock(onEdit, "b12")).toMatchObject({
      x: 64,
      y: 176,
      w: 1064,
      h: 200,
    });
  });

  it("ブロックのドラッグで、大きさを変えずに 8px にそろえて動かす", () => {
    const { container, onEdit } = renderCanvas();
    drag(
      elementOf(container, '[aria-label="card-grid ブロック b12"]'),
      [100, 200],
      [141, 225],
    );
    expect(editedBlock(onEdit, "b12")).toMatchObject({
      x: 104,
      y: 200,
      w: 1152,
      h: 240,
    });
  });

  it("動かさずに離したら選ぶだけで、編集にしない", () => {
    const { container, onEdit } = renderCanvas();
    drag(
      elementOf(container, '[aria-label="card-grid ブロック b12"]'),
      [100, 200],
      [101, 201],
    );
    expect(onEdit.mock.calls.map(([action]) => action.type)).toEqual([
      "select",
    ]);
  });

  it("見出しをダブルクリックして直し、欄の外へ出ると確定する", () => {
    const { container, onEdit } = renderCanvas("b11");
    fireEvent.doubleClick(
      elementOf(container, '[aria-label="heading ブロック b11"]'),
    );
    const textarea = elementOf(container, "textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("文言の入力欄が無い");
    }
    textarea.value = "直した見出し";
    fireEvent.blur(textarea);
    expect(editedBlock(onEdit, "b11")).toMatchObject({
      props: { text: "直した見出し" },
    });
  });
});
