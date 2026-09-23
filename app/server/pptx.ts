import PptxGenJS from "pptxgenjs";
import type {
  MeasuredBox,
  MeasuredCell,
  MeasuredItem,
  MeasuredLine,
  MeasuredRect,
  MeasuredSides,
  MeasuredSlide,
  MeasuredTable,
  MeasuredText,
} from "../src/renderer/measure.ts";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../src/schema/deck.ts";

// 実測した px を PPTX の単位へ直す。1px = 1/96 インチ、1px = 0.75pt
const PX_PER_INCH = 96;
const inches = (px: number): number => px / PX_PER_INCH;
const points = (px: number): number => px * 0.75;

// 相手の環境に無ければ代替される。画面と同じ書体を指定する
const FONT_FACE = "Noto Sans JP";

type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

const position = (rect: MeasuredRect) => ({
  x: inches(rect.x),
  y: inches(rect.y),
  w: inches(rect.w),
  h: inches(rect.h),
});

// 辺ごとに違う枠は、その辺の幅の細い塗りの箱で描く。CSS と同じく枠は箱の内側に入る。
// 回した箱では、辺の箱の中心を箱の中心のまわりに回し、同じ角度を付ける
export const sideRects = (
  item: MeasuredBox,
): (MeasuredRect & { color: string; rotate?: number })[] => {
  const [top, right, bottom, left] = item.sides ?? [];
  const rects: (MeasuredRect & { color: string })[] = [
    ...(top
      ? [{ x: item.x, y: item.y, w: item.w, h: top.width, color: top.color }]
      : []),
    ...(right
      ? [
          {
            x: item.x + item.w - right.width,
            y: item.y,
            w: right.width,
            h: item.h,
            color: right.color,
          },
        ]
      : []),
    ...(bottom
      ? [
          {
            x: item.x,
            y: item.y + item.h - bottom.width,
            w: item.w,
            h: bottom.width,
            color: bottom.color,
          },
        ]
      : []),
    ...(left
      ? [{ x: item.x, y: item.y, w: left.width, h: item.h, color: left.color }]
      : []),
  ];
  const degrees = item.rotate;
  if (!degrees) return rects;
  const radians = (degrees * Math.PI) / 180;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  return rects.map((rect) => {
    const dx = rect.x + rect.w / 2 - cx;
    const dy = rect.y + rect.h / 2 - cy;
    const mx = cx + dx * Math.cos(radians) - dy * Math.sin(radians);
    const my = cy + dx * Math.sin(radians) + dy * Math.cos(radians);
    return { ...rect, x: mx - rect.w / 2, y: my - rect.h / 2, rotate: degrees };
  });
};

const addBox = (slide: Slide, item: MeasuredBox): void => {
  // 辺ごとの枠を持つ角丸の箱は、箱に枠を付けず、角の丸みを持たない辺の箱を重ねる(近似)
  slide.addShape(item.ellipse ? "ellipse" : "roundRect", {
    ...position(item),
    ...(item.rotate === undefined ? {} : { rotate: item.rotate }),
    ...(item.ellipse ? {} : { rectRadius: inches(item.radius) }),
    fill: item.fill ? { color: item.fill } : { type: "none" },
    ...(item.line
      ? { line: { color: item.line.color, width: points(item.line.width) } }
      : { line: { type: "none" } }),
  });
  sideRects(item).forEach((rect) => {
    slide.addShape("rect", {
      ...position(rect),
      ...(rect.rotate === undefined ? {} : { rotate: rect.rotate }),
      fill: { color: rect.color },
      line: { type: "none" },
    });
  });
};

// 字間は px を pt に、下線は一重の線に写す(太さは写さない)
const textStyle = (item: { letterSpacing?: number; underline?: boolean }) => ({
  ...(item.letterSpacing ? { charSpacing: points(item.letterSpacing) } : {}),
  ...(item.underline ? { underline: { style: "sng" as const } } : {}),
});

