import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { AgentCommands, AgentId } from "../../api/types";
import { useLanguage } from "../../i18n/language";

type Agent = AgentId;

const agents: readonly { id: Agent; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "grok", label: "Grok" },
];

const COPIED_FEEDBACK_MS = 2000;

// エージェントへ渡すコマンド。手元で実行してもらう
export const CommandBox = ({
  commands,
  agent: controlledAgent,
  onSelect,
}: {
  commands: AgentCommands;
  agent?: Agent;
  onSelect?: (agent: Agent) => void;
}) => {
  const [innerAgent, setInnerAgent] = useState<Agent>("claude");
  const { t } = useLanguage();
  const agent = controlledAgent ?? innerAgent;
  const select = (next: Agent) => {
    setInnerAgent(next);
    onSelect?.(next);
  };
  const [copied, setCopied] = useState(false);
  const command = commands[agent];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="command-box">
      <fieldset className="chips">
        <legend className="visually-hidden">
          {t("commandBox.agentLegend")}
        </legend>
        {agents.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={agent === id}
            onClick={() => {
              select(id);
              setCopied(false);
            }}
          >
            {label}
          </button>
        ))}
      </fieldset>
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
