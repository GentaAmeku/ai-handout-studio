import type captionsEn from "./captions.en.json";
import { FPS } from "./theme";

export type Captions = typeof captionsEn;
export type Lang = "en" | "ja";

// scripts/demo-record.mjs が public/clips/<name>.json に書く記録
export type Rect = { x: number; y: number; width: number; height: number };
export type ClipMeta = {
  name: string;
  seconds: number;
  size: { width: number; height: number };
  targets: Record<string, Rect>;
  events: { t: number; kind: string; label: string }[];
};
export type Clips = Record<ClipName, ClipMeta>;

export const CLIP_NAMES = [
  "sheet",
  "list",
  "editor",
  "switch",
  "export",
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

// 録画をどう使うか: 何秒目から(trim)、何倍速で(rate)。操作の間を人が追える速さに詰める
export type ClipUse = {
  name: ClipName;
  trim: number;
  rate: number;
  end?: number;
};
export const CLIP_USE: Record<ClipName, ClipUse> = {
  sheet: { name: "sheet", trim: 0, rate: 1.5 },
  list: { name: "list", trim: 0, rate: 1.3 },
  editor: { name: "editor", trim: 0, rate: 1.4 },
  switch: { name: "switch", trim: 0.9, rate: 1.6, end: 11.9 },
  export: { name: "export", trim: 0, rate: 1.2 },
};

export const TRANSITION = 12;

// 録画の秒数を、場面の中のコマに直す
export const clipFrames = (use: ClipUse, clip: ClipMeta) =>
  Math.round((((use.end ?? clip.seconds) - use.trim) / use.rate) * FPS);

// 録画の中の時刻(ms)を、場面の中のコマに直す
export const eventFrame = (use: ClipUse, ms: number) =>
  Math.round(((ms / 1000 - use.trim) / use.rate) * FPS);

export type Scene = { id: keyof Captions; frames: number };

// 8 場面の長さ(コマ)。録画の場面は録画の長さから決め、質問票は貼り戻しの端末ぶんを足す
export const scenes = (clips: Clips): Scene[] => [
  { id: "scatter", frames: 96 },
  { id: "ask", frames: 108 },
  { id: "sheet", frames: clipFrames(CLIP_USE.sheet, clips.sheet) + 66 },
  { id: "list", frames: clipFrames(CLIP_USE.list, clips.list) },
  { id: "editor", frames: clipFrames(CLIP_USE.editor, clips.editor) },
  { id: "switch", frames: clipFrames(CLIP_USE.switch, clips.switch) },
  { id: "export", frames: clipFrames(CLIP_USE.export, clips.export) },
  { id: "end", frames: 138 },
];

export const totalFrames = (list: Scene[]) =>
  list.reduce((sum, scene) => sum + scene.frames, 0) -
  TRANSITION * (list.length - 1);

// 場面の始まるコマ(つなぎの重なりを引いたもの)
export const sceneStart = (list: Scene[], id: Scene["id"]) =>
  list
    .slice(
      0,
      list.findIndex((scene) => scene.id === id),
    )
    .reduce((sum, scene) => sum + scene.frames - TRANSITION, 0);

// GIF に切り出す 5 秒(場面 6 の、窓を開く直前から)。Prism まで入るよう、動画より速く回す
export const GIF_SECONDS = 5;
export const GIF_OFFSET = 0.2;
export const GIF_RATE = 1.9;
