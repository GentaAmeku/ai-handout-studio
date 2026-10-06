import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Terminal } from "../Terminal";
import { color, font } from "../theme";
import {
  type Captions,
  CLIP_USE,
  type ClipMeta,
  clipFrames,
  type Lang,
} from "../timeline";
import { Screen } from "./Screen";

// 場面 3: 質問票で見比べて答え、回答をコピーし、端末に Markdown が貼られる
export const Sheet = ({
  captions,
  lang,
  clip,
}: {
  captions: Captions["sheet"];
  lang: Lang;
  clip: ClipMeta;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const use = CLIP_USE.sheet;
  // 録画が終わる 1 秒前から、端末が右から滑り込む
  const pasteAt = clipFrames(use, clip) - 30;
  const slide = spring({
    frame: frame - pasteAt,
    fps,
    config: { damping: 18 },
  });
  return (
    <Screen
      heading={captions.heading}
      lang={lang}
      use={use}
      clip={clip}
      callouts={[
        {
          target: "choose B",
          event: "choose B",
          label: captions.callouts["choose B"],
          dx: 60,
          dy: -50,
        },
        {
          target: "copy",
          event: "copy",
          label: captions.callouts.copy,
          dx: -40,
          dy: -70,
          frames: 40,
        },
      ]}
    >
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 190,
          opacity: slide,
          transform: `translateX(${(1 - slide) * 300}px)`,
        }}
      >
        <div
          style={{
            marginBottom: 10,
            fontFamily: font(lang),
            fontSize: 20,
            fontWeight: 700,
            color: color.primaryStrong,
          }}
        >
          {captions.pasteTitle}
        </div>
        <Terminal
          width={660}
          height={330}
          fontSize={17}
          cwd="~/projects/intranet"
          lines={[
            ...captions.paste.map((text, index) => ({
              text,
              from: pasteAt + 10 + index * 5,
              kind: "plain" as const,
            })),
            {
              text: `→ ${captions.reply}`,
              from: pasteAt + 42,
              kind: "reply" as const,
            },
          ]}
        />
      </div>
    </Screen>
  );
};
