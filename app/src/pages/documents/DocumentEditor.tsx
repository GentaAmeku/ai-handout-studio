import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useReducer, useState } from "react";
import { errorStatus } from "../../api/client";
import {
  designTemplatesQuery,
  documentAiPreviewUrl,
  documentQuery,
  handoutPreviewUrl,
  handoutQuery,
  useSaveDocument,
} from "../../api/queries";
import {
  createDocumentEditorState,
  type DocumentEditorAction,
  documentEditorReducer,
  isDocumentDirty,
} from "../../editor/document-state";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { FrameView } from "../design/SampleStage";
import {
  readSideOpen,
  readSideWidth,
  SIDE_WIDTH_MAX,
  SIDE_WIDTH_MIN,
  writeSideOpen,
  writeSideWidth,
} from "../editor/side-width";
import type { DocumentCompare } from "./DocumentAiPanel";
import { DocumentBar } from "./DocumentBar";
import { DocumentHistoryDialog } from "./DocumentHistoryDialog";
import { DocumentOutline } from "./DocumentOutline";
import { DocumentSidePanel } from "./DocumentSidePanel";

// HTML 資料の編集画面。3列で、左がセクションとブロックの並び、中央が書き出しと同じ1枚の
// プレビュー、右が選んだものの中身。キャンバスは持たない(文書は座標を持たない)

export const DocumentEditor = ({
  id,
  title,
  template,
  updatedAt,
  serverDocument,
  shareUrl,
}: {
  id: string;
  title: string;
  template: string;
  // 資料の更新日時(meta.json)。テンプレートを替えても保存しても変わるので、プレビューの読み直しに使う
  updatedAt: string;
  serverDocument: DocumentFile;
  // 公開した Artifact の URL(share.json)。無ければ null
  shareUrl: string | null;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const design = useQuery(designTemplatesQuery);
  const [state, dispatch] = useReducer(documentEditorReducer, undefined, () =>
    createDocumentEditorState(serverDocument),
  );
  const [dismissedUpdatedAt, setDismissedUpdatedAt] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compare, setCompare] = useState<DocumentCompare>();
  const [sideWidth, setSideWidth] = useState(readSideWidth);
  const [sideOpen, setSideOpen] = useState(readSideOpen);
  const saveDocument = useSaveDocument(id, (document, sent) =>
    dispatch({ type: "saved", sent, document }),
  );

  const document = state.present;
  const dirty = isDocumentDirty(state);

  // ファイルが外で書き換えられたとき、手つかずなら読み直し、手を入れていれば知らせる
  const changedOutside =
    serverDocument.meta.updatedAt !== state.base.meta.updatedAt;
  useEffect(() => {
    if (changedOutside && !dirty)
      dispatch({ type: "reload", document: serverDocument });
  }, [changedOutside, dirty, serverDocument]);
  const showConflict =
    changedOutside &&
    dirty &&
    dismissedUpdatedAt !== serverDocument.meta.updatedAt;

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !window.confirm(t("editor.leaveConfirm")),
    enableBeforeUnload: dirty,
    disabled: !dirty,
  });

  const save = () => {
    if (saveDocument.isPending || !dirty) return;
    saveDocument.mutate({
      document: state.present,
      baseUpdatedAt: state.base.meta.updatedAt,
    });
  };

  const reloadFromFile = async () => {
    const next = await queryClient.fetchQuery({
      ...documentQuery(id),
      staleTime: 0,
    });
    saveDocument.reset();
    dispatch({ type: "reload", document: next });
  };

  const changeSideWidth = (width: number) => {
    setSideWidth(width);
    writeSideWidth(width);
  };

  const changeSideOpen = (open: boolean) => {
    setSideOpen(open);
    writeSideOpen(open);
  };

  const edit = (action: DocumentEditorAction) => dispatch(action);

  return (
    <div className="viewer editor document-editor">
      <DocumentBar
        id={id}
        title={title}
        template={template}
        templates={design.data?.templates.document ?? []}
        createdAt={document.meta.createdAt}
        updatedAt={document.meta.updatedAt}
        dirty={dirty}
        saving={saveDocument.isPending}
        saveError={saveDocument.error?.message}
        conflict={errorStatus(saveDocument.error) === 409 || showConflict}
        shareUrl={shareUrl}
        onSave={save}
        onReload={() => void reloadFromFile()}
        onKeepEditing={() => {
          saveDocument.reset();
          setDismissedUpdatedAt(serverDocument.meta.updatedAt);
        }}
        onHistory={() => setHistoryOpen(true)}
      />
      <div
        className="viewer__body document-editor__body"
        style={
          {
            "--edit-side-width": sideOpen
              ? `${sideWidth}px`
              : "var(--edit-side-rail)",
          } as CSSProperties
        }
      >
        <DocumentOutline
          document={document}
          selection={state.selection}
          onEdit={edit}
        />
        <div className="document-preview">
          {/* 倍率は切り替えず、いつも画面に合わせる(1280 の幅で描いて枠に縮める。132) */}
          {compare ? (
            <>
              <p className="document-preview__note">
                {t("docai.comparing", {
                  view: t(
                    compare.view === "before"
                      ? "docai.viewBefore"
                      : "docai.viewAfter",
                  ),
                })}
              </p>
              <FrameView
                key={`${compare.requestId}-${compare.view}`}
                src={documentAiPreviewUrl(id, compare.requestId, compare.view)}
                title={title}
              />
            </>
          ) : (
            <>
              {dirty && (
                <p className="document-preview__note">
                  {t("doc.previewStale")}
                </p>
              )}
              <FrameView
                key={updatedAt}
                src={handoutPreviewUrl("document", id)}
                title={title}
                // コードブロックの「コピー」を押せる
                interactive
              />
            </>
          )}
        </div>
        <DocumentSidePanel
          document={document}
          id={id}
          compare={compare}
          onCompare={setCompare}
          selection={state.selection}
          sideWidth={sideWidth}
          open={sideOpen}
          onOpenChange={changeSideOpen}
          sideWidthMin={SIDE_WIDTH_MIN}
          sideWidthMax={SIDE_WIDTH_MAX}
          onSideWidthChange={changeSideWidth}
          onEdit={edit}
        />
      </div>

      <DocumentHistoryDialog
        open={historyOpen}
        id={id}
        dirty={dirty}
        onClose={() => setHistoryOpen(false)}
        onRestored={(restored) =>
          dispatch({ type: "reload", document: restored })
        }
      />
    </div>
  );
};

// 資料の題とテンプレートは meta.json が正なので、画面は概要と中身の両方を読む
export const DocumentEditorLoader = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const detail = useQuery(handoutQuery("document", id));
  const document = useQuery(documentQuery(id));

  if (detail.isPending || document.isPending) {
    return <p className="state-message">{t("common.loading")}</p>;
  }
  const error = detail.error?.message ?? document.error?.message;
  if (error) {
    return (
      <div className="state-message state-message--error viewer__message">
        <pre className="state-message__detail">{error}</pre>
      </div>
    );
  }
  if (!detail.data || !document.data) return null;
  return (
    <DocumentEditor
      key={id}
      id={id}
      title={detail.data.title}
      template={detail.data.template}
      updatedAt={detail.data.updatedAt}
      serverDocument={document.data}
      shareUrl={detail.data.shareUrl ?? null}
    />
  );
};
