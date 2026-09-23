import type { SlideLayout } from "../schema/deck";

const Wave = () => (
  <svg
    className="ds-wave"
    viewBox="0 0 1280 720"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <path
      className="ds-wave__back"
      d="M0 470 C 240 410, 480 560, 760 500 S 1160 400, 1280 440 L 1280 720 L 0 720 Z"
    />
    <path
      className="ds-wave__front"
      d="M0 580 C 300 520, 560 650, 860 590 S 1180 540, 1280 560 L 1280 720 L 0 720 Z"
    />
  </svg>
);

// 手描きの枠。ゆがめた線を2度なぞる。PPTX には撮った画像として入る
const Sketch = () => (
  <svg
    className="ds-sketch"
    viewBox="0 0 1280 720"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <path
      className="ds-sketch__line"
      d="M28 30 C 320 22, 640 34, 1250 26 C 1256 240, 1246 480, 1254 694 C 900 700, 420 688, 26 696 C 20 480, 34 240, 28 30 Z"
    />
    <path
      className="ds-sketch__line"
      d="M24 26 C 400 34, 800 22, 1256 32 C 1248 300, 1258 500, 1250 690 C 800 684, 400 698, 30 692 C 36 500, 22 300, 24 26 Z"
    />
  </svg>
);

// テンプレートの専用の CSS が描く飾りの形。既定の CSS では出さない。
// 疑似要素と違い、PPTX にも箱(塗りと線)として出る
const Shapes = () => (
  <>
    <div className="ds-decoration__shape ds-decoration__shape--1" />
    <div className="ds-decoration__shape ds-decoration__shape--2" />
    <div className="ds-decoration__shape ds-decoration__shape--3" />
    <div className="ds-decoration__shape ds-decoration__shape--4" />
    <div className="ds-decoration__shape ds-decoration__shape--5" />
    <div className="ds-decoration__shape ds-decoration__shape--6" />
  </>
);

const LayoutDecoration = ({ layout }: { layout: SlideLayout }) =>
  layout === "cover" || layout === "closing" ? (
    <Wave />
  ) : layout === "section" ? (
    <div className="ds-accent-bar" />
  ) : null;

// 表紙と締めのウェーブ、中扉の縦線はテンプレートの装飾。JSON には持たせない
export const SlideDecoration = ({ layout }: { layout: SlideLayout }) => (
  <div className="ds-decoration">
    <Shapes />
    <Sketch />
    <LayoutDecoration layout={layout} />
  </div>
);
