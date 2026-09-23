import { useQuery } from "@tanstack/react-query";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { aiPatchQuery, useCreateAiRequest } from "../../api/queries";
import type { AiRequestDetail } from "../../api/types";
import { applyPatches } from "../../editor/patch";
import type { EditorAction } from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import type { Deck, Slide } from "../../schema/deck";
import { AgentRunControl } from "./AgentRunControl";
import { CommandBox } from "./CommandBox";

// AI の編集案。指示文と現行 JSON を渡し、案を見てから反映する
const scopes = [
  { id: "slide", labelKey: "ai.scopeSlide" },
  { id: "deck", labelKey: "ai.scopeDeck" },
] as const;

type Scope = (typeof scopes)[number]["id"];

const quickKeys = [
  "ai.quickShort",
  "ai.quickVisual",
  "ai.quickLayout",
] as const;

const INSTRUCTION_LIMIT = 500;
const POLL_INTERVAL_MS = 3000;

export const AiPanel = ({
  deck,
  deckId,
  slide,
  onEdit,
}: {
  deck: Deck;
  deckId: string;
  slide: Slide;
  onEdit: (action: EditorAction) => void;
}) => {
  const [scope, setScope] = useState<Scope>("slide");
  const [instruction, setInstruction] = useState("");
  const [request, setRequest] = useState<AiRequestDetail>();
  const [sentJson, setSentJson] = useState("");
  const [applyError, setApplyError] = useState<string>();
  const { t } = useLanguage();
  const createRequest = useCreateAiRequest(deckId);

  const target = scope === "slide" ? slide : deck;
  const targetJson = JSON.stringify(target);

  const patch = useQuery({
    ...aiPatchQuery(deckId, request?.requestId ?? ""),
    enabled: request !== undefined,
    refetchInterval: (query) =>
      query.state.data?.state === "ready" ? false : POLL_INTERVAL_MS,
    // エージェントを動かす間この画面は背面になるので、背面でも確認を続ける
    refetchIntervalInBackground: true,
  });

  const submit = () => {
    setApplyError(undefined);
    createRequest.mutate(
      {
        scope,
        ...(scope === "slide" ? { slideId: slide.id } : {}),
        instruction,
        target,
      },
      {
        onSuccess: (detail) => {
          setRequest(detail);
          setSentJson(targetJson);
        },
      },
    );
  };

  const apply = () => {
    if (patch.data?.state !== "ready") return;
    const result = applyPatches(deck, patch.data.patches);
    if (!result.success) {
      setApplyError(result.message);
      return;
    }
    setApplyError(undefined);
    setRequest(undefined);
    setInstruction("");
    onEdit({
      type: "edit",
      deck: result.deck,
      selection: { slideId: result.slideIds[0] ?? slide.id },
    });
  };

  return (
    <div className="ai-panel">
      <h3 className="ai-panel__title">{t("ai.title")}</h3>
      <p className="prop-panel__hint">{t("ai.lead")}</p>

      <label className="prop-field">
        <span className="prop-field__label">{t("ai.scope")}</span>
        <select
          className="input"
          value={scope}
          onChange={(event) => setScope(event.currentTarget.value as Scope)}
        >
          {scopes.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.labelKey)}
              {item.id === "slide" ? `(${slide.id})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="prop-field">
        <span className="prop-field__label">{t("ai.instruction")}</span>
        <textarea
          className="textarea"
          rows={4}
          maxLength={INSTRUCTION_LIMIT}
          value={instruction}
          placeholder={t("ai.instructionPlaceholder")}
          onChange={(event) => setInstruction(event.currentTarget.value)}
        />
        <span className="prop-field__hint">
          {instruction.length}/{INSTRUCTION_LIMIT}
        </span>
      </label>

      <div className="chips">
        {quickKeys.map((key) => (
          <button
            key={key}
            type="button"
            className="chip"
            onClick={() =>
              setInstruction((current) =>
                current === "" ? t(key) : `${current}\n${t(key)}`,
              )
            }
          >
            {t(key)}
          </button>
        ))}
      </div>

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
        {createRequest.isPending ? t("ai.creating") : t("ai.create")}
      </button>

      {request && (
        <section className="ai-panel__handoff">
          <p className="prop-panel__hint">
            {t("ai.handoffBefore")}
            <code>{request.patchPath}</code>
            {t("ai.handoffAfter")}
          </p>
          <AgentRunControl
            deckId={deckId}
            request={request}
            targetLabel={
              scope === "slide"
                ? t("run.targetSlide", { id: slide.id })
                : t("run.targetDeck")
            }
          />
          <CommandBox commands={request.commands} />

          {patch.data?.state === "none" && (
            <p className="generation__waiting" role="status">
              <span className="spinner" aria-hidden />
              {t("ai.waiting")}
            </p>
          )}
          {patch.data?.state === "invalid" && (
            <div className="state-message state-message--error" role="status">
              <TriangleAlert size={20} aria-hidden />
              <p>{t("ai.invalid")}</p>
              <pre className="state-message__detail">{patch.data.message}</pre>
            </div>
          )}
          {patch.data?.state === "ready" && (
            <div className="ai-panel__result">
              <p className="generation__ok" role="status">
                {t("ai.ready", {
                  slides: patch.data.patches
                    .map((item) => item.slideId)
                    .join(", "),
                })}
              </p>
              {sentJson !== targetJson && (
                <p className="form-error">{t("ai.changedWarn")}</p>
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
                {t("ai.apply")}
              </button>
              <p className="prop-panel__hint">{t("ai.noSaveNote")}</p>
            </div>
          )}
          <button
            type="button"
            className="button button--secondary button--block"
            onClick={() => setRequest(undefined)}
          >
            {t("ai.cancelRequest")}
          </button>
        </section>
      )}
    </div>
  );
};
