// 見た目の正本。図の JSON は色も形も書かず、役割(role)と変更(change)だけを書く。
// 色を変えたいときは、ここだけを直す。

// 役割。読み手が見分けたいものに絞る。name は日本語、en は英語の図の凡例
export const ROLES = {
  user: { name: "利用者", en: "User", fill: "#f1f3f5", stroke: "#5f6b7a", shape: "terminal", icon: "user" },
  screen: { name: "画面", en: "Screen", fill: "#e8f2fc", stroke: "#2979bf", shape: "step", icon: "screen" },
  process: { name: "処理", en: "Process", fill: "#e7f8e9", stroke: "#119a37", shape: "step", icon: "gear" },
  decision: { name: "判断", en: "Decision", fill: "#fff6d9", stroke: "#c48a00", shape: "decision", icon: "diamond" },
  data: { name: "データ", en: "Data", fill: "#f1ebfb", stroke: "#7a4fc9", shape: "store", icon: "db" },
  output: { name: "出力・通知", en: "Output", fill: "#e5f6f4", stroke: "#138a83", shape: "step", icon: "doc" },
  external: { name: "外部", en: "External", fill: "#ffffff", stroke: "#8a94a3", shape: "step", icon: "external", dashed: true },
};

// 変更の印。1つでも付いていれば、色は役割ではなく変更で塗る(何が変わるかを見せる図なので)
export const CHANGES = {
  same: { name: "変わらない", en: "Unchanged", fill: "#ffffff", stroke: "#9aa4ae" },
  new: { name: "新規", en: "New", fill: "#e7f8e9", stroke: "#119a37", badge: "新規" },
  changed: { name: "変更", en: "Changed", fill: "#fff3e0", stroke: "#d97800", badge: "変更" },
  removed: { name: "削除", en: "Removed", fill: "#fdeceb", stroke: "#d93025", badge: "削除", dashed: true },
};

export const EDGE_TONES = {
  default: "#7b8794",
  main: "#0f7f6e",
  new: "#119a37",
  changed: "#d97800",
  removed: "#d93025",
};

export const THEMES = {
  plain: { bg: "#ffffff", grid: null, lane: "#f6f8fa", laneStroke: "#c9d1d9" },
  grid: { bg: "#f7f9fc", grid: "#e8edf3", lane: "#eef3f8", laneStroke: "#b9c6d3" },
};

export const FONT = `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic", "Segoe UI", sans-serif`;

export const LEGEND_TITLE = { ja: "凡例", en: "Legend" };

// 比較の図の枠。前は落ち着いた灰、後は新規と同じ緑
export const PANELS = {
  before: { label: "Before｜現在", en: "Before", color: "#6b7682" },
  after: { label: "After｜変更後", en: "After", color: "#119a37" },
};

export const METRICS = {
  margin: 28, // 図のまわりの余白
  titlePx: 19,
  titleLine: 26,
  captionPx: 13,
  captionLine: 19,
  legendPx: 12,
  badgePx: 11,
  labelPx: 15,
  labelLine: 21,
  subPx: 12.5,
  subLine: 17,
  padX: 26, // 左上のアイコンと重ならない幅
  padY: 14,
  minW: 150,
  maxW: 280,
  maxLabelLines: 2,
  maxSubLines: 2,
  edgeLabelPx: 12,
  maxCanvasW: 2400, // これを超える図は作らない。画像を拡大しても全体を見渡せなくなる
};

export function css(themeName) {
  const theme = THEMES[themeName] ?? THEMES.plain;
  const tone = (name, { fill, stroke }) => `.t-${name}{--fill:${fill};--stroke:${stroke}}`;
  return [
    `svg{font-family:${FONT}}`,
    `.bg{fill:${theme.bg}}`,
    `.gridline{stroke:${theme.grid ?? "none"};stroke-width:1}`,
    `.lane{fill:${theme.lane};stroke:${theme.laneStroke};stroke-width:1.2;stroke-dasharray:6 5}`,
    `.lane-label{font-size:13px;font-weight:700;fill:#5b6673;letter-spacing:.02em}`,
    `.shape{fill:var(--fill);stroke:var(--stroke);stroke-width:1.9}`,
    `.dashed .shape{stroke-dasharray:6 4}`,
    `.icon{fill:none;stroke:var(--stroke);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}`,
    `.label{font-size:${METRICS.labelPx}px;font-weight:700;fill:#1f2933;letter-spacing:.01em}`,
    `.sub{font-size:${METRICS.subPx}px;fill:#5b6673}`,
    `.removed .label,.removed .sub{text-decoration:line-through;fill:#8a5a57}`,
    `.badge rect{fill:var(--stroke)}`,
    `.badge text{font-size:${METRICS.badgePx}px;font-weight:700;fill:#fff}`,
    `.edge{fill:none;stroke-width:1.7;stroke-linejoin:round}`,
    `.edge.main{stroke-width:2.6}`,
    `.phase rect{fill:#ffffff;stroke:#d5dce3;stroke-width:1}`,
    `.phase text{font-size:13px;font-weight:700;fill:#3e4852;letter-spacing:.04em}`,
    `.edge.dashed{stroke-dasharray:6 5}`,
    `.edge-label rect{fill:#ffffff;stroke:#e1e6eb;stroke-width:1}`,
    `.edge-label text{font-size:${METRICS.edgeLabelPx}px;font-weight:600}`,
    `.title{font-size:${METRICS.titlePx}px;font-weight:700;fill:#111}`,
    `.caption{font-size:${METRICS.captionPx}px;fill:#5b6673}`,
    `.legend-title{font-size:${METRICS.legendPx}px;font-weight:700;fill:#5b6673}`,
    `.legend-text{font-size:${METRICS.legendPx}px;fill:#3e4852}`,
    `.panel{fill:none;stroke:#d5dce3;stroke-width:1.2}`,
    `.panel-head text{font-size:14px;font-weight:700;fill:#fff}`,
    ...Object.entries(ROLES).map(([k, v]) => tone(`role-${k}`, v)),
    ...Object.entries(CHANGES).map(([k, v]) => tone(`change-${k}`, v)),
  ].join("\n");
}
