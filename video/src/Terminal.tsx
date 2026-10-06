import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { color, mono } from "./theme";

// ターミナル風の窓。行ごとに「何コマ目から」「打って見せるか」を決める
export type Line = {
  text: string;
  from: number;
  // 1 コマに何文字進めるか。0 なら一度に出す
  cps?: number;
  kind?: "prompt" | "plain" | "ok" | "muted" | "reply";
};

const tone = (kind: Line["kind"]) =>
  kind === "ok"
    ? "#86efac"
    : kind === "muted"
      ? "#94a3b8"
      : kind === "reply"
        ? "#bfdbfe"
        : "#f8fafc";

export const Terminal = ({
  lines,
  width,
  height,
  cwd,
  style,
  fontSize = 22,
}: {
  lines: Line[];
  width: number;
  height: number;
  cwd?: string;
  style?: CSSProperties;
  fontSize?: number;
}) => {
  const frame = useCurrentFrame();
  const shown = lines
    .filter((line) => frame >= line.from)
    .map((line) => {
      const typed = line.cps
        ? Math.min(line.text.length, Math.floor((frame - line.from) * line.cps))
        : line.text.length;
      return {
        ...line,
        visible: line.text.slice(0, typed),
        done: typed >= line.text.length,
      };
    });
  const last = shown[shown.length - 1];
  const caretOn = frame % 16 < 9;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        background: "#0f172a",
        boxShadow:
          "0 24px 60px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.5)",
        overflow: "hidden",
        fontFamily: mono,
        fontSize,
        lineHeight: 1.55,
        color: "#f8fafc",
        ...style,
      }}
    >
      <div
        style={{
          height: 34,
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 14,
          background: "#1e293b",
          color: "#94a3b8",
          fontSize: 14,
        }}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: "#334155",
            }}
          />
        ))}
        <span style={{ marginLeft: 10 }}>{cwd}</span>
      </div>
      <div
        style={{
          padding: "18px 22px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {shown.map((line) => (
          <div
            key={`${line.from}-${line.text}`}
            style={{
              color: tone(line.kind),
              opacity: line.cps
                ? 1
                : interpolate(frame - line.from, [0, 6], [0, 1], {
                    extrapolateRight: "clamp",
                  }),
            }}
          >
            {line.kind === "prompt" && (
              <span style={{ color: color.primary }}>{"> "}</span>
            )}
            {line.visible}
            {line === last && (!line.done || line.kind === "prompt") && (
              <span style={{ opacity: caretOn ? 1 : 0, color: color.primary }}>
                ▍
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
