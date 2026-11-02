// 構成の図。部品(箱)と、そのつながりと、囲み(持ち主・実行環境などの境界)を描く。
// 座標は書かせない。配置は次の規則で決める(Archify の構成図の考え方を借りる):
// - 囲みを左から右へ並べる。つながりの元(呼ぶ側・渡す側)が左。囲みの中も同じ向きで列を分ける
// - 各箱から最初に書いた矢印の先を同じ行に置き、線をまっすぐ通す。ほかの先は下の行へ
// - 線は箱と箱のすき間だけを通し、曲がりと交差がいちばん少ない道を選ぶ
// - 同じ辺に出入りする線は口をずらし、曲がる向きの順に並べる(根元で交差させない)
import { band, checkLabels, drawEdge, drawNode, labelWidth, measureNodes, simplify } from "../lib/draw.mjs";
import { METRICS } from "../lib/style.mjs";

const M = METRICS.margin;
const GAP_X = 64; // 列のすき間
const GAP_Y = 52; // 行のすき間。縦の線のラベルが入る
const PAD = 20; // 囲みの内側の余白
const HEAD = 30; // 囲みの見出しの高さ
const OUTSIDE_X = 48; // 隣の囲みとのあいだ。線とラベルが通る
const OUTSIDE_Y = 28;
const TRACK = 10; // すき間を並んで通る線の間隔
const PORT = 14; // 同じ辺に出入りする線の口の間隔
const COST = { bend: 60, cross: 400, overlap: 5000, offCenter: 0.04 };

// 箱の幅。囲みを横に並べるので、横向きの流れと同じく細くする
export const cellOptions = () => ({ maxW: 200 });

export function layout(spec, problems, forced) {
  const nodes = spec.nodes;
  const edges = spec.edges ?? [];
  const cell = forced ?? measureNodes(nodes, problems, cellOptions(spec));
  const { col, row, frames } = place(nodes, edges, spec.boundaries ?? []);
  const geo = geometry(nodes, col, row, frames, cell);
  const routes = routeAll(edges, geo, problems);
  const labels = placeLabels(routes, geo.boxes);
  checkLabels(
    routes.flatMap(({ edge }, i) => (labels[i] ? [{ edge, rect: labels[i].rect }] : [])),
    [...geo.boxes.values()],
    problems,
  );

  const parts = [];
  for (const f of geo.frames) parts.push(band(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0, f.label, [f.x0 + 16, f.y0 + 17]));
  const drawn = routes.map(({ edge, points }, i) => drawEdge(points, { ...edge, labelXY: labels[i]?.at }));
  parts.push(...drawn.map((d) => d.path));
  for (const nd of nodes) {
    const b = geo.boxes.get(nd.id);
    parts.push(drawNode(nd, { x: b.x0, y: b.y0, w: cell.w, h: cell.h }, cell.info.get(nd), spec.colorMode, spec.lang));
  }
  parts.push(...drawn.map((d) => d.label));

  // 描いたものすべてが収まる範囲に、余白を足して原点をそろえる
  const rects = [
    ...geo.frames,
    ...geo.boxes.values(),
    ...routes.flatMap((r) => r.points.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))),
    ...labels.filter(Boolean).map((l) => l.rect),
  ];
  const minX = Math.min(...rects.map((r) => r.x0));
  const minY = Math.min(...rects.map((r) => r.y0));
  const maxX = Math.max(...rects.map((r) => r.x1));
  const maxY = Math.max(...rects.map((r) => r.y1));
  return {
    width: maxX - minX + M * 2,
    height: maxY - minY + M * 2,
    body: `<g transform="translate(${M - minX} ${M - minY})">${parts.join("")}</g>`,
    nodes,
    routes, // 線の道筋。テストが交差と重なりを数えるのに使う
  };
}

// ---------- 配置。箱ごとに列と行を決める ----------

