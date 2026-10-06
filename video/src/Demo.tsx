import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { Ask } from "./scenes/Ask";
import { Document } from "./scenes/Document";
import { End } from "./scenes/End";
import { Scatter } from "./scenes/Scatter";
import { Screen } from "./scenes/Screen";
import { Sheet } from "./scenes/Sheet";
import { color } from "./theme";
import {
  type Captions,
  CLIP_USE,
  type Clips,
  type Lang,
  scenes,
  TRANSITION,
} from "./timeline";

export type DemoProps = { lang: Lang; captions: Captions; clips: Clips };

const SceneView = ({
  id,
  lang,
  captions,
  clips,
}: DemoProps & { id: keyof Captions }) => {
  if (id === "scatter")
    return <Scatter captions={captions.scatter} lang={lang} />;
  if (id === "ask") return <Ask captions={captions.ask} lang={lang} />;
  if (id === "sheet")
    return <Sheet captions={captions.sheet} lang={lang} clip={clips.sheet} />;
  if (id === "document")
    return (
      <Document
        captions={captions.document}
        lang={lang}
        clip={clips.document}
      />
    );
  if (id === "list")
    return (
      <Screen
        heading={captions.list.heading}
        lang={lang}
        use={CLIP_USE.list}
        clip={clips.list}
      />
    );
  if (id === "switch")
    return (
      <Screen
        heading={captions.switch.heading}
        lang={lang}
        use={CLIP_USE.switch}
        clip={clips.switch}
        callouts={[
          {
            target: "open",
            event: "open",
            label: captions.switch.callouts.open,
            dx: 60,
            dy: 44,
            lead: 6,
            frames: 36,
          },
        ]}
      />
    );
  if (id === "export")
    return (
      <Screen
        heading={captions.export.heading}
        lang={lang}
        use={CLIP_USE.export}
        clip={clips.export}
        callouts={[
          {
            target: "pdf",
            event: "pdf",
            label: captions.export.callouts.pdf,
            dx: -30,
            dy: 60,
            lead: 12,
            frames: 40,
          },
        ]}
      />
    );
  return <End captions={captions.end} lang={lang} />;
};

export const Demo = (props: DemoProps) => {
  const list = scenes(props.clips);
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <TransitionSeries>
        {list.flatMap((scene, index) => [
          <TransitionSeries.Sequence
            key={scene.id}
            durationInFrames={scene.frames}
            name={scene.id}
          >
            <SceneView id={scene.id} {...props} />
          </TransitionSeries.Sequence>,
          ...(index < list.length - 1
            ? [
                <TransitionSeries.Transition
                  key={`t-${scene.id}`}
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: TRANSITION })}
                />,
              ]
            : []),
        ])}
      </TransitionSeries>
      {/* scripts/bgm.mjs が Tone.js で作った曲。ラウドネスは整えてあるのでそのまま敷く */}
      <Audio src={staticFile("bgm.wav")} volume={0.9} />
    </AbsoluteFill>
  );
};
