// SVG の部品。座標を受け取って文字列を返すだけで、配置は決めない。
import { CHANGES, EDGE_TONES, LEGEND_TITLE, METRICS, ROLES, THEMES, css } from "./style.mjs";
import { textWidth, wrap } from "./text.mjs";

export class DiagramError extends Error {
  constructor(problems) {
    super(problems.map((p) => `- ${p}`).join("\n"));
    this.problems = problems;
  }
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (v) => Math.round(v * 10) / 10;

// ---------- 箱の大きさ ----------

// 全部の箱を同じ大きさにそろえる(格子に並ぶと、目が線を追いやすい)
export function measureNodes(nodes, problems, { maxW = METRICS.maxW } = {}) {
  const { labelPx, subPx, padX, padY, minW, maxLabelLines, maxSubLines, labelLine, subLine } = METRICS;
  const inner = maxW - padX * 2;
  const info = new Map();
  let widest = 0;
  let maxLabel = 1;
  let maxSub = 0;
  let extra = 0;
  for (const node of nodes) {
    if (["terminal", "decision"].includes((ROLES[node.role] ?? ROLES.process).shape)) extra = 28;
    const labelLines = wrap(node.label, labelPx, inner);
    const subLines = node.sub ? wrap(node.sub, subPx, inner) : [];
    if (labelLines.length > maxLabelLines)
      problems.push(`「${node.label}」が長すぎます。${maxLabelLines}行(1行およそ${Math.floor(inner / labelPx)}字)に収めてください`);
    if (subLines.length > maxSubLines)
      problems.push(`「${node.sub}」(補足)が長すぎます。${maxSubLines}行に収めてください`);
    widest = Math.max(widest, ...labelLines.map((l) => textWidth(l, labelPx)), ...subLines.map((l) => textWidth(l, subPx)));
    maxLabel = Math.max(maxLabel, labelLines.length);
    maxSub = Math.max(maxSub, subLines.length);
    info.set(node, { labelLines, subLines });
  }
  const w = Math.min(maxW + extra, Math.max(minW, Math.ceil(widest + padX * 2 + extra)));
  const h = padY * 2 + maxLabel * labelLine + (maxSub ? 4 + maxSub * subLine : 0);
  return { w, h: Math.max(h, 56), info };
}

// ---------- 箱 ----------

export function drawNode(node, box, lines, colorMode, lang = "ja") {
  const role = ROLES[node.role] ?? ROLES.process;
  const change = CHANGES[node.change ?? "same"];
  const tone = colorMode === "change" ? `t-change-${node.change ?? "same"}` : `t-role-${node.role ?? "process"}`;
  const classes = ["node", tone];
  if (role.dashed || change.dashed) classes.push("dashed");
  if (node.change === "removed") classes.push("removed");

  const { x, y, w, h } = box;
  const parts = [shape(role.shape, x, y, w, h)];
  const iconAt = role.shape === "terminal" || role.shape === "decision" ? [x + 12, y + h / 2 - 6.5] : [x + 9, y + (role.shape === "store" ? 12 : 8)];
  parts.push(icon(role.icon, ...iconAt));
  parts.push(texts(lines, x + w / 2, y, h));
  if (change.badge) parts.push(badge(lang === "en" ? change.en : change.badge, x + w, y));
  return `<g class="${classes.join(" ")}" data-id="${esc(node.id)}">${parts.join("")}</g>`;
}

function shape(kind, x, y, w, h) {
  switch (kind) {
    case "terminal":
      return `<rect class="shape" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}"/>`;
    case "decision": {
      const k = 16;
      const pts = [[x + k, y], [x + w - k, y], [x + w, y + h / 2], [x + w - k, y + h], [x + k, y + h], [x, y + h / 2]];
      return `<polygon class="shape" points="${pts.map(([a, b]) => `${n(a)},${n(b)}`).join(" ")}"/>`;
    }
    case "store": {
      const ry = 7;
      const body = `M${n(x)},${n(y + ry)} A${n(w / 2)},${ry} 0 0 1 ${n(x + w)},${n(y + ry)} V${n(y + h - ry)} A${n(w / 2)},${ry} 0 0 1 ${n(x)},${n(y + h - ry)} Z`;
      const rim = `M${n(x)},${n(y + ry)} A${n(w / 2)},${ry} 0 0 0 ${n(x + w)},${n(y + ry)}`;
      return `<path class="shape" d="${body}"/><path class="shape" style="fill:none" d="${rim}"/>`;
    }
    default:
      return `<rect class="shape" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="10"/>`;
  }
}

const ICONS = {
  user: `<circle cx="6.5" cy="3.8" r="2.6"/><path d="M1.5 12.5c0-3.4 2.3-4.9 5-4.9s5 1.5 5 4.9"/>`,
  screen: `<rect x="0.5" y="1.5" width="12" height="10" rx="1.6"/><path d="M0.5 4.6h12"/>`,
  gear: `<path d="M5.4 0.8h2.2l.4 1.7 1.3.6 1.5-.9 1.6 1.6-.9 1.5.6 1.3 1.7.4v2.2l-1.7.4-.6 1.3.9 1.5-1.6 1.6-1.5-.9-1.3.6-.4 1.7H5.4L5 11.2l-1.3-.6-1.5.9L.6 9.9l.9-1.5-.6-1.3L-.8 6.7V4.5L.9 4.1l.6-1.3L.6 1.3 2.2-.3l1.5.9L5 .1z" transform="translate(.6 .6) scale(.9)"/><circle cx="6.5" cy="6.5" r="1.9"/>`,
  diamond: `<path d="M6.5 1l5.5 5.5-5.5 5.5L1 6.5z"/>`,
  db: `<ellipse cx="6.5" cy="3" rx="5" ry="2"/><path d="M1.5 3v7c0 1.2 2.2 2 5 2s5-.8 5-2V3M1.5 6.5c0 1.2 2.2 2 5 2s5-.8 5-2"/>`,
  doc: `<path d="M2.5.8h6l2.5 2.5v8.9H2.5zM8.5.8v2.5H11M4.5 6.5H9M4.5 9H9"/>`,
  external: `<path d="M7.5 1H12v4.5M12 1L6.5 6.5M10.5 8v4H1V2.5h4"/>`,
};

const icon = (name, x, y) => `<g class="icon" transform="translate(${n(x)} ${n(y)})">${ICONS[name] ?? ""}</g>`;

function texts({ labelLines, subLines }, cx, y, h) {
  const { labelLine, subLine } = METRICS;
  const total = labelLines.length * labelLine + (subLines.length ? 4 + subLines.length * subLine : 0);
  let cursor = y + (h - total) / 2;
  const out = [];
  for (const line of labelLines) {
    out.push(`<text class="label" x="${n(cx)}" y="${n(cursor + labelLine / 2)}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`);
    cursor += labelLine;
  }
  if (subLines.length) cursor += 4;
  for (const line of subLines) {
    out.push(`<text class="sub" x="${n(cx)}" y="${n(cursor + subLine / 2)}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`);
    cursor += subLine;
  }
  return out.join("");
}

function badge(text, right, top) {
  const w = textWidth(text, METRICS.badgePx) + 14;
  const x = right - w - 10;
  return `<g class="badge"><rect x="${n(x)}" y="${n(top - 9)}" width="${n(w)}" height="18" rx="9"/><text x="${n(x + w / 2)}" y="${n(top)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text></g>`;
}

// ---------- 線 ----------

export function roundedPath(points, radius = 9) {
  const pts = simplify(points);
  let d = `M${n(pts[0][0])},${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const r = Math.min(radius, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2);
    const a = toward(cx, cy, px, py, r);
    const b = toward(cx, cy, nx, ny, r);
    d += ` L${n(a[0])},${n(a[1])} Q${n(cx)},${n(cy)} ${n(b[0])},${n(b[1])}`;
  }
  const last = pts.at(-1);
  return `${d} L${n(last[0])},${n(last[1])}`;
}

const toward = (x, y, tx, ty, r) => {
  const len = Math.hypot(tx - x, ty - y) || 1;
  return [x + ((tx - x) / len) * r, y + ((ty - y) / len) * r];
};

// 同じ点と、一直線上の途中の点を除く
export function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const [a, b] = [out[i - 1], out[i + 1]];
    return !((Math.abs(a[0] - p[0]) < 0.5 && Math.abs(b[0] - p[0]) < 0.5) || (Math.abs(a[1] - p[1]) < 0.5 && Math.abs(b[1] - p[1]) < 0.5));
  });
}

export function drawEdge(points, edge) {
  const tone = EDGE_TONES[edge.change] ? edge.change : edge.tone ?? "default";
  const dashed = edge.change === "removed" || edge.back;
  const cls = ["edge", dashed && "dashed", edge.main && "main"].filter(Boolean).join(" ");
  const path = `<path class="${cls}" d="${roundedPath(points)}" stroke="${EDGE_TONES[tone]}" marker-end="url(#arrow-${tone})"/>`;
  if (!edge.label) return { path, label: "" };
  const { cx, cy } = labelRect(edge, points);
  return { path, label: labelAt(edge.label, [cx, cy], EDGE_TONES[tone]) };
}

// つながりのラベルの枠。置き場所(labelXY)が無ければ、いちばん長い区間の中ほどに置く
export function labelRect(edge, points) {
  if (edge.labelXY) return rectAround(edge.label, edge.labelXY);
  const pts = simplify(points);
  let best = [pts[0], pts[1]];
  let bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bestLen) [best, bestLen] = [[pts[i], pts[i + 1]], len];
  }
  const cx = (best[0][0] + best[1][0]) / 2;
  const cy = (best[0][1] + best[1][1]) / 2;
  return rectAround(edge.label, [cx, cy]);
}

const rectAround = (text, [cx, cy]) => {
  const w = labelWidth(text);
  return { cx, cy, x0: cx - w / 2, y0: cy - 10, x1: cx + w / 2, y1: cy + 10 };
};

// 箱の中の字に重なるラベルは読めないので、短くするよう指摘する。枠に少しかかるだけなら読めるので、余白(padX・padY)の内側だけを見る
export function checkLabels(labeled, boxes, problems) {
  const { padX, padY } = METRICS;
  const inner = boxes.map((b) => ({ x0: b.x0 + padX, y0: b.y0 + padY, x1: b.x1 - padX, y1: b.y1 - padY }));
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const { edge, rect } of labeled)
    if (inner.some((b) => overlap(rect, b))) problems.push(`つながり「${edge.from} → ${edge.to}」のラベル「${edge.label}」が、箱の中の字に重なります。ラベルを短くしてください`);
}

export const labelWidth = (text) => textWidth(text, METRICS.edgeLabelPx) + 14;

function labelAt(text, [cx, cy], color) {
  const w = labelWidth(text);
  return `<g class="edge-label"><rect x="${n(cx - w / 2)}" y="${n(cy - 10)}" width="${n(w)}" height="20" rx="6"/><text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" fill="${color}">${esc(text)}</text></g>`;
}

function markers() {
  return Object.entries(EDGE_TONES)
    .map(
      ([tone, color]) =>
        `<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="9.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0.8 L10,5 L0,9.2 z" fill="${color}"/></marker>`,
    )
    .join("");
}

// ---------- 囲み・見出し・凡例 ----------

// レーンと囲みの帯。見出しは左上に置く
export const band = (x, y, w, h, label, [lx, ly]) =>
  `<rect class="lane" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="12"/>` +
  `<text class="lane-label" x="${n(lx)}" y="${n(ly)}" dominant-baseline="central">${esc(label)}</text>`;

// 流れの図の段階の見出し
export function phasePill(label, cx, cy) {
  const w = labelWidth(label) + 18;
  return `<g class="phase"><rect x="${cx - w / 2}" y="${cy - 13}" width="${w}" height="26" rx="13"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text></g>`;
}

// 比較の図の枠。見出しの帯の下に、片側の図を置く
export function panel({ body, width }, { label, color }, x, y, panelW, h, headH) {
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect class="panel" width="${panelW}" height="${h}" rx="14"/>` +
    `<g class="panel-head"><path d="M0 14a14 14 0 0 1 14-14h${panelW - 28}a14 14 0 0 1 14 14v${headH - 14}H0z" fill="${color}"/><text x="18" y="${headH / 2}" dominant-baseline="central">${esc(label)}</text></g>` +
    `<g transform="translate(${(panelW - width) / 2} ${headH})">${body}</g></g>`
  );
}

// 比較の図の、前から後へ向かう印
export function chevron(x, y, dir, color) {
  const d = dir === "right" ? `M${x - 9} ${y - 14}L${x + 7} ${y}L${x - 9} ${y + 14}` : `M${x - 14} ${y - 9}L${x} ${y + 7}L${x + 14} ${y - 9}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// 題と説明。どちらも幅で折り返す
export function header(title, caption, width, x = METRICS.margin, y = 26) {
  const { titlePx, titleLine, captionPx, captionLine } = METRICS;
  let svg = "";
  const titles = wrap(title, titlePx, width - x * 2);
  titles.forEach((line, i) => {
    svg += `<text class="title" x="${x}" y="${y + 12 + i * titleLine}" dominant-baseline="central">${esc(line)}</text>`;
  });
  let h = 30 + (titles.length - 1) * titleLine;
  const lines = wrap(caption, captionPx, width - x * 2);
  lines.forEach((line, i) => {
    svg += `<text class="caption" x="${x}" y="${y + h + 9 + i * captionLine}" dominant-baseline="central">${esc(line)}</text>`;
  });
  h += lines.length * captionLine;
  return { svg, height: h + 18 };
}

// 使った役割・変更だけを並べる
export function legend(entries, x, y, maxWidth, lang = "ja") {
  if (!entries.length) return { svg: "", height: 0 };
  const title = LEGEND_TITLE[lang];
  const start = x + textWidth(title, METRICS.legendPx) + 16;
  let svg = `<text class="legend-title" x="${x}" y="${y + 8}" dominant-baseline="central">${title}</text>`;
  let cx = start;
  let cy = y;
  for (const { tone, name, dashed } of entries) {
    const w = 26 + textWidth(name, METRICS.legendPx) + 22;
    if (cx + w > x + maxWidth) {
      cx = start;
      cy += 24;
    }
    svg += `<g class="${tone}${dashed ? " dashed" : ""}"><rect class="shape" x="${n(cx)}" y="${n(cy + 1)}" width="20" height="14" rx="4"/></g>`;
    svg += `<text class="legend-text" x="${n(cx + 26)}" y="${n(cy + 8)}" dominant-baseline="central">${esc(name)}</text>`;
    cx += w;
  }
  return { svg, height: cy - y + 24 };
}

export function legendEntries(nodes, colorMode, lang = "ja") {
  const nameOf = (v) => (lang === "en" ? v.en : v.name);
  if (colorMode === "change") {
    const used = new Set(nodes.map((nd) => nd.change ?? "same"));
    return Object.entries(CHANGES)
      .filter(([k]) => used.has(k))
      .map(([k, v]) => ({ tone: `t-change-${k}`, name: nameOf(v), dashed: v.dashed }));
  }
  const used = new Set(nodes.map((nd) => nd.role ?? "process"));
  return Object.entries(ROLES)
    .filter(([k]) => used.has(k))
    .map(([k, v]) => ({ tone: `t-role-${k}`, name: nameOf(v), dashed: v.dashed }));
}

export function colorModeOf(nodes) {
  return nodes.some((nd) => nd.change && nd.change !== "same") ? "change" : "role";
}

// ---------- 文書 ----------

export function svgDocument({ width, height, body, theme = "plain", title, caption }) {
  const t = THEMES[theme] ?? THEMES.plain;
  const grid = t.grid
    ? `<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path class="gridline" d="M24 0H0V24" fill="none"/></pattern>`
    : "";
  const W = Math.ceil(width);
  const H = Math.ceil(height);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`,
    title ? `<title>${esc(title)}</title>` : "",
    caption ? `<desc>${esc(caption)}</desc>` : "",
    `<style>${css(theme)}</style>`,
    `<defs>${markers()}${grid}</defs>`,
    `<rect class="bg" width="${W}" height="${H}"/>`,
    t.grid ? `<rect width="${W}" height="${H}" fill="url(#grid)"/>` : "",
    body,
    `</svg>`,
  ].join("");
}
