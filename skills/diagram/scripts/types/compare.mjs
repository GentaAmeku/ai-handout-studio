// Before / After の比較。同じ種類の図を、左右に並べる。片側が広いか、並べて上限の幅を超えるなら上下に並べる。
// 両側の箱の大きさをそろえ、同じものが同じ大きさに見えるようにする。
import { chevron, measureNodes, panel } from "../lib/draw.mjs";
import { METRICS, PANELS } from "../lib/style.mjs";
import * as flow from "./flow.mjs";
import * as structure from "./structure.mjs";

const TYPES = { flow, structure };
const PANEL_HEAD = 34;
const PANEL_GAP = 56;
const M = 20; // 比較の枠のまわりの余白。図そのものの余白(METRICS.margin)とは別
// 片側がこれより広い図は、左右に並べると1枚が横に長くなりすぎて縮むので、上下に並べる
const SIDE_BY_SIDE_MAX_W = 700;

export function layout(spec, problems) {
  const sides = ["before", "after"].map((side) => ({ ...spec[side], colorMode: spec.colorMode, lang: spec.lang }));
  const head = (side) => ({ ...PANELS[side], label: spec.lang === "en" ? PANELS[side].en : PANELS[side].label });
  const type = TYPES[sides[0].type];
  const cell = measureNodes(
    sides.flatMap((sub) => sub.nodes),
    problems,
    type.cellOptions(sides[0]),
  );
  const drawings = sides.map((sub) => type.layout(sub, problems, cell));
  const panelW = Math.max(...drawings.map((d) => d.width));
  const sideBySide = panelW * 2 + PANEL_GAP + M * 2 <= METRICS.maxCanvasW && drawings.every((d) => d.width < SIDE_BY_SIDE_MAX_W);
  // 左右に並べるときは高さをそろえ、上下に並べるときはそれぞれの高さにする
  const heights = drawings.map((d) => (sideBySide ? Math.max(...drawings.map((x) => x.height)) : d.height) + PANEL_HEAD);
  const panelH = Math.max(...heights);

  const [ax, ay] = sideBySide ? [M + panelW + PANEL_GAP, M] : [M, M + heights[0] + PANEL_GAP];
  const arrow = sideBySide
    ? chevron(M + panelW + PANEL_GAP / 2, M + panelH / 2, "right", PANELS.after.color)
    : chevron(M + panelW / 2, M + heights[0] + PANEL_GAP / 2, "down", PANELS.after.color);
  return {
    width: (sideBySide ? ax + panelW : M + panelW) + M,
    height: (sideBySide ? M + panelH : ay + heights[1]) + M,
    body: panel(drawings[0], head("before"), M, M, panelW, heights[0], PANEL_HEAD) + arrow + panel(drawings[1], head("after"), ax, ay, panelW, heights[1], PANEL_HEAD),
    nodes: drawings.flatMap((d) => d.nodes),
  };
}