function place(nodes, edges, boundaries) {
  const order = new Map(nodes.map((nd, i) => [nd.id, i]));
  const edgeIndex = new Map(edges.map((e, i) => [e, i]));
  // 囲みに入っていない箱は、1つずつ枠の無い囲みとして扱う
  const clusters = boundaries.map((b) => ({ label: b.label, ids: [...b.nodes], framed: true }));
  const clusterOf = new Map();
  clusters.forEach((c) => c.ids.forEach((id) => clusterOf.set(id, c)));
  for (const nd of nodes) {
    if (clusterOf.has(nd.id)) continue;
    const c = { ids: [nd.id], framed: false };
    clusters.push(c);
    clusterOf.set(nd.id, c);
  }
  for (const c of clusters) c.ids.sort((a, b) => order.get(a) - order.get(b));
  clusters.sort((a, b) => order.get(a.ids[0]) - order.get(b.ids[0]));

  const crossing = edges.filter((e) => clusterOf.get(e.from) !== clusterOf.get(e.to));
  const clusterRank = longestPath(clusters, crossing.map((e) => [clusterOf.get(e.from), clusterOf.get(e.to)]));
  const localRank = new Map();
  for (const c of clusters) {
    const inner = edges.filter((e) => clusterOf.get(e.from) === c && clusterOf.get(e.to) === c);
    for (const [id, r] of longestPath(c.ids, inner.map((e) => [e.from, e.to]))) localRank.set(id, r);
  }

  // 列: 前の段の囲みの列数を足した位置から、囲みの中の段の数だけ右へ
  const ranks = [...new Set(clusters.map((c) => clusterRank.get(c)))].sort((a, b) => a - b);
  const widthOf = (c) => 1 + Math.max(...c.ids.map((id) => localRank.get(id)));
  const col = new Map();
  let offset = 0;
  for (const r of ranks) {
    const here = clusters.filter((c) => clusterRank.get(c) === r);
    here.forEach((c) => c.ids.forEach((id) => col.set(id, offset + localRank.get(id))));
    offset += Math.max(...here.map(widthOf));
  }

  // 行: 段の順に、囲みごとに決める。同じ段に囲みが2つ以上あれば、上から積む
  const row = new Map();
  const rowsOf = (c) => c.ids.map((id) => row.get(id));
  for (const r of ranks) {
    const here = clusters.filter((c) => clusterRank.get(c) === r);
    for (const c of here) placeRows(c);
    here.sort((a, b) => Math.min(...rowsOf(a)) - Math.min(...rowsOf(b)) || order.get(a.ids[0]) - order.get(b.ids[0]));
    let floor = -Infinity;
    for (const c of here) {
      const shift = Math.max(0, floor + 1 - Math.min(...rowsOf(c)));
      c.ids.forEach((id) => row.set(id, row.get(id) + shift));
      floor = Math.max(...rowsOf(c));
    }
  }
  const top = Math.min(...row.values());
  for (const [id, r] of row) row.set(id, r - top);

  const frames = clusters
    .filter((c) => c.framed)
    .map((c) => {
      const cs = c.ids.map((id) => col.get(id));
      const rs = c.ids.map((id) => row.get(id));
      return { label: c.label, ids: c.ids, c0: Math.min(...cs), c1: Math.max(...cs), r0: Math.min(...rs), r1: Math.max(...rs) };
    });
  return { col, row, frames };

  function placeRows(c) {
    const taken = new Set();
    const localRanks = [...new Set(c.ids.map((id) => localRank.get(id)))].sort((a, b) => a - b);
    for (const lr of localRanks) {
      const items = c.ids
        .filter((id) => localRank.get(id) === lr)
        .map((id) => ({ id, ...wish(id, c) }))
        .sort((a, b) => a.row - b.row || a.tie - b.tie);
      for (const item of items) {
        let r = item.row;
        while (taken.has(`${col.get(item.id)}|${r}`)) r++;
        taken.add(`${col.get(item.id)}|${r}`);
        row.set(item.id, r);
      }
    }
  }

  // 行の希望。囲みの中の前の箱があれば、その最初の矢印の先なら同じ行、ほかは下の行。
  // 無ければ、囲みの外ですでに置いた相手の行にそろえる(線をまっすぐにするため)
  function wish(id, c) {
    const preds = edges.filter((e) => e.to === id && clusterOf.get(e.from) === c && row.has(e.from) && localRank.get(e.from) < localRank.get(id));
    if (preds.length) {
      const main = preds.find((e) => firstOut(e.from, c) === e);
      if (main) return { row: row.get(main.from), tie: edgeIndex.get(main) };
      return { row: row.get(preds[0].from) + 1, tie: edgeIndex.get(preds[0]) };
    }
    const outside = (other) => row.has(other) && clusterOf.get(other) !== c;
    const anchor = edges.find((e) => e.to === id && outside(e.from)) ?? edges.find((e) => e.from === id && outside(e.to));
    if (anchor) return { row: row.get(anchor.to === id ? anchor.from : anchor.to), tie: edgeIndex.get(anchor) };
    const mine = c.ids.filter((x) => row.has(x)).map((x) => row.get(x));
    return { row: mine.length ? Math.max(...mine) + 1 : 0, tie: edges.length + order.get(id) };
  }

  function firstOut(id, c) {
    return edges.find((e) => e.from === id && clusterOf.get(e.to) === c && localRank.get(e.to) > localRank.get(id));
  }
}

