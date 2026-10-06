import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Desk, Heading } from "../Desk";
import { color, font, mono } from "../theme";
import type { Captions, Lang } from "../timeline";

// 場面 1: 会話のフォルダごとに HTML・PPTX・PDF が散らばる
const kindColor = (name: string) =>
  name.endsWith(".pptx")
    ? color.accent3
    : name.endsWith(".pdf")
      ? color.danger
      : color.primary;

// 置き場所と傾きは決め打ち(毎回同じ絵になる)
const SPOTS = [
  { x: 150, y: 250, r: -9 },
  { x: 330, y: 330, r: 7 },
  { x: 560, y: 240, r: -4 },
  { x: 720, y: 360, r: 11 },
  { x: 930, y: 260, r: -7 },
  { x: 1060, y: 380, r: 5 },
  { x: 420, y: 470, r: -12 },
];
const FOLDERS = [
  { x: 120, y: 560 },
  { x: 540, y: 580 },
  { x: 940, y: 560 },
];

export const Scatter = ({
  captions,
  lang,
}: {
  captions: Captions["scatter"];
  lang: Lang;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Desk>
      {FOLDERS.map((folder, index) => {
        const rise = spring({
          frame: frame - index * 4,
          fps,
          config: { damping: 16 },
        });
        return (
          <div
            key={folder.x}
            style={{
              position: "absolute",
              left: folder.x,
              top: folder.y,
              opacity: rise,
              transform: `translateY(${(1 - rise) * 20}px)`,
            }}
          >
            <div
              style={{
                width: 70,
                height: 14,
                borderRadius: "6px 6px 0 0",
                background: color.tint,
                marginLeft: 0,
              }}
            />
            <div
              style={{
                width: 200,
                height: 70,
                borderRadius: "0 8px 8px 8px",
                background: color.tint,
                border: `2px solid ${color.border}`,
              }}
            />
            <div
              style={{
                marginTop: 8,
                fontFamily: mono,
                fontSize: 15,
                color: color.muted,
              }}
            >
              {captions.folders[index]}
            </div>
          </div>
        );
      })}
      {captions.files.map((name, index) => {
        const spot = SPOTS[index];
        const start = 12 + index * 6;
        const fall = spring({
          frame: frame - start,
          fps,
          config: { damping: 11, stiffness: 120 },
        });
        const y = interpolate(fall, [0, 1], [-160, spot.y]);
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: spot.x,
              top: y,
              width: 150,
              height: 104,
              borderRadius: 10,
              background: color.bg,
              border: `1px solid ${color.border}`,
              boxShadow: "0 14px 30px rgba(15, 23, 42, 0.14)",
              transform: `rotate(${spot.r * fall}deg)`,
              opacity: fall,
              overflow: "hidden",
              fontFamily: font(lang),
            }}
          >
            <div style={{ height: 10, background: kindColor(name) }} />
            <div style={{ padding: "12px 12px 0" }}>
              {[70, 110, 90].map((w) => (
                <div
                  key={w}
                  style={{
                    width: w,
                    height: 7,
                    borderRadius: 4,
                    background: color.chip,
                    marginBottom: 7,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 10,
                fontFamily: mono,
                fontSize: 14,
                color: color.text,
              }}
            >
              {name}
            </div>
          </div>
        );
      })}
      <Heading text={captions.heading} lang={lang} delay={8} />
      <AbsoluteFill style={{ pointerEvents: "none" }} />
    </Desk>
  );
};
