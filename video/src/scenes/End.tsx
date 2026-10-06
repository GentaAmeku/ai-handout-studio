import {
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DESK_PLACEMENT, Desk, Window } from "../Desk";
import { Terminal } from "../Terminal";
import { color, font } from "../theme";
import type { Captions, Lang } from "../timeline";

// 場面 8: 一覧の全景が遠のき、名前と「2 行で始める」が出る
export const End = ({
  captions,
  lang,
}: {
  captions: Captions["end"];
  lang: Lang;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const away = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const title = spring({ frame: frame - 26, fps, config: { damping: 14 } });
  const line = spring({ frame: frame - 44, fps, config: { damping: 16 } });
  const code = spring({ frame: frame - 58, fps, config: { damping: 18 } });
  return (
    <Desk>
      <Window
        placement={DESK_PLACEMENT}
        style={{
          opacity: 1 - away,
          transform: `translateY(${-away * 80}px) scale(${1 - away * 0.25})`,
          transformOrigin: "center top",
        }}
      >
        <OffthreadVideo
          src={staticFile("clips/list.mp4")}
          muted
          playbackRate={0.8}
          style={{ width: 1280, height: 720 }}
        />
      </Window>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 150,
          textAlign: "center",
          fontFamily: font(lang),
          color: color.heading,
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            opacity: title,
            transform: `scale(${0.9 + 0.1 * title})`,
          }}
        >
          {captions.title}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 32,
            color: color.muted,
            opacity: line,
            transform: `translateY(${(1 - line) * 12}px)`,
          }}
        >
          {captions.line}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 380,
          opacity: code,
          transform: `translateY(${(1 - code) * 24}px)`,
        }}
      >
        <Terminal
          width={1040}
          height={190}
          fontSize={22}
          cwd="~"
          lines={captions.code.map((text, index) => ({
            text,
            from: 62 + index * 22,
            kind: "prompt" as const,
          }))}
        />
      </div>
    </Desk>
  );
};
