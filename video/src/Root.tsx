import { Composition, staticFile } from "remotion";
import captionsEn from "./captions.en.json";
import captionsJa from "./captions.ja.json";
import { Demo, type DemoProps } from "./Demo";
import { Switch, type SwitchProps } from "./Switch";
import { FPS, HEIGHT, WIDTH } from "./theme";
import {
  type Captions,
  CLIP_NAMES,
  type ClipMeta,
  type Clips,
  GIF_SECONDS,
  type Lang,
  scenes,
  totalFrames,
} from "./timeline";

// 録画の記録(public/clips/<name>.json)は、Studio でも render でも読み込む
const loadClips = async (): Promise<Clips> => {
  const entries = await Promise.all(
    CLIP_NAMES.map(async (name) => {
      const response = await fetch(staticFile(`clips/${name}.json`));
      if (!response.ok)
        throw new Error(
          `public/clips/${name}.json が無い。先に node scripts/demo-record.mjs を実行する`,
        );
      return [name, (await response.json()) as ClipMeta] as const;
    }),
  );
  return Object.fromEntries(entries) as Clips;
};

const captionsOf: Record<Lang, Captions> = { en: captionsEn, ja: captionsJa };

// 記録が読めるまでの仮の値(長さだけ合わせる)
const placeholder = (): Clips =>
  Object.fromEntries(
    CLIP_NAMES.map((name) => [
      name,
      {
        name,
        seconds: 8,
        size: { width: WIDTH, height: HEIGHT },
        targets: {},
        events: [],
      } satisfies ClipMeta,
    ]),
  ) as unknown as Clips;

export const Root = () => (
  <>
    {(["en", "ja"] as const).map((lang) => (
      <Composition
        key={`demo-${lang}`}
        id={`demo-${lang}`}
        component={Demo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={totalFrames(scenes(placeholder()))}
        defaultProps={
          {
            lang,
            captions: captionsOf[lang],
            clips: placeholder(),
          } satisfies DemoProps
        }
        calculateMetadata={async ({ props }) => {
          const clips = await loadClips();
          return {
            props: { ...props, clips },
            durationInFrames: totalFrames(scenes(clips)),
          };
        }}
      />
    ))}
    {(["en", "ja"] as const).map((lang) => (
      <Composition
        key={`switch-${lang}`}
        id={`switch-${lang}`}
        component={Switch}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={GIF_SECONDS * FPS}
        defaultProps={
          {
            lang,
            captions: captionsOf[lang],
            clips: placeholder(),
          } satisfies SwitchProps
        }
        calculateMetadata={async ({ props }) => ({
          props: { ...props, clips: await loadClips() },
        })}
      />
    ))}
  </>
);
