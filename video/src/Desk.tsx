import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, font, HEIGHT, WIDTH } from "./theme";
import type { Lang, Rect } from "./timeline";

// 様式 A: 白と薄い青の机。上に大きな見出し、その下に録画を角丸・影つきの窓として置く
export const Desk = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(165deg, ${color.bg} 0%, ${color.surface} 55%, ${color.tint} 100%)`,
    }}
  >
    <div
      style={{
        position: "absolute",
        right: -220,
        top: -260,
        width: 720,
        height: 720,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color.tint} 0%, rgba(219, 234, 254, 0) 70%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

// 大きな見出し。下から出て、場面の終わりまで残る
export const Heading = ({
  text,
  lang,
  delay = 0,
}: {
  text: string;
  lang: Lang;
  delay?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 72,
        right: 72,
        top: 44,
        fontFamily: font(lang),
        fontSize: lang === "ja" ? 38 : 40,
        fontWeight: 700,
        letterSpacing: lang === "ja" ? "0" : "-0.015em",
        lineHeight: 1.25,
        color: color.heading,
        opacity: rise,
        transform: `translateY(${(1 - rise) * 24}px)`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

// 場面の途中で見出しを替える。from のコマから次の見出しが下から出る(前のは消える)
export type HeadingAt = { text: string; from: number };
export const Headings = ({
  items,
  lang,
}: {
  items: HeadingAt[];
  lang: Lang;
}) => {
  const frame = useCurrentFrame();
  const current = items
    .filter((item) => item.from <= frame)
    .sort((a, b) => a.from - b.from)
    .at(-1);
  if (!current) return null;
  return (
    <Heading
      key={current.from}
      text={current.text}
      lang={lang}
      delay={current.from}
    />
  );
};

// 録画の窓の置き方。1280x720 の録画を scale 倍にして、x, y に置く(上に 26px の枠)
export type Placement = { x: number; y: number; scale: number; chrome: number };
export const DESK_PLACEMENT: Placement = {
  x: 160,
  y: 118,
  scale: 0.75,
  chrome: 26,
};
export const FULL_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, chrome: 0 };

// 録画の座標を、画面の座標に直す
export const project = (placement: Placement, rect: Rect): Rect => ({
  x: placement.x + rect.x * placement.scale,
  y: placement.y + placement.chrome + rect.y * placement.scale,
  width: rect.width * placement.scale,
  height: rect.height * placement.scale,
});

export const Window = ({
  placement,
  children,
  delay = 0,
  style,
}: {
  placement: Placement;
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  const width = WIDTH * placement.scale;
  const height = HEIGHT * placement.scale;
  return (
    <div
      style={{
        position: "absolute",
        left: placement.x,
        top: placement.y,
        width,
        height: height + placement.chrome,
        borderRadius: placement.chrome ? 14 : 0,
        overflow: "hidden",
        background: color.bg,
        boxShadow: placement.chrome
          ? "0 24px 60px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(226, 232, 240, 1)"
          : "none",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
        ...style,
      }}
    >
      {placement.chrome > 0 && (
        <div
          style={{
            height: placement.chrome,
            background: color.surface,
            borderBottom: `1px solid ${color.border}`,
            display: "flex",
            alignItems: "center",
            gap: 7,
            paddingLeft: 12,
          }}
        >
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color.border,
              }}
            />
          ))}
        </div>
      )}
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          transform: `scale(${placement.scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
};

// 吹き出し: 画面の要素(録画の座標)に向けて、青いラベルと細い線、要素を囲む輪を出す
export const Callout = ({
  placement,
  target,
  label,
  lang,
  from,
  frames = 48,
  dx = 40,
  dy = -56,
}: {
  placement: Placement;
  target: Rect;
  label: string;
  lang: Lang;
  from: number;
  frames?: number;
  dx?: number;
  dy?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local > frames) return null;
  const rect = project(placement, target);
  const pop = spring({
    frame: local,
    fps,
    config: { damping: 12, stiffness: 160 },
  });
  const fade = interpolate(local, [frames - 10, frames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const pad = 8;
  const ring = {
    left: rect.x - pad,
    top: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const pulse = 1 + 0.04 * Math.sin((local / fps) * Math.PI * 3);
  // ラベルは要素の右上(dx, dy)に置き、画面からはみ出すなら左へ寄せる
  const labelX = Math.min(cx + dx, WIDTH - 60);
  const labelY = Math.max(cy + dy, 16);
  const anchorY = labelY + 20;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: fade,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          ...ring,
          borderRadius: 10,
          border: `3px solid ${color.primary}`,
          boxShadow: `0 0 0 6px rgba(59, 130, 246, 0.18)`,
          transform: `scale(${pop * pulse})`,
          opacity: pop,
        }}
      />
      <svg
        width={WIDTH}
        height={HEIGHT}
        style={{ position: "absolute", left: 0, top: 0, opacity: pop }}
      >
        <title>pointer</title>
        <line
          x1={labelX - (dx < 0 ? 0 : 6)}
          y1={anchorY}
          x2={cx + (dx < 0 ? -rect.width / 2 : rect.width / 2)}
          y2={cy}
          stroke={color.primary}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: labelX,
          top: labelY,
          transform: `translate(${dx < 0 ? "-100%" : "0"}, 0) scale(${pop})`,
          transformOrigin: dx < 0 ? "right center" : "left center",
          padding: "8px 18px",
          borderRadius: 999,
          background: color.primary,
          color: color.onPrimary,
          fontFamily: font(lang),
          fontSize: 22,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 20px rgba(37, 99, 235, 0.3)",
        }}
      >
        {label}
      </div>
    </div>
  );
};

// 場面の最後の 10 コマで全体を少し沈める(つなぎの前)
export const easeOut = (frame: number, end: number) =>
  interpolate(frame, [end - 10, end], [1, 0.96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