// 本文は文字のまま置く。行の高さと余白は実測に合わせる
const addText = (slide: Slide, item: MeasuredText): void => {
  slide.addText(item.text, {
    ...position(item),
    fontFace: FONT_FACE,
    fontSize: points(item.fontSize),
    bold: item.bold,
    color: item.color,
    align: item.align,
    valign: item.middle ? "middle" : "top",
    lineSpacing: points(item.lineHeight),
    ...textStyle(item),
    margin: 0,
    wrap: true,
    fit: "none",
    isTextBox: true,
  });
};

const thicker = (
  a: MeasuredLine | undefined,
  b: MeasuredLine | undefined,
): MeasuredLine | undefined => (!b || (a && a.width >= b.width) ? a : b);

// 隣り合うセルの辺は PPTX では1本の線になる。HTML では片方にだけ枠があることが多い
// (見出しの下の線は本文の1行目の上の辺)ので、両側の太いほうを両方のセルに持たせる
export const mergeCellSides = (
  rows: readonly { cells: readonly MeasuredCell[] }[],
): MeasuredSides[][] =>
  rows.map((row, r) =>
    row.cells.map((cell, c) => {
      const [top, right, bottom, left] = cell.sides;
      return [
        thicker(top, rows[r - 1]?.cells[c]?.sides[2]),
        thicker(right, row.cells[c + 1]?.sides[3]),
        thicker(bottom, rows[r + 1]?.cells[c]?.sides[0]),
        thicker(left, row.cells[c - 1]?.sides[1]),
      ];
    }),
  );

const cellBorder = (line: MeasuredLine | undefined) =>
  line
    ? { type: "solid" as const, color: line.color, pt: points(line.width) }
    : { type: "none" as const };

const addTable = (slide: Slide, item: MeasuredTable): void => {
  const borders = mergeCellSides(item.rows);
  const [top, right, bottom, left] = item.padding;
  slide.addTable(
    item.rows.map((row, r) =>
      row.cells.map((cell, c) => ({
        text: cell.text,
        options: {
          fontFace: FONT_FACE,
          fontSize: points(cell.fontSize),
          bold: cell.bold,
          color: cell.color,
          valign: "top" as const,
          margin: [
            points(top),
            points(right),
            points(bottom),
            points(left),
          ] as [number, number, number, number],
          ...(cell.fill ? { fill: { color: cell.fill } } : {}),
          ...textStyle(cell),
          border: (
            borders[r]?.[c] ?? [undefined, undefined, undefined, undefined]
          ).map(cellBorder) as [
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
            PptxGenJS.BorderProps,
          ],
        },
      })),
    ),
    {
      ...position(item),
      colW: item.columns.map(inches),
      rowH: item.rows.map((row) => inches(row.height)),
    },
  );
};

const addItem = (
  slide: Slide,
  item: MeasuredItem,
  images: ReadonlyMap<string, string>,
): void => {
  if (item.kind === "box") {
    addBox(slide, item);
    return;
  }
  if (item.kind === "text") {
    addText(slide, item);
    return;
  }
  if (item.kind === "table") {
    addTable(slide, item);
    return;
  }
  const data = images.get(item.captureId);
  if (data) slide.addImage({ ...position(item), data });
};

export type PptxInput = {
  slides: readonly MeasuredSlide[];
  // 撮った装飾・アイコン(capture id)と、読み込んだ画像(URL)の data URL
  images: ReadonlyMap<string, string>;
  title: string;
  // deck.json の各スライドの notes(slideId → 文)。無いスライドは入れない
  notes: ReadonlyMap<string, string>;
};

export const buildPptx = async ({
  slides,
  images,
  title,
  notes,
}: PptxInput): Promise<Buffer> => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: "DECK",
    width: inches(SLIDE_WIDTH),
    height: inches(SLIDE_HEIGHT),
  });
  pptx.layout = "DECK";
  pptx.title = title;
  slides.forEach((slide) => {
    const target = pptx.addSlide();
    target.background = { color: slide.background };
    slide.items.forEach((item) => {
      addItem(target, item, images);
    });
    const note = notes.get(slide.slideId);
    if (note) target.addNotes(note);
  });
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
};
