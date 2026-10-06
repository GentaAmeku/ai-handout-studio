import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Desk, Heading } from "../Desk";
import { Terminal } from "../Terminal";
import type { Captions, Lang } from "../timeline";

// 場面 2: ターミナルで頼む。打ち終わると「保存した」の行が出る
export const Ask = ({
  captions,
  lang,
}: {
  captions: Captions["ask"];
  lang: Lang;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const typed = 14;
  const cps = lang === "ja" ? 0.75 : 1.4;
  const done = typed + Math.ceil(captions.prompt.length / cps);
  return (
    <Desk>
      <Heading text={captions.heading} lang={lang} />
      <div
        style={{
          position: "absolute",
          left: 180,
          top: 160,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px)`,
        }}
      >
        <Terminal
          width={920}
          height={420}
          cwd={captions.cwd}
          fontSize={24}
          lines={[
            { text: captions.prompt, from: typed, cps, kind: "prompt" },
            { text: "…", from: done + 10, kind: "muted" },
            { text: `✓ ${captions.saved}`, from: done + 26, kind: "ok" },
          ]}
        />
      </div>
    </Desk>
  );
};
