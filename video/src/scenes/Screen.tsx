import type { CSSProperties, ReactNode } from "react";
import { OffthreadVideo, staticFile } from "remotion";
import {
  Callout,
  DESK_PLACEMENT,
  Desk,
  Heading,
  type HeadingAt,
  Headings,
  type Placement,
  Window,
} from "../Desk";
import { FPS } from "../theme";
import {
  type ClipMeta,
  type ClipUse,
  eventFrame,
  type Lang,
} from "../timeline";

// 録画を窓に入れて再生する。rate 倍速、trim 秒目から
export const Clip = ({
  use,
  placement,
  style,
}: {
  use: ClipUse;
  placement: Placement;
  style?: CSSProperties;
}) => (
  <Window placement={placement} style={style}>
    <OffthreadVideo
      src={staticFile(`clips/${use.name}.mp4`)}
      trimBefore={Math.round(use.trim * FPS)}
      playbackRate={use.rate}
      muted
      style={{ width: 1280, height: 720, display: "block" }}
    />
  </Window>
);

export type CalloutSpec = {
  // 録画の JSON の targets のキー(click した要素は label がキーになる)
  target: string;
  // 録画の JSON の events の label。無ければ場面の頭から
  event?: string;
  label: string;
  lead?: number;
  frames?: number;
  dx?: number;
  dy?: number;
};

// 画面の場面の共通形: 机 + 見出し(1 つか、途中で替わる並び)+ 録画の窓 + 吹き出し
export const Screen = ({
  heading,
  lang,
  use,
  clip,
  callouts = [],
  placement = DESK_PLACEMENT,
  windowStyle,
  children,
}: {
  heading: string | HeadingAt[];
  lang: Lang;
  use: ClipUse;
  clip: ClipMeta;
  callouts?: CalloutSpec[];
  placement?: Placement;
  windowStyle?: CSSProperties;
  children?: ReactNode;
}) => (
  <Desk>
    <Clip use={use} placement={placement} style={windowStyle} />
    {callouts.map((spec) => {
      const target = clip.targets[spec.target];
      const event = clip.events.find((item) => item.label === spec.event);
      if (!target) return null;
      const at = event ? eventFrame(use, event.t) - (spec.lead ?? 14) : 6;
      return (
        <Callout
          key={spec.target + spec.label}
          placement={placement}
          target={target}
          label={spec.label}
          lang={lang}
          from={at}
          frames={spec.frames}
          dx={spec.dx}
          dy={spec.dy}
        />
      );
    })}
    {children}
    {typeof heading === "string" ? (
      <Heading text={heading} lang={lang} />
    ) : (
      <Headings items={heading} lang={lang} />
    )}
  </Desk>
);
