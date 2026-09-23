import { describe, expect, it } from "vitest";
import { proposalDeck } from "../../server/test-fixtures.ts";
import { validateDeck } from "../schema/deck";
import { deleteBlock, deleteSlide } from "./operations";
import {
  createEditorState,
  type EditorAction,
  type EditorState,
  editorReducer,
  HISTORY_LIMIT,
  isDirty,
} from "./state";

const proposal = proposalDeck();

const deck = validateDeck(proposal);

const run = (state: EditorState, ...actions: EditorAction[]) =>
  actions.reduce(editorReducer, state);

const retitled = (title: string) => ({ ...deck, title });

describe("editorReducer", () => {
  it("編集は履歴に積み、戻す・進むで行き来でき、元に戻れば未変更になる", () => {
    const edited = retitled("A");
    const state = run(createEditorState(deck), { type: "edit", deck: edited });
    expect(isDirty(state)).toBe(true);

    const undone = run(state, { type: "undo" });
    expect(undone.present).toBe(deck);
    expect(isDirty(undone)).toBe(false);

    expect(run(undone, { type: "redo" }).present).toBe(edited);
  });

  it("新しい編集で進む先を捨て、履歴は上限までにする", () => {
    const edits = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index) => ({
      type: "edit" as const,
      deck: retitled(String(index)),
    }));
    const state = run(
      createEditorState(deck),
      ...edits,
      { type: "undo" },
      {
        type: "edit",
        deck: retitled("B"),
      },
    );
    expect(state.future).toEqual([]);
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it("消えたブロックやスライドを選んでいたら、残っているものに寄せる", () => {
    const selected = run(createEditorState(deck), {
      type: "select",
      selection: { slideId: "s02", blockId: "b06" },
    });
    const withoutBlock = run(selected, {
      type: "edit",
      deck: deleteBlock(deck, "s02", "b06"),
    });
    expect(withoutBlock.selection).toEqual({ slideId: "s02" });

    const withoutSlide = run(selected, {
      type: "edit",
      deck: deleteSlide(deck, "s02").deck,
    });
    expect(withoutSlide.selection).toEqual({ slideId: "s01" });
  });

  it("保存が済んだら base を進め、保存中に続けた編集は残す", () => {
    const sent = retitled("保存する版");
    const savedDeck = {
      ...sent,
      meta: { ...sent.meta, updatedAt: "2026-09-16T01:00:00.000Z" },
    };
    const editing = run(createEditorState(deck), { type: "edit", deck: sent });

    const clean = run(editing, { type: "saved", sent, deck: savedDeck });
    expect(clean.present).toBe(savedDeck);
    expect(isDirty(clean)).toBe(false);

    const later = retitled("保存中に直した版");
    const dirty = run(
      editing,
      { type: "edit", deck: later },
      { type: "saved", sent, deck: savedDeck },
    );
    expect(dirty.present).toBe(later);
    expect(dirty.base).toBe(savedDeck);
    expect(isDirty(dirty)).toBe(true);
  });
});
