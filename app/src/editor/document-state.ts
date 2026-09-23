import type { DocumentFile } from "../schema/document";
import { findBlock, findSection } from "./document-operations";

// HTML 資料の編集画面の状態。base は最後に読み込んだか保存した文書、present が下書き。
// 座標を持たないので、スライドのような取り消しの積み上げは持たない(読む・直す・保存するの3つに絞る)

export type DocumentSelection =
  // 表紙まわり(signature・head・summary・toc・aside・foot)
  | { kind: "front" }
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string };

export type DocumentEditorState = {
  base: DocumentFile;
  present: DocumentFile;
  selection: DocumentSelection;
};

export type DocumentEditorAction =
  | { type: "edit"; document: DocumentFile; selection?: DocumentSelection }
  | { type: "select"; selection: DocumentSelection }
  | { type: "saved"; sent: DocumentFile; document: DocumentFile }
  | { type: "reload"; document: DocumentFile };

// 消えたセクションやブロックを指していたら、残っているものに寄せる
export const resolveSelection = (
  doc: DocumentFile,
  selection: DocumentSelection,
): DocumentSelection => {
  if (selection.kind === "front") return selection;
  if (!findSection(doc, selection.sectionId)) return { kind: "front" };
  return selection.kind === "block" &&
    !findBlock(doc, selection.sectionId, selection.blockId)
    ? { kind: "section", sectionId: selection.sectionId }
    : selection;
};

export const createDocumentEditorState = (
  doc: DocumentFile,
  selection: DocumentSelection = { kind: "front" },
): DocumentEditorState => ({
  base: doc,
  present: doc,
  selection: resolveSelection(doc, selection),
});

type Handlers = {
  [K in DocumentEditorAction["type"]]: (
    state: DocumentEditorState,
    action: Extract<DocumentEditorAction, { type: K }>,
  ) => DocumentEditorState;
};

const handlers: Handlers = {
  edit: (state, { document, selection }) =>
    document === state.present
      ? state
      : {
          ...state,
          present: document,
          selection: resolveSelection(document, selection ?? state.selection),
        },
  select: (state, { selection }) => ({
    ...state,
    selection: resolveSelection(state.present, selection),
  }),
  // 保存中に編集を続けていたら、その下書きは残して base だけ進める
  saved: (state, { sent, document }) =>
    state.present === sent
      ? { ...state, base: document, present: document }
      : { ...state, base: document },
  reload: (state, { document }) =>
    createDocumentEditorState(document, state.selection),
};

export const documentEditorReducer = (
  state: DocumentEditorState,
  action: DocumentEditorAction,
): DocumentEditorState =>
  (
    handlers[action.type] as (
      s: DocumentEditorState,
      a: DocumentEditorAction,
    ) => DocumentEditorState
  )(state, action);

export const isDocumentDirty = (state: DocumentEditorState): boolean =>
  state.present !== state.base;
