import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useBlocker } from "@tanstack/react-router";
import {
  type CSSProperties,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from "react";
import { errorStatus } from "../../api/client";
import { deckQuery, useSaveDeck } from "../../api/queries";
import { resolveTemplateName } from "../../design/registry";
import { nudgeRect } from "../../editor/geometry";
import { deleteBlock, findBlock, setBlockRect } from "../../editor/operations";
import { isInsideDialog, isTextInput } from "../../editor/shortcuts";
import {
  createEditorState,
  type EditorAction,
  editorReducer,
  isDirty,
} from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import type { OverflowReport } from "../../renderer/overflow";
import { type Deck, deckTemplate } from "../../schema/deck";
import { Canvas } from "./Canvas";
import { EditorBar } from "./EditorBar";
import { HistoryDialog } from "./HistoryDialog";
import { OverflowPanel } from "./OverflowPanel";
import { OverflowProbe } from "./OverflowProbe";
import { SidePanel } from "./SidePanel";
import { SlideList } from "./SlideList";
import {
  readSideWidth,
  SIDE_WIDTH_MAX,
  SIDE_WIDTH_MIN,
  writeSideWidth,
} from "./side-width";
import { TemplateSwitchDialog } from "./TemplateSwitchDialog";

const route = getRouteApi("/decks/$deckId");

const issueCount = (reports: readonly OverflowReport[]): number =>
  reports.reduce((total, report) => total + report.issues.length, 0);

export const Editor = ({
  deckId,
  serverDeck,
}: {
  deckId: string;
  serverDeck: Deck;
}) => {
  const { slide: initialSlideId } = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    createEditorState(serverDeck, initialSlideId),
  );
  const [dismissedUpdatedAt, setDismissedUpdatedAt] = useState<string>();
  const [reports, setReports] = useState<OverflowReport[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sideWidth, setSideWidth] = useState(readSideWidth);
  const waitingForCheck = useRef<((reports: OverflowReport[]) => void) | null>(
    null,
  );
  const saveDeck = useSaveDeck(deckId, (deck, sent) =>
    dispatch({ type: "saved", sent, deck }),
  );

  const deck = state.present;
  const dirty = isDirty(state);
  const slideIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === state.selection.slideId),
  );
  const slide = deck.slides[slideIndex];
  const overflowIds =
    reports
      ?.find((report) => report.slideId === slide?.id)
      ?.issues.map((issue) => issue.blockId) ?? [];

  // ファイルが外で書き換えられたとき、手つかずなら読み直し、手を入れていれば知らせる
  const changedOutside =
    serverDeck.meta.updatedAt !== state.base.meta.updatedAt;
  useEffect(() => {
    if (changedOutside && !dirty)
      dispatch({ type: "reload", deck: serverDeck });
  }, [changedOutside, dirty, serverDeck]);
  const showConflict =
    changedOutside && dirty && dismissedUpdatedAt !== serverDeck.meta.updatedAt;

  useEffect(() => {
    void navigate({
      search: { slide: state.selection.slideId },
      replace: true,
    });
  }, [navigate, state.selection.slideId]);

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !window.confirm(t("editor.leaveConfirm")),
    enableBeforeUnload: dirty,
    disabled: !dirty,
  });

  // 画面の外に等倍で描いて測る。終わるまで待てるように Promise で返す
  const runCheck = () =>
    new Promise<OverflowReport[]>((resolve) => {
      waitingForCheck.current = resolve;
      setReports(null);
      setChecking(true);
    });

  const onChecked = (found: OverflowReport[]) => {
    setReports(found);
    setChecking(false);
    waitingForCheck.current?.(found);
    waitingForCheck.current = null;
  };

  const save = () => {
    if (saveDeck.isPending) return;
    saveDeck.mutate({
      deck: state.present,
      baseUpdatedAt: state.base.meta.updatedAt,
    });
    // 保存は止めず、はみ出しは警告として出す
    void runCheck();
  };

  const beforeExport = async () => {
    const found = await runCheck();
    const count = issueCount(found);
    return (
      count === 0 || window.confirm(t("editor.overflowConfirm", { n: count }))
    );
  };

  const reloadFromFile = async () => {
    const detail = await queryClient.fetchQuery({
      ...deckQuery(deckId),
      staleTime: 0,
    });
    if (detail.state === "ready") {
      saveDeck.reset();
      dispatch({ type: "reload", deck: detail.deck });
    }
  };

  // 選んだブロックへのキー操作。文言の入力中は文字の操作に使う
  const onBlockKey = (event: KeyboardEvent) => {
    const { slideId, blockId } = state.selection;
    const block = blockId
      ? findBlock(state.present, slideId, blockId)
      : undefined;
    if (!block || !blockId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      dispatch({
        type: "edit",
        deck: deleteBlock(state.present, slideId, blockId),
        selection: { slideId },
      });
      return;
    }
    if (event.key === "Escape") {
      dispatch({ type: "select", selection: { slideId } });
      return;
    }
    const moved = nudgeRect(block, event.key);
    if (!moved) return;
    event.preventDefault();
    dispatch({
      type: "edit",
      deck: setBlockRect(state.present, slideId, blockId, moved, {
        snapToGrid: false,
      }),
      selection: state.selection,
    });
  };

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    // ダイアログを開いている間は、背後のスライドを操作しない
    if (isInsideDialog(event.target)) return;
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        save();
        return;
      }
      if (key === "z" && !isTextInput(event.target)) {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
      return;
    }
    if (!isTextInput(event.target)) onBlockKey(event);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const edit = (action: EditorAction) => dispatch(action);

  // 見た目だけを替える(slides・blocks は触らない)。替えた直後に、はみ出しを測り直す
  const switchTemplate = (name: string) => {
    if (name === resolveTemplateName(deckTemplate(state.present))) return;
    dispatch({
      type: "edit",
      deck: { ...state.present, template: name },
      selection: state.selection,
    });
    void runCheck();
  };

  const changeSideWidth = (width: number) => {
    setSideWidth(width);
    writeSideWidth(width);
  };

  return (
    <div className="viewer editor">
      <EditorBar
        deckId={deckId}
        deck={deck}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        dirty={dirty}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={save}
        saving={saveDeck.isPending}
        saveError={saveDeck.error?.message}
        conflict={errorStatus(saveDeck.error) === 409 || showConflict}
        checking={checking}
        onReload={() => void reloadFromFile()}
        onKeepEditing={() => {
          saveDeck.reset();
          setDismissedUpdatedAt(serverDeck.meta.updatedAt);
        }}
        onInspect={() => void runCheck()}
        onHistory={() => setHistoryOpen(true)}
        onTemplate={() => setTemplateOpen(true)}
        beforeExport={beforeExport}
      />
      <div
        className="viewer__body editor__body"
        style={{ "--edit-side-width": `${sideWidth}px` } as CSSProperties}
      >
        <SlideList
          deck={deck}
          deckId={deckId}
          selectedSlideId={slide?.id}
          onEdit={edit}
        />
        {slide && (
          <Canvas
            deck={deck}
            deckId={deckId}
            slide={slide}
            slideIndex={slideIndex}
            selection={state.selection}
            overflowIds={overflowIds}
            onEdit={edit}
          />
        )}
        {slide && (
          <SidePanel
            deck={deck}
            deckId={deckId}
            slide={slide}
            selection={state.selection}
            sideWidth={sideWidth}
            sideWidthMin={SIDE_WIDTH_MIN}
            sideWidthMax={SIDE_WIDTH_MAX}
            onSideWidthChange={changeSideWidth}
            onEdit={edit}
          />
        )}
      </div>

      {checking && (
        <OverflowProbe deck={deck} deckId={deckId} onDone={onChecked} />
      )}
      {reports && (
        <OverflowPanel
          reports={reports}
          onClose={() => setReports(null)}
          onSelect={(slideId, blockId) =>
            dispatch({ type: "select", selection: { slideId, blockId } })
          }
        />
      )}
      <TemplateSwitchDialog
        open={templateOpen}
        deckId={deckId}
        current={resolveTemplateName(deckTemplate(deck))}
        slide={slide}
        onClose={() => setTemplateOpen(false)}
        onSelect={switchTemplate}
      />
      <HistoryDialog
        open={historyOpen}
        deckId={deckId}
        dirty={dirty}
        onClose={() => setHistoryOpen(false)}
        onRestored={(restored) => dispatch({ type: "reload", deck: restored })}
      />
    </div>
  );
};
