// 処理の流れの図。既定は左から右。
// 段(rank)を流れの向き(p)に並べ、それと直交する向き(s)の位置(pos)で枝を振り分ける。
//
// 読みやすさの規則(線の交差を減らすのが理解にいちばん効き、曲がりの少なさが続く。Purchase 1997・2002):
// - 主な流れ(各箱から最初に書いた矢印の先)を、まっすぐな一本線で中央に通し、太く描く
// - 例外の枝は箱の上下(縦向きなら左右)の辺から出して、曲がりを1回にする
// - 分かれた2本がすぐ合流するときは、主な線を挟んで対称に置く
// - 線を交差させない。同じ箱へ入る線は口をずらし、曲がる位置も段違いにする
import { band, checkLabels, drawEdge, drawNode, labelRect, labelWidth, measureNodes, phasePill } from "../lib/draw.mjs";
import { METRICS } from "../lib/style.mjs";

const M = METRICS.margin;
const LANE_PAD = 20;
const LANE_GAP = 14;
const LANE_HEAD = 30;
const PHASE_HEAD = 44;
const ROW_GAP = 64; // 折り返した行と行のあいだ。改行の線が通る
const MAX_ROW_W = 1600; // 横向きで1行に収める幅。ページの全幅に載せたときに字が読める大きさ

// 箱の幅。縦一列の流れは箱を広く、レーンで列が増える図や横向きは細くする
export const cellOptions = (spec) => (spec.direction === "down" && !spec.lanes ? {} : { maxW: 200 });

// レーンのある横向きの図が広すぎるときは、縦のスイムレーン(レーンを列にして上から下)に切り替える。
// 切り替えたら、横向きで出た指摘は捨てる(同じ指摘が2回出ないように)
export function layout(spec, problems, forced) {
  const tried = [];
  const drawing = layoutOnce(spec, tried, forced);
  if (spec.lanes && !spec.direction && drawing.width > METRICS.maxCanvasW) return layoutOnce({ ...spec, direction: "down" }, problems, forced);
  problems.push(...tried);
  return drawing;
}