// 段: 戻る向きの線(たどる途中で輪になる線)を除いた、いちばん長い経路の長さ
function longestPath(items, pairs) {
  const out = new Map(items.map((it) => [it, []]));
  for (const [a, b] of pairs) if (a !== b) out.get(a).push(b);
  const state = new Map();
  const forward = [];
  const visit = (a) => {
    state.set(a, "open");
    for (const b of out.get(a)) {
      if (state.get(b) === "open") continue;
      forward.push([a, b]);
      if (!state.has(b)) visit(b);
    }
    state.set(a, "done");
  };
  items.forEach((a) => state.has(a) || visit(a));
  const rank = new Map(items.map((a) => [a, 0]));
  for (let i = 0; i < items.length; i++) for (const [a, b] of forward) rank.set(b, Math.max(rank.get(b), rank.get(a) + 1));
  return rank;
}

// ---------- 座標 ----------

function geometry(nodes, col, row, frames, cell) {
  const nCols = 1 + Math.max(...col.values());
  const nRows = 1 + Math.max(...row.values());
  const framed = new Set(frames.flatMap((f) => f.ids));
  // 場所を占めるもの: 囲みと、囲みに入っていない箱。囲みは余白と見出しの分だけ外へはみ出す
  const occupants = [
    ...frames.map((f) => ({ ...f, ext: { l: PAD, r: PAD, t: PAD + HEAD, b: PAD } })),
    ...nodes
      .filter((nd) => !framed.has(nd.id))
      .map((nd) => ({ c0: col.get(nd.id), c1: col.get(nd.id), r0: row.get(nd.id), r1: row.get(nd.id), ext: null })),
  ];
  const overlaps = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;
  const gapX = Array.from({ length: nCols - 1 }, (_, c) => {
    let need = GAP_X;
    for (const a of occupants.filter((o) => o.c1 === c))
      for (const b of occupants.filter((o) => o.c0 === c + 1 && overlaps(o.r0, o.r1, a.r0, a.r1)))
        if (a.ext || b.ext) need = Math.max(need, (a.ext?.r ?? 0) + (b.ext?.l ?? 0) + OUTSIDE_X);
    return need;
  });
  const gapY = Array.from({ length: nRows - 1 }, (_, r) => {
    let need = GAP_Y;
    for (const a of occupants.filter((o) => o.r1 === r))
      for (const b of occupants.filter((o) => o.r0 === r + 1 && overlaps(o.c0, o.c1, a.c0, a.c1)))
        if (a.ext || b.ext) need = Math.max(need, (a.ext?.b ?? 0) + (b.ext?.t ?? 0) + OUTSIDE_Y);
    return need;
  });
  const colLeft = [0];
  for (let c = 0; c < nCols - 1; c++) colLeft.push(colLeft[c] + cell.w + gapX[c]);
  const rowTop = [0];
  for (let r = 0; r < nRows - 1; r++) rowTop.push(rowTop[r] + cell.h + gapY[r]);

  const boxes = new Map(
    nodes.map((nd) => {
      const x0 = colLeft[col.get(nd.id)];
      const y0 = rowTop[row.get(nd.id)];
      return [nd.id, { x0, y0, x1: x0 + cell.w, y1: y0 + cell.h, xc: x0 + cell.w / 2, yc: y0 + cell.h / 2 }];
    }),
  );
  const frameRects = frames.map((f) => ({
    label: f.label,
    x0: colLeft[f.c0] - PAD,
    y0: rowTop[f.r0] - PAD - HEAD,
    x1: colLeft[f.c1] + cell.w + PAD,
    y1: rowTop[f.r1] + cell.h + PAD,
  }));

  // 線が通れる格子の線。箱の中心線、すき間の線(中央とその両側)、外周の線
  // k は中央からのずれ。中央に近い線ほど選ばれやすくする
  const tracksIn = (mid, gap, widened) => {
    const room = widened ? gap - PAD * 2 - 16 : gap - 16;
    const K = Math.max(1, Math.min(3, Math.floor(room / (2 * TRACK))));
    return Array.from({ length: K * 2 + 1 }, (_, i) => ({ v: mid + (i - K) * TRACK, k: Math.abs(i - K) }));
  };
  const all = [...boxes.values(), ...frameRects];
  const outer = (edge, sign) => [0, 1, 2].map((k) => ({ v: edge + sign * (24 + k * TRACK), k }));
  const xs = [
    ...colLeft.map((x) => ({ v: x + cell.w / 2, k: 0 })),
    ...gapX.flatMap((g, c) => tracksIn(colLeft[c] + cell.w + g / 2, g, g > GAP_X)),
    ...outer(Math.min(...all.map((b) => b.x0)), -1),
    ...outer(Math.max(...all.map((b) => b.x1)), 1),
  ];
  const ys = [
    ...rowTop.map((y) => ({ v: y + cell.h / 2, k: 0 })),
    ...gapY.flatMap((g, r) => tracksIn(rowTop[r] + cell.h + g / 2, g, g > GAP_Y)),
    ...outer(Math.min(...all.map((b) => b.y0)), -1),
    ...outer(Math.max(...all.map((b) => b.y1)), 1),
  ];
  return { boxes, frames: frameRects, xs, ys };
}

