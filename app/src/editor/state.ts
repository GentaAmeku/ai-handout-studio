import type { Deck } from "../schema/deck";

// 編集画面の状態。base は最後に読み込んだか保存した deck、present が下書き

export type Selection = { slideId: string; blockId?: string };

export type EditorState = {
  base: Deck;
  past: readonly Deck[];
  present: Deck;
  future: readonly Deck[];
  selection: Selection;
};

export type EditorAction =
  | { type: "edit"; deck: Deck; selection?: Selection }
  | { type: "select"; selection: Selection }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved"; sent: Deck; deck: Deck }
  | { type: "reload"; deck: Deck };

export const HISTORY_LIMIT = 100;

const firstSlideId = (deck: Deck): string => deck.slides[0]?.id ?? "";

// 消えたスライドやブロックを指していたら、残っているものに寄せる
export const resolveSelection = (
  deck: Deck,
  selection: Selection,
): Selection => {
  const slide = deck.slides.find((item) => item.id === selection.slideId);
  if (!slide) return { slideId: firstSlideId(deck) };
  return selection.blockId &&
    slide.blocks.some((block) => block.id === selection.blockId)
    ? selection
    : { slideId: slide.id };
};

export const createEditorState = (
  deck: Deck,
  slideId?: string,
): EditorState => ({
  base: deck,
  past: [],
  present: deck,
  future: [],
  selection: resolveSelection(deck, { slideId: slideId ?? firstSlideId(deck) }),
});

type Handlers = {
  [K in EditorAction["type"]]: (
    state: EditorState,
    action: Extract<EditorAction, { type: K }>,
  ) => EditorState;
};

const handlers: Handlers = {
  // 1回の操作が「戻す」1回分
  edit: (state, { deck, selection }) =>
    deck === state.present
      ? state
      : {
          ...state,
          past: [...state.past, state.present].slice(-HISTORY_LIMIT),
          present: deck,
          future: [],
          selection: resolveSelection(deck, selection ?? state.selection),
        },
  select: (state, { selection }) => ({
    ...state,
    selection: resolveSelection(state.present, selection),
  }),
  undo: (state) => {
    const previous = state.past.at(-1);
    return previous
      ? {
          ...state,
          past: state.past.slice(0, -1),
          present: previous,
          future: [state.present, ...state.future],
          selection: resolveSelection(previous, state.selection),
        }
      : state;
  },
  redo: (state) => {
    const [next, ...rest] = state.future;
    return next
      ? {
          ...state,
          past: [...state.past, state.present],
          present: next,
          future: rest,
          selection: resolveSelection(next, state.selection),
        }
      : state;
  },
  // 保存中に編集を続けていたら、その下書きは残して base だけ進める
  saved: (state, { sent, deck }) =>
    state.present === sent
      ? { ...state, base: deck, present: deck }
      : { ...state, base: deck },
  reload: (state, { deck }) => createEditorState(deck, state.selection.slideId),
};

export const editorReducer = (
  state: EditorState,
  action: EditorAction,
): EditorState =>
  (handlers[action.type] as (s: EditorState, a: EditorAction) => EditorState)(
    state,
    action,
  );

export const isDirty = (state: EditorState): boolean =>
  state.present !== state.base;
