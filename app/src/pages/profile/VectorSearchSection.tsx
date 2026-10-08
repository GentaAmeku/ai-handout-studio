import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { startVectorIndex, vectorStatusQuery } from "../../api/queries";
import type { VectorStatus } from "../../api/types";
import { copyToClipboard } from "../../components/copy-text";
import type { MessageKey } from "../../i18n/ja";
import { useLanguage } from "../../i18n/language";

// 設定の画面の「ベクトル検索」(180。方式は docs/plans/content-search.md §5.1)。
// 状態の印と、有効でなければその場で次の一手(コマンドとコピー)を出す

type Tone = "ok" | "busy" | "warn" | "off";

type StateView = {
  tone: Tone;
  label: MessageKey;
  detail: string;
  meta?: string;
  command?: string;
};

const COPIED_FEEDBACK_MS = 2000;

const pullCommand = (model: string): string => `ollama pull ${model}`;

const viewOf = (
  status: VectorStatus,
  t: ReturnType<typeof useLanguage>["t"],
): StateView => {
  if (status.state === "ready" || status.state === "indexing") {
    const meta = `${status.model} ・ Ollama ${status.ollamaVersion}`;
    return status.state === "ready"
      ? {
          tone: "ok",
          label: "vector.state.ready",
          detail: t("vector.ready.detail", { indexed: status.indexed }),
          meta,
        }
      : {
          tone: "busy",
          label: "vector.state.indexing",
          detail: t("vector.indexing.detail", {
            indexed: status.indexed,
            total: status.total,
          }),
          meta,
        };
  }
  if (status.state === "no-model") {
    return {
      tone: "warn",
      label: "vector.state.noModel",
      detail: t("vector.noModel.detail", { version: status.ollamaVersion }),
      command: pullCommand(status.pull),
    };
  }
  if (status.state === "outdated") {
    return {
      tone: "warn",
      label: "vector.state.outdated",
      detail: t("vector.outdated.detail", {
        version: status.ollamaVersion,
        min: status.minVersion,
      }),
      command: pullCommand(status.pull),
    };
  }
  if (status.state === "no-ollama") {
    return {
      tone: "warn",
      label: "vector.state.noOllama",
      detail: t("vector.noOllama.detail", { min: status.minVersion }),
      command: pullCommand(status.pull),
    };
  }
  return {
    tone: "off",
    label: "vector.state.off",
    detail: t("vector.off.detail"),
    command: "ai-handout-studio settings --set features.vectorSearch=true",
  };
};

const CopyCommand = ({ command }: { command: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const outcome = await copyToClipboard(command);
    if (outcome === "manual") return;
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };
  return (
    <div className="command-box">
      <pre className="command-box__code">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => void copy()}
      >
        {copied ? (
          <Check size={18} aria-hidden />
        ) : (
          <Copy size={18} aria-hidden />
        )}
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  );
};

export const VectorSearchSection = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const status = useQuery(vectorStatusQuery);

  // 画面が出たら、足りない区切りのベクトルを作り始めてもらう(サーバーへの依頼。結果は状態に映す)
  useEffect(() => {
    void startVectorIndex().then((next) => {
      if (next) queryClient.setQueryData(vectorStatusQuery.queryKey, next);
    });
  }, [queryClient]);

  const view = status.data ? viewOf(status.data, t) : undefined;
  return (
    <section
      className="prose-section vector-search"
      aria-labelledby="vector-search-title"
    >
      <h2 id="vector-search-title">
        {t("vector.title")}
        <span className="vector-search__optional">{t("vector.optional")}</span>
      </h2>
      <p className="prop-field__hint">{t("vector.lead")}</p>
      {status.isPending && <p>{t("common.loading")}</p>}
      {status.isError && (
        <p className="state-message--error">{status.error.message}</p>
      )}
      {view && (
        <>
          <p className="vector-search__state">
            <span
              className={`status-dot status-dot--${view.tone}`}
              aria-hidden
            />
            {t(view.label)}
          </p>
          <p>{view.detail}</p>
          {view.meta && <p className="prop-field__hint">{view.meta}</p>}
          {view.command && <CopyCommand command={view.command} />}
        </>
      )}
      <p className="prop-field__hint vector-search__fallback">
        {t("vector.fallback")}
      </p>
    </section>
  );
};