// ---------- 線の道筋 ----------
// 1回目: 箱の中心から中心へ引いて、どの辺から出入りするかを決める。先に引いた線との交差は避ける
// 2回目: 同じ辺に出入りする線の口を、曲がる向きの順にずらして決める
// 3回目: 決めた口から口へ、交差と重なりを避けて引き直す

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]; // 右・左・下・上
const OPP = [1, 0, 3, 2];
const SIDE_OUT = { right: 0, left: 1, bottom: 2, top: 3 }; // その辺から出るときの向き
const SIDE_OF_OUT = ["right", "left", "bottom", "top"];

function routeAll(edges, geo, problems) {
  const { boxes } = geo;
  // 中心から引くので、同じ箱から出る線は根元で重なる。重なりは数えず、交差だけを避ける
  const all = [0, 1, 2, 3];
  const span = (e) => {
    const [u, v] = [boxes.get(e.from), boxes.get(e.to)];
    return Math.abs(u.xc - v.xc) + Math.abs(u.yc - v.yc);
  };
  const first = new Array(edges.length);
  const sketch = [];
  for (const i of edges.map((_, i) => i).sort((a, b) => span(edges[a]) - span(edges[b]) || a - b)) {
    const [u, v] = [boxes.get(edges[i].from), boxes.get(edges[i].to)];
    first[i] = findPath(geo, { x: u.xc, y: u.yc, dirs: all, own: u }, { x: v.xc, y: v.yc, dirs: all, own: v }, sketch, { overlap: false }) ?? unreachable(edges[i], u, v, problems);
    sketch.push(...segmentsOf(first[i].points));
  }

  // 端ごとに、出入りする辺・曲がる向き・曲がるまでの長さ・相手までの横の距離を調べる
  const ends = [];
  first.forEach((found, i) => {
    const pts = found.points;
    for (const [id, other, path, which] of [
      [edges[i].from, edges[i].to, pts, "from"],
      [edges[i].to, edges[i].from, [...pts].reverse(), "to"],
    ]) {
      const side = SIDE_OF_OUT[dirOf(path[0], path[1])];
      const along = side === "left" || side === "right" ? 1 : 0;
      const turn = path.length > 2 ? Math.sign(Math.round(path[2][along] - path[1][along])) : 0;
      const stub = Math.abs(path[1][1 - along] - path[0][1 - along]);
      const reach = Math.abs(centerOf(boxes.get(other))[along] - centerOf(boxes.get(id))[along]);
      ends.push({ i, which, id, side, turn, stub, reach });
    }
  });
  const offsets = new Map();
  const groups = new Map();
  for (const end of ends) {
    const key = `${end.id}|${end.side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(end);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const box = boxes.get(list[0].id);
    const sideLen = list[0].side === "left" || list[0].side === "right" ? box.y1 - box.y0 : box.x1 - box.x0;
    const straight = list.filter((e) => e.turn === 0);
    const dirs = [-1, 1].filter((d) => list.some((e) => e.turn === d));
    const startAt = straight.length || dirs.length > 1 ? 1 : 0;
    const most = Math.max(startAt + Math.max(0, ...dirs.map((d) => list.filter((e) => e.turn === d).length - 1)), (straight.length - 1) / 2);
    const step = most > 0 ? Math.min(PORT, (sideLen / 2 - 8) / most) : PORT;
    straight.forEach((e, k) => offsets.set(`${e.i}|${e.which}`, (k - (straight.length - 1) / 2) * step));
    for (const d of dirs) {
      // 内側から: 曲がるまでが長いもの、相手が近いものほど内側(外側の線が先に曲がれば交差しない)
      const group = list.filter((e) => e.turn === d).sort((a, b) => b.stub - a.stub || a.reach - b.reach);
      group.forEach((e, k) => offsets.set(`${e.i}|${e.which}`, d * step * (k + startAt)));
    }
  }
  const portOf = (i, which) => {
    const end = ends.find((e) => e.i === i && e.which === which);
    const box = boxes.get(end.id);
    const off = offsets.get(`${i}|${which}`) ?? 0;
    const at = {
      right: [box.x1, box.yc + off],
      left: [box.x0, box.yc + off],
      bottom: [box.xc + off, box.y1],
      top: [box.xc + off, box.y0],
    }[end.side];
    const out = SIDE_OUT[end.side];
    return { x: at[0], y: at[1], own: box, dirs: [which === "from" ? out : OPP[out]] };
  };

  // 1回目の費用(長さ・曲がり・交差)が小さい線から引く。先に引いた線を避けるので、遠回りは費用の大きい線が受け持つ
  const routed = [];
  const result = new Array(edges.length);
  const order = edges.map((_, i) => i).sort((a, b) => first[a].cost - first[b].cost || a - b);
  for (const i of order) {
    const found = findPath(geo, portOf(i, "from"), portOf(i, "to"), routed) ?? unreachable(edges[i], boxes.get(edges[i].from), boxes.get(edges[i].to), problems);
    result[i] = { edge: edges[i], points: found.points };
    routed.push(...segmentsOf(found.points));
  }
  return result;
}

const centerOf = (b) => [b.xc, b.yc];
const dirOf = (a, b) => (b[0] > a[0] ? 0 : b[0] < a[0] ? 1 : b[1] > a[1] ? 2 : 3);

function mergeTracks(tracks) {
  const sorted = [...tracks].sort((a, b) => a.v - b.v || a.k - b.k);
  const out = [];
  for (const t of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.v - t.v) < 0.5) last.k = Math.min(last.k, t.k);
    else out.push({ ...t });
  }
  return out;
}

// 格子の上で、長さ + 曲がり + 交差 + 重なりの合計がいちばん小さい道を探す(ダイクストラ法)
// 状態は「点」と「その点へ入ってきた向き」。出発点では、決めた向きにしか進めない
function findPath(geo, from, to, routed, { overlap = true } = {}) {
  const X = mergeTracks([...geo.xs, { v: from.x, k: 0 }, { v: to.x, k: 0 }]);
  const Y = mergeTracks([...geo.ys, { v: from.y, k: 0 }, { v: to.y, k: 0 }]);
  const nx = X.length;
  const find = (list, v) => list.findIndex((t) => Math.abs(t.v - v) < 0.5);
  const start = find(Y, from.y) * nx + find(X, from.x);
  const goal = find(Y, to.y) * nx + find(X, to.x);
  const boxes = [...geo.boxes.values()];
  const isAt = (p, x, y) => Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5;
  const blocked = (ax, ay, bx, by) =>
    boxes.some((b) => {
      if (b === from.own && (isAt(from, ax, ay) || isAt(from, bx, by))) return false;
      if (b === to.own && (isAt(to, ax, ay) || isAt(to, bx, by))) return false;
      return hitsBox(ax, ay, bx, by, b, 6);
    });

  const size = nx * Y.length * 4;
  const dist = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const heap = new Heap();
  for (const d of from.dirs) {
    dist[start * 4 + d] = 0;
    heap.push(0, start * 4 + d);
  }
  let reached = -1;
  while (heap.size) {
    const [cost, state] = heap.pop();
    if (cost > dist[state]) continue;
    const p = state >> 2;
    const d = state & 3;
    if (p === goal && to.dirs.includes(d)) {
      reached = state;
      break;
    }
    const [i, j] = [p % nx, Math.floor(p / nx)];
    for (let d2 = 0; d2 < 4; d2++) {
      if (p === start ? d2 !== d : d2 === OPP[d]) continue;
      const [ni, nj] = [i + DIRS[d2][0], j + DIRS[d2][1]];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= Y.length) continue;
      const [ax, ay, bx, by] = [X[i].v, Y[j].v, X[ni].v, Y[nj].v];
      if (blocked(ax, ay, bx, by)) continue;
      const len = Math.abs(bx - ax) + Math.abs(by - ay);
      const k = d2 < 2 ? Y[j].k : X[i].k;
      let next = cost + len * (1 + COST.offCenter * k) + (d2 !== d ? COST.bend : 0);
      next += penalty({ x1: ax, y1: ay, x2: bx, y2: by }, routed, overlap);
      const ns = (nj * nx + ni) * 4 + d2;
      if (next < dist[ns]) {
        dist[ns] = next;
        prev[ns] = state;
        heap.push(next, ns);
      }
    }
  }
  if (reached < 0) return null;
  const points = [];
  for (let s = reached; s >= 0; s = prev[s]) {
    const p = s >> 2;
    points.push([X[p % nx].v, Y[Math.floor(p / nx)].v]);
  }
  points.reverse();
  return { points: simplify(points), cost: dist[reached] };
}

function hitsBox(ax, ay, bx, by, b, m) {
  const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
  const [y0, y1] = [Math.min(ay, by), Math.max(ay, by)];
  return x1 > b.x0 - m && x0 < b.x1 + m && y1 > b.y0 - m && y0 < b.y1 + m;
}

// 先に引いた線と交われば交差、同じ線の上を重なって走れば重なりとして数える。
// 線はどれも格子の線の上を通るので、交わる点は格子の点になる。区間の内側か、
// 入っていく側の端で交われば数える(通り抜ける点を、入る区間と出る区間で二重に数えない)
function penalty(seg, routed, withOverlap) {
  const a = line(seg);
  const [from, to] = a.horizontal ? [seg.x1, seg.x2] : [seg.y1, seg.y2];
  let sum = 0;
  for (const s of routed) {
    const b = line(s);
    if (a.horizontal === b.horizontal) {
      if (withOverlap && Math.abs(a.at - b.at) < 1 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 1) sum += COST.overlap;
      continue;
    }
    const meets = (b.at - from) * (b.at - to) < 0 || Math.abs(b.at - to) < 0.5;
    if (meets && a.at > b.lo + 0.5 && a.at < b.hi - 0.5) sum += COST.cross;
  }
  return sum;
}

// 区間を「向き・通る位置・範囲」に直す
function line({ x1, y1, x2, y2 }) {
  const horizontal = y1 === y2;
  return horizontal
    ? { horizontal, at: y1, lo: Math.min(x1, x2), hi: Math.max(x1, x2) }
    : { horizontal, at: x1, lo: Math.min(y1, y2), hi: Math.max(y1, y2) };
}

const segmentsOf = (points) => points.slice(1).map((p, i) => ({ x1: points[i][0], y1: points[i][1], x2: p[0], y2: p[1] }));

// 箱のすき間を通る道が無い線は描かずに止める(箱の上を横切る線は読めない)
function unreachable(edge, u, v, problems) {
  problems.push(`つながり「${edge.from} → ${edge.to}」を、箱を避けて引けませんでした。図を分けるか、箱を減らしてください`);
  return { points: [[u.xc, u.yc], [v.xc, v.yc]], cost: Infinity };
}

class Heap {
  items = [];
  get size() {
    return this.items.length;
  }
  push(cost, value) {
    const items = this.items;
    items.push([cost, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= cost) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const [l, r] = [i * 2 + 1, i * 2 + 2];
        let m = i;
        if (l < items.length && items[l][0] < items[m][0]) m = l;
        if (r < items.length && items[r][0] < items[m][0]) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- ラベル。長い区間の中ほどで、箱とほかのラベルに重ならないところ ----------
// ほかの線にもかからない場所があれば、そちらを先に選ぶ

function placeLabels(routes, boxes) {
  const placed = [];
  const H = 20;
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const grow = (r, m) => ({ x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m });
  const obstacles = [...boxes.values()].map((b) => grow(b, 4));
  const lines = routes.map(({ points }) =>
    segmentsOf(points).map((s) => ({ x0: Math.min(s.x1, s.x2), y0: Math.min(s.y1, s.y2), x1: Math.max(s.x1, s.x2), y1: Math.max(s.y1, s.y2) })),
  );
  return routes.map(({ edge, points }, index) => {
    if (!edge.label) return null;
    const w = labelWidth(edge.label);
    const segs = segmentsOf(points)
      .map((s) => ({ ...s, len: Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1), horizontal: s.y1 === s.y2 }))
      .sort((a, b) => b.len - a.len);
    const fits = segs.filter((s) => s.len >= (s.horizontal ? w + 12 : H + 12));
    const candidates = (fits.length ? fits : segs.slice(0, 1)).flatMap((s) =>
      [0.5, 0.35, 0.65, 0.25, 0.75].map((t) => [s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t]),
    );
    const rectAt = ([cx, cy]) => ({ x0: cx - w / 2, y0: cy - H / 2, x1: cx + w / 2, y1: cy + H / 2 });
    const others = lines.filter((_, i) => i !== index).flat();
    const clear = (c) => ![...obstacles, ...placed].some((o) => overlap(rectAt(c), o));
    const apart = (c) => !others.some((o) => overlap(grow(rectAt(c), 6), o));
    const at = candidates.find((c) => clear(c) && apart(c)) ?? candidates.find(clear) ?? candidates[0];
    placed.push(rectAt(at));
    return { at, rect: rectAt(at) };
  });
}
