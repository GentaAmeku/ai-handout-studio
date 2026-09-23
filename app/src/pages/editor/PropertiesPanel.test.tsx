import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proposalDeck } from "../../../server/test-fixtures.ts";
import { findBlock, findSlide } from "../../editor/operations";
import type { EditorAction } from "../../editor/state";
import { type Deck, validateDeck } from "../../schema/deck";
import { PropertiesPanel } from "./PropertiesPanel";

const proposal = proposalDeck();

afterEach(cleanup);

const deck = validateDeck(proposal);

const renderPanel = (slideId: string, blockId?: string) => {
  const slide = findSlide(deck, slideId);
  if (!slide) throw new Error(`${slideId} が無い`);
  const onEdit = vi.fn<(action: EditorAction) => void>();
  render(
    <PropertiesPanel
      deck={deck}
      slide={slide}
      selection={{ slideId, blockId }}
      onEdit={onEdit}
    />,
  );
  return onEdit;
};

const lastDeck = (onEdit: ReturnType<typeof renderPanel>): Deck => {
  const action = onEdit.mock.calls.at(-1)?.[0];
  if (action?.type !== "edit") throw new Error("編集が起きていない");
  return action.deck;
};

const commitValue = (element: HTMLElement, value: string) => {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    )
  ) {
    throw new Error("入力欄ではない");
  }
  element.value = value;
  fireEvent.blur(element);
};

describe("PropertiesPanel", () => {
  it("見出しの文言は、欄の外へ出たときに1回の編集として確定する", () => {
    const onEdit = renderPanel("s04", "b11");
    const field = screen.getByLabelText("見出し");
    commitValue(field, "直した見出し");
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(findBlock(lastDeck(onEdit), "s04", "b11")).toMatchObject({
      props: { text: "直した見出し", level: 1 },
    });
  });

  it("値を変えずに離れたら編集にしない", () => {
    const onEdit = renderPanel("s04", "b11");
    fireEvent.blur(screen.getByLabelText("見出し"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("位置の数値は、キャンバスの外へ出ないように直して反映する", () => {
    const onEdit = renderPanel("s04", "b12");
    commitValue(screen.getByLabelText("x"), "999");
    expect(findBlock(lastDeck(onEdit), "s04", "b12")).toMatchObject({
      x: 128,
      w: 1152,
    });
  });

  it("ブロックを選んでいなければ、スライドのレイアウトとメモを直せる", () => {
    const onEdit = renderPanel("s04");
    fireEvent.change(screen.getByLabelText("レイアウト"), {
      target: { value: "section" },
    });
    expect(findSlide(lastDeck(onEdit), "s04")?.layout).toBe("section");
  });
});