function layoutOnce(spec, problems, forced) {
  const down = spec.direction === "down";
  const nodes = spec.nodes;
  const edges = (spec.edges ?? []).map((e) => ({ ...e }));
  const cell = forced ?? measureNodes(nodes, problems, cellOptions(spec));
  const cellP = down ? cell.h : cell.w;
  const cellS = down ? cell.w : cell.h;
  const gapP = down ? 52 : 58;
  const gapS = down ? 40 : 34;
  const colS = cellS + gapS;

  const lanes = spec.lanes ?? [{ label: null, nodes: nodes.map((nd) => nd.id) }];
  const laneOf = new Map();
  lanes.forEach((lane, i) => lane.nodes.forEach((id) => laneOf.set(id, i)));
  const banded = Boolean(spec.lanes);
  const phaseOf = new Map();
  (spec.phases ?? [{ nodes: nodes.map((nd) => nd.id) }]).forEach((ph, i) => ph.nodes.forEach((id) => phaseOf.set(id, i)));

  const rank = assignRanks(nodes, edges, phaseOf, laneOf);
  const { pos, mainOut, sideChild, mergeOf } = assignPositions(nodes, edges, rank, laneOf);
  markMainPath(nodes, edges, mainOut, mergeOf, spec.colorMode);

  // ---------- 位置。p は流れの向き、s はそれと直交する向き ----------
  const pad = banded ? LANE_PAD : 0;
  const headP = banded && down ? LANE_HEAD : 0;
  const headS = banded && !down ? LANE_HEAD : 0;
  const phaseS = spec.phases ? (down ? Math.max(...spec.phases.map((ph) => labelWidth(ph.label))) + 24 : PHASE_HEAD) : 0;
  // 横向きで幅に収まらなければ、文章の改行のように次の行へ折り返す
  const pitch = cellP + gapP;
  const totalRanks = 1 + Math.max(...nodes.map((nd) => rank.get(nd.id)));
  // レーンのある図は折り返さない(折り返すとレーンが2組になり、1枚の格子として読めなくなる)
  const capacity = down || banded ? totalRanks : Math.max(1, Math.floor((MAX_ROW_W - 2 * M - 2 * pad + gapP) / pitch));
  const rowStarts = wrapRows(totalRanks, capacity, edges, rank, spec.phases ? phaseOf : null, nodes);
  // 1つの切れ目を3本以上の線がまたぐと、改行の線が入り組んで読めない
  const forwardEdges = edges.filter((e) => !e.back);
  for (const k of rowStarts.slice(1)) {
    const n = forwardEdges.filter((e) => rank.get(e.from) < k && rank.get(e.to) >= k).length;
    if (n >= 3) problems.push(`折り返すと、行の切れ目を ${n} 本の線がまたいで読みにくくなります。図を分けるか、箱を減らしてください`);
  }
  const rows = rowStarts.length;
  const rowOfRank = (r) => rowStarts.filter((start) => start <= r).length - 1;
  const ranksInRow = Math.max(...rowStarts.map((start, i) => (rowStarts[i + 1] ?? totalRanks) - start));

  // 行ごと・レーンごとの幅(s の向き)。縦向きでレーンが無ければ、主な流れを図の左右の中央に置く
  const rowNodes = (row, lane) => nodes.filter((nd) => laneOf.get(nd.id) === lane && rowOfRank(rank.get(nd.id)) === row);
  const rangeOf = (row, lane) => {
    const mine = rowNodes(row, lane).map((nd) => pos.get(nd.id));
    if (!mine.length) return [0, 0];
    if (banded || !down) return [Math.min(...mine), Math.max(...mine)];
    const span = Math.max(...mine.map(Math.abs));
    return [-span, span];
  };
  // その行に箱の無いレーンは、見出しだけの細い帯にする(レーンの並びは行をまたいで同じに保つ)
  const laneSize = (row, lane) => {
    if (banded && !rowNodes(row, lane).length) return headS + headP + 12;
    const [lo, hi] = rangeOf(row, lane);
    return pad * 2 + headS + (hi - lo) * colS + cellS;
  };
  const laneStart = []; // [行][レーン] → 行の始まりからの位置
  const blockS = [];
  for (let row = 0; row < rows; row++) {
    let cursor = phaseS;
    laneStart.push(lanes.map((_, i) => {
      const at = cursor;
      cursor += laneSize(row, i) + LANE_GAP;
      return at;
    }));
    blockS.push(cursor - LANE_GAP);
  }
  const blockStart = (row) => M + blockS.slice(0, row).reduce((sum, h) => sum + h + ROW_GAP, 0);

  const pOrigin = M + (rows > 1 ? 22 : 0); // 改行の線が左端を通る余白
  const pStart = (local) => pOrigin + headP + pad + local * pitch;
  const box = new Map(
    nodes.map((nd) => {
      const l = laneOf.get(nd.id);
      const r = rank.get(nd.id);
      const row = rowOfRank(r);
      const p0 = pStart(r - rowStarts[row]);
      const s0 = blockStart(row) + laneStart[row][l] + pad + headS + (pos.get(nd.id) - rangeOf(row, l)[0]) * colS;
      return [nd.id, { p0, p1: p0 + cellP, s0, s1: s0 + cellS, pc: p0 + cellP / 2, sc: s0 + cellS / 2, rank: r, row }];
    }),
  );
  const toXY = ([p, s]) => (down ? [s, p] : [p, s]);
  const gapAfter = (b) => b.p1 + gapP / 2;
  const gapBefore = (b) => b.p0 - gapP / 2;
  // 同じ行で、段 from より後ろ・to より前の箱のうち、s の位置に重なるものがあるか
  const blocked = (s, from, to, except, row) =>
    [...box.entries()].some(([id, b]) => !except.includes(id) && b.row === row && b.rank > from && b.rank < to && s > b.s0 - 6 && s < b.s1 + 6);
  const rowBlocked = (r, sa, sb, except) =>
    [...box.entries()].some(([id, b]) => !except.includes(id) && b.rank === r && b.s1 > Math.min(sa, sb) && b.s0 < Math.max(sa, sb));

  // ---------- 線の種類を決める ----------
  for (const e of edges) {
    const [u, v] = [box.get(e.from), box.get(e.to)];
    const ends = [e.from, e.to];
    if (e.back) e.kind = "back";
    else if (u.row !== v.row) e.kind = "wrap";
    else if (u.rank === v.rank) e.kind = "same";
    else if (sideChild.has(e) && Math.abs(v.sc - u.sc) > 1 && !rowBlocked(u.rank, u.sc, v.sc, ends) && !blocked(v.sc, u.rank, v.rank, ends, u.row)) e.kind = "side";
    else if (Math.abs(v.sc - u.sc) > 1 && v.rank > u.rank && !blocked(u.sc, u.rank, v.rank + 1, ends, u.row) && !rowBlocked(v.rank, u.sc, v.sc, ends)) e.kind = "into-side";
    else e.kind = "through";
  }

  // 改行の線が複数あるときは、下の箱から出る線ほど内側を通す(交差を減らす)
  const wrapOrder = new Map(
    edges.filter((e) => e.kind === "wrap").sort((x, y) => box.get(y.from).sc - box.get(x.from).sc).map((e, i) => [e, i]),
  );

  // ---------- 道筋 ----------
  const PORT = 14;
  const RUN = 8;
  const NONE = { out: 0, in: 0, outRun: 0, inRun: 0, side: 0 };
  let backCount = 0;
  const route = (edge, sh = NONE) => {
    const u = box.get(edge.from);
    const v = box.get(edge.to);
    const ends = [edge.from, edge.to];
    switch (edge.kind) {
      case "back": {
        const between = [...box.values()].filter((b) => b.rank >= v.rank && b.rank <= u.rank);
        const channel = Math.max(...between.map((b) => b.s1)) + gapS / 2 + 4 + backCount++ * 9;
        return [[u.pc, u.s1], [u.pc, channel], [v.pc, channel], [v.pc, v.s1]];
      }
      case "wrap": {
        // 改行の線: 段のすき間を下り、行と行のあいだを戻って、次の行の箱の手前から入る
        const k = wrapOrder.get(edge) * 8;
        const right = gapAfter(u) + k;
        const left = gapBefore(v) - k;
        const between = blockStart(u.row) + blockS[u.row] + ROW_GAP / 2 + k;
        const vs = v.sc + (edge.main ? 0 : PORT); // 主な線と同じ口に入らないように
        return [[u.p1, u.sc], [right, u.sc], [right, between], [left, between], [left, vs], [v.p0, vs]];
      }
      case "same": {
        const p = u.pc + sh.side;
        return v.s0 > u.s1 ? [[p, u.s1], [p, v.s0]] : [[p, u.s0], [p, v.s1]];
      }
      case "side": {
        // 箱の上下(縦向きなら左右)の辺から出て、1回だけ曲がって相手へ入る
        const edgeS = v.sc > u.sc ? u.s1 : u.s0;
        const p = u.pc + sh.side;
        return [[p, edgeS], [p, v.sc + sh.in], [v.p0, v.sc + sh.in]];
      }
      case "into-side": {
        // 主な線へ合流する枝は、相手の上下の辺へ1回だけ曲がって入る
        const edgeS = u.sc < v.sc ? v.s0 : v.s1;
        return [[u.p1, u.sc + sh.out], [v.pc + sh.side, u.sc + sh.out], [v.pc + sh.side, edgeS]];
      }
      default: {
        const us = u.sc + sh.out;
        const vs = v.sc + sh.in;
        if (v.rank === u.rank + 1) {
          const g = gapAfter(u) + sh.outRun + sh.inRun;
          return [[u.p1, us], [g, us], [g, vs], [v.p0, vs]];
        }
        if (!blocked(vs, u.rank, v.rank, ends, u.row)) {
          const g = gapAfter(u) + sh.outRun;
          return [[u.p1, us], [g, us], [g, vs], [v.p0, vs]];
        }
        if (!blocked(us, u.rank, v.rank, ends, u.row)) {
          const g = gapBefore(v) + sh.inRun;
          return [[u.p1, us], [g, us], [g, vs], [v.p0, vs]];
        }
        const channel = Math.max(u.s1, v.s1) + gapS / 2;
        const [g1, g2] = [gapAfter(u) + sh.outRun, gapBefore(v) + sh.inRun];
        return [[u.p1, us], [g1, us], [g1, channel], [g2, channel], [g2, vs], [v.p0, vs]];
      }
    }
  };

  // 出入り口をずらす。1回目に引いた線で、どちらへ曲がるかを調べてから決める
  const shifts = new Map(edges.map((e) => [e, { ...NONE }]));
  const through = edges.filter((e) => e.kind === "through");
  const turn = new Map(
    through.map((e) => {
      const pts = route(e);
      const [us, vs] = [box.get(e.from).sc, box.get(e.to).sc];
      const first = pts.find(([, sv]) => Math.abs(sv - us) > 0.5)?.[1] ?? us;
      const last = [...pts].reverse().find(([, sv]) => Math.abs(sv - vs) > 0.5)?.[1] ?? vs;
      return [e, { outDir: Math.sign(Math.round(first - us)), outDist: Math.abs(first - us), inDir: Math.sign(Math.round(last - vs)), inDist: Math.abs(last - vs) }];
    }),
  );
  const spread = (list, dirKey, distKey, shiftKey, runKey, outerFirst) => {
    if (list.length < 2) return;
    const hasStraight = list.some((e) => turn.get(e)[dirKey] === 0);
    const dirs = new Set(list.map((e) => turn.get(e)[dirKey]).filter(Boolean));
    for (const dir of dirs) {
      const group = list.filter((e) => turn.get(e)[dirKey] === dir).sort((a, b) => turn.get(a)[distKey] - turn.get(b)[distKey]);
      const startAt = hasStraight || dirs.size > 1 ? 1 : 0;
      const centered = (group.length - 1) / 2;
      group.forEach((e, k) => {
        shifts.get(e)[shiftKey] = dir * PORT * (k + startAt);
        shifts.get(e)[runKey] = RUN * (outerFirst ? centered - k : k - centered);
      });
    }
  };
  for (const nd of nodes) {
    spread(through.filter((e) => e.from === nd.id), "outDir", "outDist", "out", "outRun", true);
    spread(through.filter((e) => e.to === nd.id), "inDir", "inDist", "in", "inRun", false);
  }

  // 箱の上下(縦向きなら左右)の辺に出入りする線は、種類を問わず数えて、相手の位置の順に口をずらす
  const sideUse = new Map();
  const use = (id, side, edge, otherP, end) => {
    const key = `${id}|${side}`;
    if (!sideUse.has(key)) sideUse.set(key, []);
    sideUse.get(key).push({ edge, otherP, end });
  };
  for (const e of edges) {
    const [u, v] = [box.get(e.from), box.get(e.to)];
    if (e.kind === "side") use(e.from, v.sc > u.sc ? "s1" : "s0", e, v.pc, "from");
    if (e.kind === "into-side") use(e.to, u.sc < v.sc ? "s0" : "s1", e, u.pc, "to");
    if (e.kind === "same") {
      use(e.from, v.s0 > u.s1 ? "s1" : "s0", e, v.pc + 0.1, "from");
      use(e.to, v.s0 > u.s1 ? "s0" : "s1", e, u.pc + 0.1, "to");
    }
  }
  const sideShift = new Map();
  for (const list of sideUse.values()) {
    if (list.length < 2) continue;
    list.sort((x, y) => x.otherP - y.otherP);
    list.forEach((item, i) => {
      const off = (i - (list.length - 1) / 2) * 18;
      const prev = sideShift.get(item.edge);
      if (prev === undefined || Math.abs(off) > Math.abs(prev)) sideShift.set(item.edge, off);
    });
  }
  for (const [e, off] of sideShift) shifts.get(e).side = off;

  // ---------- ラベル。分かれ目のすぐ近くに置く ----------
  const branching = new Set(nodes.filter((nd) => edges.filter((e) => e.from === nd.id && !e.back).length > 1).map((nd) => nd.id));
  const routed = edges.map((edge) => {
    const pts = route(edge, shifts.get(edge));
    if (edge.label && branching.has(edge.from)) {
      const w = labelWidth(edge.label);
      if (edge.kind === "side") {
        const [, corner, end] = pts;
        const dir = Math.sign(end[0] - corner[0]) || 1;
        edge.labelXY = toXY([corner[0] + dir * (w / 2 + 14), corner[1]]);
      } else if (edge.kind === "through" && pts[0][1] === pts.at(-1)[1]) {
        // まっすぐ進む主な線: 線の上ではなく横に置く
        edge.labelXY = toXY(down ? [pts[0][0] + 18, pts[0][1] - w / 2 - 10] : [pts[0][0] + w / 2 + 12, pts[0][1] - 16]);
      }
    }
    return { edge, points: pts.map(toXY) };
  });
  const labeled = routed.filter(({ edge }) => edge.label).map(({ edge, points }) => ({ edge, rect: labelRect(edge, points) }));
  const boxRects = nodes.map((nd) => {
    const b = box.get(nd.id);
    const [x, y] = toXY([b.p0, b.s0]);
    return { x0: x, y0: y, x1: x + cell.w, y1: y + cell.h };
  });
  checkLabels(labeled, boxRects, problems);

  // ---------- 描く ----------
  const parts = { bands: [], phases: [], edges: [], nodes: [], labels: [] };
  let maxX = 0;
  let maxY = 0;
  const grow = (x, y) => {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const pEnd = pStart(ranksInRow - 1) + cellP + pad;
  for (let row = 0; row < rows; row++) {
    if (banded) {
      lanes.forEach((lane, i) => {
        const s0 = blockStart(row) + laneStart[row][i];
        const s1 = s0 + laneSize(row, i);
        const [x, y] = toXY([pOrigin, s0]);
        const [x2, y2] = toXY([pEnd, s1]);
        parts.bands.push(band(x, y, x2 - x, y2 - y, lane.label, [x + 16, y + 17]));
        grow(x2, y2);
      });
    }
    // 段階の見出しは、行ごとに、その行にある段の上へ置く
    for (const ph of spec.phases ?? []) {
      const rs = ph.nodes.map((id) => rank.get(id)).filter((r) => rowOfRank(r) === row);
      if (!rs.length) continue;
      const [a, b] = [pStart(Math.min(...rs) - rowStarts[row]), pStart(Math.max(...rs) - rowStarts[row]) + cellP];
      const [cx, cy] = toXY([(a + b) / 2, blockStart(row) + (down ? phaseS / 2 - 12 : PHASE_HEAD / 2 - 4)]);
      parts.phases.push(phasePill(ph.label, cx, cy));
    }
  }
  for (const nd of nodes) {
    const b = box.get(nd.id);
    const [x, y] = toXY([b.p0, b.s0]);
    parts.nodes.push(drawNode(nd, { x, y, w: cell.w, h: cell.h }, cell.info.get(nd), spec.colorMode, spec.lang));
    grow(x + cell.w, y + cell.h);
  }
  for (const { edge, points } of routed) {
    const { path, label } = drawEdge(points, edge);
    parts.edges.push(path);
    parts.labels.push(label);
    points.forEach(([x, y]) => grow(x, y));
  }
  for (const { rect } of labeled) grow(rect.x1, rect.y1);
  // 主な流れを中央に置いたぶんの余白を、反対側にも同じだけ取る
  const [sizeP, sizeS] = [pEnd + M, blockStart(rows - 1) + blockS[rows - 1] + M];
  const [w, h] = toXY([sizeP, sizeS]);
  return {
    width: Math.max(maxX + M, w),
    height: Math.max(maxY + M, h),
    body: [...parts.bands, ...parts.phases, ...parts.edges, ...parts.nodes, ...parts.labels].join(""),
    nodes,
  };
}

// 折り返す段: 1行に入る段数(capacity)を超えないように、行の長さをそろえつつ、
// またぐ線がいちばん少ない切れ目を選ぶ。段階(phases)があれば、段階の境目でだけ切る
function wrapRows(total, capacity, edges, rank, phaseOf, nodes) {
  // 1段ぶんのはみ出しなら折り返さない(1列だけの行は、折り返さないより読みにくい)
  if (total <= capacity + 1) return [0];
  const forward = edges.filter((e) => !e.back);
  const crossing = (k) => forward.filter((e) => rank.get(e.from) < k && rank.get(e.to) >= k).length;
  const allowed = (k) => !phaseOf || nodes.every((a) => nodes.every((b) => !(rank.get(a.id) === k - 1 && rank.get(b.id) === k) || phaseOf.get(a.id) !== phaseOf.get(b.id)));
  const starts = [0];
  let start = 0;
  while (total - start > capacity) {
    const rowsLeft = Math.ceil((total - start) / capacity);
    const ideal = start + Math.ceil((total - start) / rowsLeft);
    const earliest = total - capacity * (rowsLeft - 1); // これより前で切ると行が増える
    const pick = (from) => {
      let best = null;
      for (let k = from; k <= start + capacity; k++) {
        if (!allowed(k)) continue;
        // 短すぎる行(1行に入る段数の半分未満)を作らない
        const short = Math.min(k - start, total - k) < Math.ceil(capacity / 2) ? 4 : 0;
        const score = crossing(k) * 2 + Math.abs(k - ideal) * 1.5 + short;
        if (!best || score < best.score) best = { k, score };
      }
      return best?.k;
    };
    // 段階の境目が前のほうにしか無ければ、行が増えても境目で切る。
    // 1行に入らない段階は途中で切らず、次の境目まで行を延ばす(広すぎれば、図の幅の検査が指摘する)
    const next = pick(Math.max(start + 1, earliest)) ?? pick(start + 1) ?? nextAllowed(start + capacity + 1);
    if (next === undefined) break;
    start = next;
    starts.push(start);
  }
  return starts;

  function nextAllowed(from) {
    for (let k = from; k < total; k++) if (allowed(k)) return k;
  }
}

// 段: 戻る矢印を除いた最長の経路で決める。段階(phases)があれば、前の段階より後ろに置く
// 下(縦向きなら右)のレーンへ渡す線は、空いていれば同じ段のまま真下へ進む(Archify の受け渡しと同じ)
function assignRanks(nodes, edges, phaseOf, laneOf) {
  const out = new Map(nodes.map((nd) => [nd.id, []]));
  edges.forEach((e) => out.get(e.from).push(e));
  const state = new Map();
  const visit = (id) => {
    state.set(id, "open");
    for (const e of out.get(id)) {
      if (state.get(e.to) === "open" || phaseOf.get(e.to) < phaseOf.get(e.from)) e.back = true;
      else if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, "done");
  };
  nodes.forEach((nd) => state.has(nd.id) || visit(nd.id));

  const rank = new Map();
  const forward = edges.filter((e) => !e.back);
  const phases = [...new Set(nodes.map((nd) => phaseOf.get(nd.id)))].sort((a, b) => a - b);
  let base = 0;
  for (const ph of phases) {
    const mine = nodes.filter((nd) => phaseOf.get(nd.id) === ph).map((nd) => nd.id);
    const indeg = new Map(mine.map((id) => [id, forward.filter((e) => e.to === id && phaseOf.get(e.from) === ph).length]));
    const queue = mine.filter((id) => indeg.get(id) === 0);
    while (queue.length) {
      const id = queue.shift();
      const lane = laneOf.get(id);
      const preds = forward.filter((e) => e.to === id && rank.has(e.from));
      const stepOf = (e) => (laneOf.get(e.from) < lane ? 0 : 1);
      let r = Math.max(base, ...preds.map((e) => rank.get(e.from) + stepOf(e)));
      // 真下へ渡すときは、間のレーンと渡し先の同じ段が空いているときだけ
      const handoff = preds.filter((e) => stepOf(e) === 0 && rank.get(e.from) === r);
      const occupied = (from, to) => [...rank.entries()].some(([other, rr]) => rr === r && laneOf.get(other) > from && laneOf.get(other) <= to);
      if (handoff.length && handoff.every((e) => occupied(laneOf.get(e.from), lane))) r += 1;
      rank.set(id, r);
      for (const e of out.get(id).filter((x) => !x.back && phaseOf.get(x.to) === ph)) {
        indeg.set(e.to, indeg.get(e.to) - 1);
        if (indeg.get(e.to) === 0) queue.push(e.to);
      }
    }
    base = 1 + Math.max(...mine.map((id) => rank.get(id)));
  }
  return rank;
}

// 位置: 主な子は親と同じ位置、ほかの子は下(縦向きなら右)へ。すぐ合流する2本は上下に対称に振り分ける
function assignPositions(nodes, edges, rank, laneOf) {
  const forward = edges.filter((e) => !e.back);
  // 先へ進む線(段が進むもの、または同じ段で別のレーンへ渡すもの)
  const outs = (id) => forward.filter((e) => e.from === id && (rank.get(e.to) > rank.get(id) || laneOf.get(e.to) !== laneOf.get(id)));
  const ins = (id) => forward.filter((e) => e.to === id);
  const mainOut = new Map(nodes.map((nd) => [nd.id, outs(nd.id)[0]]));
  const sameLane = (a, b) => laneOf.get(a) === laneOf.get(b);

  const symmetric = new Map(); // 子の id → -1 / +1
  const mergeParent = new Map(); // 合流先の id → 分かれ目の id
  for (const nd of nodes) {
    const o = outs(nd.id);
    if (o.length !== 2) continue;
    const kids = o.map((e) => e.to);
    const merge = kids.map((k) => outs(k)[0]?.to);
    const ok =
      merge[0] &&
      merge[0] === merge[1] &&
      kids.every((k) => ins(k).length === 1 && rank.get(k) === rank.get(nd.id) + 1 && outs(k).length === 1 && sameLane(k, nd.id)) &&
      rank.get(merge[0]) === rank.get(nd.id) + 2 &&
      sameLane(merge[0], nd.id);
    if (!ok) continue;
    symmetric.set(kids[0], -1);
    symmetric.set(kids[1], 1);
    mergeParent.set(merge[0], nd.id);
  }

  const sideChild = new Set(forward.filter((e) => mainOut.get(e.from) !== e || symmetric.has(e.to)));
  const pos = new Map();
  const byRank = [...new Set(nodes.map((nd) => rank.get(nd.id)))].sort((a, b) => a - b);
  for (const r of byRank) {
    const here = nodes
      .map((nd, index) => ({ id: nd.id, index }))
      .filter(({ id }) => rank.get(id) === r)
      .map((item) => ({ ...item, want: desired(item.id) }))
      .sort((a, b) => a.want - b.want || a.index - b.index);
    // 同じ段・同じレーンで重なったら、外側へずらす
    const placed = [];
    for (const item of here) {
      let p = item.want;
      while (placed.some((q) => sameLane(q.id, item.id) && Math.abs(q.p - p) < 1)) p += p < 0 ? -1 : 1;
      placed.push({ id: item.id, p });
      pos.set(item.id, p);
    }
  }
  const mergeOf = new Map([...mergeParent].map(([merge, split]) => [split, merge]));
  return { pos, mainOut: new Map([...mainOut].map(([k, e]) => [k, e?.to])), sideChild, mergeOf };

  function desired(id) {
    if (mergeParent.has(id)) return pos.get(mergeParent.get(id));
    if (symmetric.has(id)) return pos.get(ins(id)[0].from) + symmetric.get(id);
    const preds = ins(id).filter((e) => pos.has(e.from) && sameLane(e.from, id));
    const main = preds.find((e) => mainOut.get(e.from) === e);
    if (main) return pos.get(main.from);
    if (!preds.length) return 0;
    const parent = preds[0].from;
    const k = outs(parent).filter((e) => mainOut.get(parent) !== e).findIndex((e) => e.to === id);
    return pos.get(parent) + 1 + Math.max(k, 0);
  }
}

// 最初の箱から主な子をたどり、その線を太く描く。対称に分かれたところは、合流先へ飛ぶ
function markMainPath(nodes, edges, mainOut, mergeOf, colorMode) {
  const seen = new Set();
  let id = nodes[0]?.id;
  while (id && !seen.has(id)) {
    seen.add(id);
    if (mergeOf.has(id)) {
      id = mergeOf.get(id);
      continue;
    }
    const next = mainOut.get(id);
    const edge = edges.find((e) => e.from === id && e.to === next && !e.back);
    if (!edge) break;
    edge.main = true;
    if (colorMode !== "change") edge.tone = "main";
    id = next;
  }
}
