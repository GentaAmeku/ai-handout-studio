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
  "document",
  "phone",
  "list",
  "switch",
  "export",
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

// 録画をどう使うか: 何秒目から(trim)、何倍速で(rate)、何秒目まで(end)。操作の間を人が追える速さに詰める
export type ClipUse = {
  name: ClipName;
  trim: number;
  rate: number;
  end?: number;
};
export const CLIP_USE: Record<ClipName, ClipUse> = {
  sheet: { name: "sheet", trim: 0, rate: 1.5 },
  document: { name: "document", trim: 0, rate: 1.6 },
  phone: { name: "phone", trim: 0, rate: 1.6 },
  list: { name: "list", trim: 0, rate: 1.4, end: 4.6 },
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

// 録画の記録から、操作の時刻をコマに直す(無ければ fallback)
export const eventAt = (
  use: ClipUse,
  clip: ClipMeta,
  label: string,
  fallback = 0,
) => {
  const event = clip.events.find((item) => item.label === label);
  return event ? eventFrame(use, event.t) : fallback;
};

// 場面 4 の続き(ターミナル風の絵とスマホ)の組み立て。録画が終わる前から端末が出て、その 2 秒後にスマホが滑り込む
export const DOCUMENT_TAIL = { terminalLead: 20, phoneAfter: 60, hold: 10 };
export const documentTailFrames = (clips: Clips) =>
  DOCUMENT_TAIL.phoneAfter +
  clipFrames(CLIP_USE.phone, clips.phone) +
  DOCUMENT_TAIL.hold -
  DOCUMENT_TAIL.terminalLead;

export type Scene = { id: keyof Captions; frames: number };

// 8 場面の長さ(コマ)。録画の場面は録画の長さから決め、質問票は貼り戻しの端末ぶん、HTML 資料は共有とスマホのぶんを足す
export const scenes = (clips: Clips): Scene[] => [
  { id: "scatter", frames: 96 },
  { id: "ask", frames: 114 },
  { id: "sheet", frames: clipFrames(CLIP_USE.sheet, clips.sheet) + 66 },
  {
    id: "document",
    frames:
      clipFrames(CLIP_USE.document, clips.document) + documentTailFrames(clips),
  },
  { id: "list", frames: clipFrames(CLIP_USE.list, clips.list) },
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

// GIF に切り出す 5 秒(テンプレート切替の、窓を開く直前から)。Prism まで入るよう、動画より速く回す
export const GIF_SECONDS = 5;
export const GIF_OFFSET = 0.2;
export const GIF_RATE = 1.9;
