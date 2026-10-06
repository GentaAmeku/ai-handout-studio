import {
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Terminal } from "../Terminal";
import { color, FPS, font } from "../theme";
import {
  type Captions,
  CLIP_USE,
  type ClipMeta,
  clipFrames,
  DOCUMENT_TAIL,
  eventAt,
  type Lang,
} from "../timeline";
import { Screen } from "./Screen";

// 場面 4(山場): HTML 資料。一覧から開き(3 列)、要約を直し、セクションを並べ替え、履歴の変更前 / 変更後で見比べ、
// 1 枚の HTML に書き出し、共有の依頼をコピーする。録画が終わる前にターミナル風の絵が出て(依頼を貼る → Published →
// URL は省略形)、そのあとスマホが滑り込み、共有したページを読む
const PHONE = { width: 390, height: 844, scale: 0.62, bezel: 12, radius: 36 };
const PHONE_AT = { x: 900, y: 96 };

export const Document = ({
  captions,
  lang,
  clip,
}: {
  captions: Captions["document"];
  lang: Lang;
  clip: ClipMeta;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const use = CLIP_USE.document;
  const terminalAt = clipFrames(use, clip) - DOCUMENT_TAIL.terminalLead;
  const phoneAt = terminalAt + DOCUMENT_TAIL.phoneAfter;
  const slide = spring({
    frame: frame - terminalAt,
    fps,
    config: { damping: 18 },
  });
  const phoneIn = spring({
    frame: frame - phoneAt,
    fps,
    config: { damping: 16 },
  });
  // 端末が出たら、後ろの窓は薄くする
  const dim = interpolate(frame, [terminalAt, terminalAt + 16], [1, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const label = spring({
    frame: frame - phoneAt - 14,
    fps,
    config: { damping: 16 },
  });
  const phoneWidth = PHONE.width * PHONE.scale + PHONE.bezel * 2;
  const phoneHeight = PHONE.height * PHONE.scale + PHONE.bezel * 2;
  return (
    <Screen
      heading={[
        { text: captions.headings.open, from: 0 },
        { text: captions.headings.edit, from: eventAt(use, clip, "front") - 4 },
        {
          text: captions.headings.share,
          from: eventAt(use, clip, "export") - 10,
        },
      ]}
      lang={lang}
      use={use}
      clip={clip}
      windowStyle={{ opacity: dim }}
      callouts={[
        {
          target: "summary",
          event: "summary",
          label: captions.callouts.summary,
          dx: -40,
          dy: -84,
          lead: 4,
          frames: 52,
        },
        {
          target: "reorder",
          event: "reorder",
          label: captions.callouts.reorder,
          dx: 60,
          dy: -52,
          lead: 6,
          frames: 50,
        },
        {
          target: "before",
          event: "before",
          label: captions.callouts.before,
          dx: 60,
          dy: 48,
          lead: 8,
          frames: 72,
        },
        {
          target: "export",
          event: "export",
          label: captions.callouts.export,
          dx: -90,
          dy: 64,
          lead: 10,
          frames: 44,
        },
        {
          target: "share",
          event: "share",
          label: captions.callouts.share,
          dx: -60,
          dy: 72,
          lead: 10,
          frames: 46,
        },
      ]}
    >
      {frame >= terminalAt && (
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 170,
            opacity: slide,
            transform: `translateX(${(1 - slide) * -300}px)`,
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
            width={760}
            height={300}
            fontSize={17}
            cwd="~/projects/intranet"
            lines={[
              ...captions.paste.map((text, index) => ({
                text,
                from: terminalAt + 10 + index * 6,
                kind: "plain" as const,
              })),
              { text: "…", from: terminalAt + 30, kind: "muted" as const },
              {
                text: captions.published,
                from: terminalAt + 48,
                kind: "ok" as const,
              },
            ]}
          />
        </div>
      )}
      {frame >= phoneAt && (
        <>
          <div
            style={{
              position: "absolute",
              left: PHONE_AT.x,
              top: PHONE_AT.y,
              width: phoneWidth,
              height: phoneHeight,
              padding: PHONE.bezel,
              borderRadius: PHONE.radius,
              background: "#0f172a",
              boxShadow:
                "0 30px 70px rgba(15, 23, 42, 0.35), 0 0 0 2px rgba(148, 163, 184, 0.5)",
              opacity: phoneIn,
              transform: `translateX(${(1 - phoneIn) * 320}px)`,
            }}
          >
            <div
              style={{
                width: PHONE.width * PHONE.scale,
                height: PHONE.height * PHONE.scale,
                borderRadius: PHONE.radius - PHONE.bezel,
                overflow: "hidden",
                background: color.bg,
              }}
            >
              <div
                style={{
                  width: PHONE.width,
                  height: PHONE.height,
                  transform: `scale(${PHONE.scale})`,
                  transformOrigin: "top left",
                }}
              >
                <OffthreadVideo
                  src={staticFile(`clips/${CLIP_USE.phone.name}.mp4`)}
                  trimBefore={Math.round(CLIP_USE.phone.trim * FPS)}
                  playbackRate={CLIP_USE.phone.rate}
                  muted
                  style={{
                    width: PHONE.width,
                    height: PHONE.height,
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: PHONE_AT.x + phoneWidth / 2,
              top: PHONE_AT.y + phoneHeight + 14,
              transform: `translateX(-50%) scale(${label})`,
              opacity: label,
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
            {captions.phone}
          </div>
        </>
      )}
    </Screen>
  );
};
