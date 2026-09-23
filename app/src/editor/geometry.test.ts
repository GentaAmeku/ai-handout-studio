import { describe, expect, it } from "vitest";
import {
  moveRect,
  nudgeRect,
  resizeRect,
  snapPosition,
  snapResize,
} from "./geometry";

const origin = { x: 64, y: 48, w: 820, h: 96 };

describe("移動", () => {
  it("左上だけを 8px にそろえ、大きさは変えない", () => {
    expect(snapPosition(moveRect(origin, 13, -5))).toEqual({
      x: 80,
      y: 40,
      w: 820,
      h: 96,
    });
  });

  it("矢印キーで 8px 動き、ほかのキーでは動かない", () => {
    expect(nudgeRect(origin, "ArrowRight")).toEqual({ ...origin, x: 72 });
    expect(nudgeRect(origin, "ArrowUp")).toEqual({ ...origin, y: 40 });
    expect(nudgeRect(origin, "Enter")).toBeUndefined();
  });
});

describe("リサイズ", () => {
  it("右下の角は左上を動かさずに広げる", () => {
    expect(resizeRect(origin, "se", 20, 30)).toEqual({
      x: 64,
      y: 48,
      w: 840,
      h: 126,
    });
  });

  it("左上の角は右下を動かさず、最小の大きさで止まる", () => {
    expect(resizeRect(origin, "nw", 900, 100)).toEqual({
      x: 852,
      y: 112,
      w: 32,
      h: 32,
    });
  });

  it("押した角の側の辺だけを 8px にそろえ、反対側の辺はずらさない", () => {
    const rect = resizeRect(origin, "sw", -11, 5);
    expect(snapResize(rect, "sw")).toEqual({ x: 56, y: 48, w: 828, h: 104 });
  });

  it("最小の大きさで止まるときも、反対側の辺を基準にする", () => {
    const rect = resizeRect(origin, "nw", 900, 0);
    expect(snapResize(rect, "nw")).toEqual({ x: 852, y: 48, w: 32, h: 96 });
  });
});
