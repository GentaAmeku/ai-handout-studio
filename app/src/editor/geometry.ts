import { MIN_BLOCK_PX, type Rect, SNAP_PX, snap } from "./operations";

// キャンバスの直接操作で使う位置と大きさの計算

export type Corner = "nw" | "ne" | "sw" | "se";

export const corners: readonly Corner[] = ["nw", "ne", "sw", "se"];

export const moveRect = (origin: Rect, dx: number, dy: number): Rect => ({
  ...origin,
  x: origin.x + dx,
  y: origin.y + dy,
});

// 押した角と反対側の角を動かさずに大きさを変える
export const resizeRect = (
  origin: Rect,
  corner: Corner,
  dx: number,
  dy: number,
): Rect => {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const w = Math.max(MIN_BLOCK_PX, origin.w + (west ? -dx : dx));
  const h = Math.max(MIN_BLOCK_PX, origin.h + (north ? -dy : dy));
  return {
    x: west ? origin.x + origin.w - w : origin.x,
    y: north ? origin.y + origin.h - h : origin.y,
    w,
    h,
  };
};

// 移動は大きさを変えずに、左上だけを 8px にそろえる
export const snapPosition = (rect: Rect): Rect => ({
  ...rect,
  x: snap(rect.x),
  y: snap(rect.y),
});

// リサイズは、押した角の側の辺だけを 8px にそろえる。反対側の辺は元の位置から動かさない
export const snapResize = (rect: Rect, corner: Corner): Rect => {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  const right = west ? rect.x + rect.w : snap(rect.x + rect.w);
  const bottom = north ? rect.y + rect.h : snap(rect.y + rect.h);
  const left = west ? snap(rect.x) : rect.x;
  const top = north ? snap(rect.y) : rect.y;
  const w = Math.max(MIN_BLOCK_PX, right - left);
  const h = Math.max(MIN_BLOCK_PX, bottom - top);
  return {
    x: west ? right - w : left,
    y: north ? bottom - h : top,
    w,
    h,
  };
};

const nudges: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["ArrowLeft", [-SNAP_PX, 0]],
  ["ArrowRight", [SNAP_PX, 0]],
  ["ArrowUp", [0, -SNAP_PX]],
  ["ArrowDown", [0, SNAP_PX]],
]);

// 矢印キーで 8px 動かす。矢印キー以外は undefined
export const nudgeRect = (origin: Rect, key: string): Rect | undefined => {
  const offset = nudges.get(key);
  return offset ? moveRect(origin, offset[0], offset[1]) : undefined;
};
