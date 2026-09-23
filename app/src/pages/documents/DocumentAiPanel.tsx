import { useQuery } from "@tanstack/react-query";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  documentAiPatchQuery,
  useCreateDocumentAiRequest,
} from "../../api/queries";
import type { AiRequestDetail } from "../../api/types";
import { applyDocumentPatch } from "../../editor/document-patch";
import type {
  DocumentEditorAction,
  DocumentSelection,
} from "../../editor/document-state";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import { CommandBox } from "../editor/CommandBox";

// 文書の AI の編集案。スライドの AiPanel と同じ流儀で、依頼を出す・結果を見る・取り込むの3つだけ。
// 見比べは中央のプレビューが担うので、ここは元と案の切り替えだけを持つ

const INSTRUCTION_LIMIT = 500;
const POLL_INTERVAL_MS = 3000;

export type DocumentCompare = { requestId: string; view: "before" | "after" };

const sectionOf = (selection: DocumentSelection): string | undefined =>
  selection.kind === "front" ? undefined : selection.sectionId;

export const DocumentAiPanel = ({
  document: doc,
  id,
  selection,
  compare,
  onCompare,
  onEdit,
}: {
  document: DocumentFile;
  id: string;
  selection: DocumentSelection;
  compare: DocumentCompare | undefined;
  onCompare: (compare: DocumentCompare | undefined) => void;
  onEdit: (action: DocumentEditorAction) => void;
}) => {
  const [instruction, setInstruction] = useState("");
  const [request, setRequest] = useState<
    AiRequestDetail & { sectionId: string; sentJson: string }
  >();
  const [applyError, setApplyError] = useState<string>();
  const { t } = useLanguage();
  const createRequest = useCreateDocumentAiRequest(id);

  // 依頼を出したあとは、そのセクションに固定する。選択が動いても案の行き先は変わらない
  const sectionId = request?.sectionId ?? sectionOf(selection);
  const section = doc.sections.find((item) => item.id === sectionId);

  const patch = useQuery({
    ...documentAiPatchQuery(id, request?.requestId ?? ""),
    enabled: request !== undefined,
    refetchInterval: (query) =>
      query.state.data?.state === "ready" ? false : POLL_INTERVAL_MS,
    // エージェントを動かす間この画面は背面になるので、背面でも確認を続ける
    refetchIntervalInBackground: true,
  });

  const drop = () => {
    setRequest(undefined);
    setApplyError(undefined);
    onCompare(undefined);
  };

  const submit = () => {
    if (!section) return;
    setApplyError(undefined);
    createRequest.mutate(
      { sectionId: section.id, instruction, target: doc },
      {
        onSuccess: (detail) => {
          setRequest({
            ...detail,
            sectionId: section.id,
            sentJson: JSON.stringify(section),
          });
          onCompare(undefined);
        },
      },
    );
  };

  const apply = () => {
    if (patch.data?.state !== "ready") return;
    const result = applyDocumentPatch(doc, patch.data.patch);
    if (!result.success) {
      setApplyError(result.message);
      return;
    }
    onEdit({
      type: "edit",
      document: result.document,
      selection: { kind: "section", sectionId: result.sectionId },
    });
    setInstruction("");
    drop();
  };

  if (!request && !section) {
    return <p className="prop-panel__hint">{t("docai.needSection")}</p>;
  }

  return (
    <div className="ai-panel">
      <p className="prop-panel__hint">{t("docai.lead")}</p>

      <p className="prop-field">
        <span className="prop-field__label">{t("docai.target")}</span>
        <span>{section?.heading || sectionId}</span>
      </p>

      {!request && (
        <>
          <label className="prop-field">
            <span className="prop-field__label">{t("docai.instruction")}</span>
            <textarea
              className="textarea"
              rows={4}
              maxLength={INSTRUCTION_LIMIT}
              value={instruction}
              placeholder={t("docai.instructionPlaceholder")}
              onChange={(event) => setInstruction(event.currentTarget.value)}
            />
            <span className="prop-field__hint">
              {instruction.length}/{INSTRUCTION_LIMIT}
            </span>
          </label>

          {createRequest.isError && (
            <p className="form-error" role="alert">
              {createRequest.error.message}
            </p>
          )}

          <button
            type="button"
            className="button button--primary button--block"
            disabled={instruction.trim() === "" || createRequest.isPending}
            onClick={submit}
          >
            <Sparkles size={18} aria-hidden />
            {createRequest.isPending ? t("docai.creating") : t("docai.create")}
          </button>
        </>
      )}

      {request && (
        <section className="ai-panel__handoff">
          <p className="prop-panel__hint">
            {t("docai.handoffBefore")}
            <code>{request.patchPath}</code>
            {t("docai.handoffAfter")}
          </p>
          <CommandBox commands={request.commands} />

          {patch.data?.state === "none" && (
            <p className="generation__waiting" role="status">
              <span className="spinner" aria-hidden />
              {t("docai.waiting")}
            </p>
          )}
          {patch.data?.state === "invalid" && (
            <div className="state-message state-message--error" role="status">
              <TriangleAlert size={20} aria-hidden />
              <p>{t("docai.invalid")}</p>
              <pre className="state-message__detail">{patch.data.message}</pre>
            </div>
          )}
          {patch.data?.state === "ready" && (
            <div className="ai-panel__result">
              <p className="generation__ok" role="status">
                {t("docai.ready", { section: request.sectionId })}
              </p>
              <div className="chips">
                {(["before", "after"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className="chip"
                    aria-pressed={compare?.view === view}
                    onClick={() =>
                      onCompare({ requestId: request.requestId, view })
                    }
                  >
                    {t(
                      view === "before"
                        ? "docai.viewBefore"
                        : "docai.viewAfter",
                    )}
                  </button>
                ))}
              </div>
              {section && JSON.stringify(section) !== request.sentJson && (
                <p className="form-error">{t("docai.changedWarn")}</p>
              )}
              {applyError && (
                <pre className="state-message__detail" role="alert">
                  {applyError}
                </pre>
              )}
              <button
                type="button"
                className="button button--primary button--block"
                onClick={apply}
              >
                {t("docai.apply")}
              </button>
              <p className="prop-panel__hint">{t("docai.applyNote")}</p>
            </div>
          )}
          <button
            type="button"
            className="button button--secondary button--block"
            onClick={drop}
          >
            {t("docai.cancel")}
          </button>
        </section>
      )}
    </div>
  );
};
