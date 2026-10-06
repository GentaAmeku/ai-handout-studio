import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, FPS, font } from "./theme";
import {
  type Captions,
  CLIP_USE,
  type Clips,
  GIF_OFFSET,
  GIF_RATE,
  type Lang,
} from "./timeline";

export type SwitchProps = { lang: Lang; captions: Captions; clips: Clips };

// GIF 用: 場面 6 の録画を画面いっぱいに出し、上に字幕の帯を置く(README で自動再生される 5 秒)。
// 帯は上の帯(書き出しのボタン)に重ねる。下に置くと、テンプレートの窓の札と閉じるボタンを隠す
export const Switch = ({ lang, captions }: SwitchProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const use = CLIP_USE.switch;
  const rise = spring({ frame: frame - 4, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <Sequence from={0}>
        <OffthreadVideo
          src={staticFile("clips/switch.mp4")}
          trimBefore={Math.round((use.trim + GIF_OFFSET * GIF_RATE) * FPS)}
          playbackRate={GIF_RATE}
          muted
          style={{ width: 1280, height: 720 }}
        />
      </Sequence>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 64,
          display: "flex",
          justifyContent: "center",
          opacity: rise,
          transform: `translateY(${(1 - rise) * 16}px)`,
        }}
      >
        <div
          style={{
            padding: "10px 26px",
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.82)",
            color: color.onPrimary,
            fontFamily: font(lang),
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {captions.switch.heading}
        </div>
      </div>
    </AbsoluteFill>
  );
};
