import { useQuery } from "@tanstack/react-query";
import { Play, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  agentRunQuery,
  agentsQuery,
  useCancelAgentRun,
  useStartAgentRun,
} from "../../api/queries";
import type { AgentId, AgentRunStatus, AiRequestDetail } from "../../api/types";
import { useLanguage } from "../../i18n/language";

const POLL_INTERVAL_MS = 3000;

const isTerminal = (state: AgentRunStatus["state"]): boolean =>
  state === "done" || state === "failed" || state === "cancelled";

const formatElapsed = (startedAt: string, tick: number): string => {
  const seconds = Math.max(
    0,
    Math.floor((tick - Date.parse(startedAt)) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

// AI パネルからのエージェント起動(試作)。手動コマンドの代わりにサーバーが起動する
export const AgentRunControl = ({
  deckId,
  request,
  targetLabel,
}: {
  deckId: string;
  request: AiRequestDetail;
  targetLabel: string;
}) => {
  const [chosen, setChosen] = useState<AgentId>();
  const [runId, setRunId] = useState<string>();
  const [tick, setTick] = useState(() => Date.now());
  const { t } = useLanguage();
  const startRun = useStartAgentRun(deckId, request.requestId);
  const cancelRun = useCancelAgentRun(deckId, request.requestId);

  const run = useQuery({
    ...agentRunQuery(deckId, request.requestId, runId ?? ""),
    enabled: runId !== undefined,
    refetchInterval: (query) =>
      query.state.data && isTerminal(query.state.data.state)
        ? false
        : POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const installed = useQuery(agentsQuery).data;
  const agents = installed ?? [];
  const agent = agents.find(({ id }) => id === chosen)?.id ?? agents[0]?.id;

  const status = run.data;
  const active = status !== undefined && !isTerminal(status.state);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const start = (next: AgentId) => {
    setChosen(next);
    startRun.mutate(next, {
      onSuccess: (result) => setRunId(result.runId),
    });
  };

  // 1つも無いときの案内は、同じ画面にある CommandBox が出す。ここで出すと2行になる
  if (installed === undefined || agent === undefined) return null;

  return (
    <div className="ai-run">
      <fieldset className="chips">
        <legend className="visually-hidden">{t("run.agentLegend")}</legend>
        {agents.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={agent === id}
            disabled={active || startRun.isPending}
            onClick={() => setChosen(id)}
          >
            {label}
          </button>
        ))}
      </fieldset>

      {status === undefined && (
        <>
          <p className="prop-panel__hint">
            {t("run.confirmBefore", { target: targetLabel })}
            <code>{request.patchPath}</code>
            {t("run.confirmAfter")}
          </p>
          <pre className="command-box__code">
            <code>{request.commands[agent]}</code>
          </pre>
          {startRun.isError && (
            <p className="form-error" role="alert">
              {startRun.error.message}
            </p>
          )}
          <button
            type="button"
            className="button button--primary button--block"
            disabled={startRun.isPending}
            onClick={() => start(agent)}
          >
            <Play size={18} aria-hidden />
            {startRun.isPending ? t("run.starting") : t("run.launch")}
          </button>
        </>
      )}

      {status !== undefined && !isTerminal(status.state) && (
        <div role="status" className="ai-run__active">
          <p className="generation__waiting">
            <span className="spinner" aria-hidden />
            {t("run.running", {
              time: formatElapsed(status.startedAt, tick),
            })}
          </p>
          <pre className="command-box__code">
            <code>{status.command}</code>
          </pre>
          <button
            type="button"
            className="button button--secondary button--block"
            disabled={cancelRun.isPending}
            onClick={() => cancelRun.mutate(status.runId)}
          >
            <Square size={18} aria-hidden />
            {cancelRun.isPending ? t("run.stopping") : t("run.stop")}
          </button>
        </div>
      )}

      {status !== undefined && isTerminal(status.state) && (
        <div
          className={
            status.state === "done"
              ? "generation__ok"
              : "state-message state-message--error"
          }
          role="status"
        >
          {status.state === "done" && <p>{t("run.done")}</p>}
          {status.state !== "done" && (
            <>
              <TriangleAlert size={20} aria-hidden />
              <p>
                {status.state === "cancelled"
                  ? t("run.cancelled")
                  : (status.message ?? t("run.failed"))}
              </p>
              {status.logTail && (
                <pre className="state-message__detail">{status.logTail}</pre>
              )}
            </>
          )}
          <button
            type="button"
            className="button button--secondary button--block"
            disabled={startRun.isPending}
            onClick={() => start(agent)}
          >
            <RotateCcw size={18} aria-hidden />
            {t("run.retry")}
          </button>
        </div>
      )}
    </div>
  );
};
