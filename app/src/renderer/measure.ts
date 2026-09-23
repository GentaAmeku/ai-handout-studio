// 書き出し用ページの DOM を実測する。本文を画像に焼かず、
// 位置・大きさ・色を見たままの数値で取り出し、PPTX の組み立て側へ渡す。
//
// measureSlides はブラウザ側で評価するので、外側の値を一切参照しない。
// 必要な補助はすべて関数の中に持つ(Playwright は関数の文字列だけを送る)。

export type MeasuredRect = { x: number; y: number; w: number; h: number };

// 枠の1辺。幅は px。幅 0 か透明な辺は持たない
export type MeasuredLine = { color: string; width: number };

// 上・右・下・左の順(CSS と pptxgenjs の表のセルの border と同じ)
export type MeasuredSides = [
  MeasuredLine | undefined,
  MeasuredLine | undefined,
  MeasuredLine | undefined,
  MeasuredLine | undefined,
];

export type MeasuredText = MeasuredRect & {
  kind: "text";
  text: string;
  fontSize: number;
  bold: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  // 字間(px)。0 のときは持たない
  letterSpacing?: number;
  underline?: boolean;
  middle?: boolean;
};

export type MeasuredBox = MeasuredRect & {
  kind: "box";
  fill?: string;
  // 四辺が同じ枠は line、辺ごとに違う枠は sides で持つ(両方は持たない)
  line?: MeasuredLine;
  sides?: MeasuredSides;
  radius: number;
  ellipse: boolean;
  // 回した箱(カードのしっぽ)の角度。度。x・y・w・h は回す前の位置と大きさ
  rotate?: number;
};

// 画像は元のファイルを貼る。SVG など貼れない形式のときは撮った PNG を使う
export type MeasuredImage = MeasuredRect & {
  kind: "image";
  url: string;
  captureId: string;
};

// 装飾の層とアイコンは、その要素だけを透過 PNG で撮って貼る
export type MeasuredCapture = MeasuredRect & {
  kind: "capture";
  captureId: string;
};

export type MeasuredCell = {
  text: string;
  fontSize: number;
  bold: boolean;
  color: string;
  fill?: string;
  letterSpacing?: number;
  underline?: boolean;
  // セルの4辺の枠。表の外枠は端のセルの辺に含める
  sides: MeasuredSides;
};

export type MeasuredTable = MeasuredRect & {
  kind: "table";
  columns: number[];
  rows: { height: number; cells: MeasuredCell[] }[];
  padding: [number, number, number, number];
};

export type MeasuredItem =
  | MeasuredText
  | MeasuredBox
  | MeasuredImage
  | MeasuredCapture
  | MeasuredTable;

export type MeasuredSlide = {
  slideId: string;
  background: string;
  items: MeasuredItem[];
};

export const measureSlides = (): MeasuredSlide[] => {
  const px = (value: string): number => Number.parseFloat(value) || 0;

  // pptxgenjs は # なしの16進で色を受け取る。透明は「色なし」として扱う
  const toHex = (color: string): string | undefined => {
    const inside = color.match(/\(([^)]+)\)/)?.[1];
    if (!inside) return undefined;
    const parts = inside
      .split(/[\s,/]+/)
      .filter((part) => part.length > 0)
      .map(Number);
    if (parts.length > 3 && parts[3] === 0) return undefined;
    return parts
      .slice(0, 3)
      .map((value) => Math.round(value).toString(16).padStart(2, "0"))
      .join("");
  };

  const lengthOf = (value: string, base: number): number =>
    value.endsWith("%") ? (px(value) / 100) * base : px(value);

  const rectOf = (element: Element, origin: DOMRect): MeasuredRect => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
    };
  };

  // 回した要素は getBoundingClientRect が外接の四角を返す。回す前の大きさを中心から起こし、角度を別に持つ
  const rotationOf = (
    element: Element,
    rect: MeasuredRect,
    style: CSSStyleDeclaration,
  ): { rect: MeasuredRect; rotate?: number } => {
    if (style.transform === "none" || !(element instanceof HTMLElement)) {
      return { rect };
    }
    const matrix = new DOMMatrix(style.transform);
    const degrees = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    if (Math.abs(degrees) < 0.01) return { rect };
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    return {
      rect: {
        x: rect.x + rect.w / 2 - w / 2,
        y: rect.y + rect.h / 2 - h / 2,
        w,
        h,
      },
      rotate: degrees,
    };
  };

  const alignOf = (style: CSSStyleDeclaration): MeasuredText["align"] =>
    style.textAlign === "center"
      ? "center"
      : style.textAlign === "right"
        ? "right"
        : "left";

  const lineHeightOf = (style: CSSStyleDeclaration): number =>
    style.lineHeight.endsWith("px")
      ? px(style.lineHeight)
      : px(style.fontSize) * 1.2;

  // 4辺の枠を別々に読む。幅 0・透明・線なしの辺は undefined
  const sidesOf = (style: CSSStyleDeclaration): MeasuredSides => {
    const side = (name: string): MeasuredLine | undefined => {
      const width = px(style.getPropertyValue(`border-${name}-width`));
      if (width <= 0) return undefined;
      const color = toHex(style.getPropertyValue(`border-${name}-color`));
      return color ? { color, width } : undefined;
    };
    return [side("top"), side("right"), side("bottom"), side("left")];
  };

  const sameLine = (a?: MeasuredLine, b?: MeasuredLine): boolean =>
    a !== undefined &&
    b !== undefined &&
    a.color === b.color &&
    Math.abs(a.width - b.width) < 0.01;

  const letterSpacingOf = (style: CSSStyleDeclaration): number =>
    style.letterSpacing === "normal" ? 0 : px(style.letterSpacing);

  // 下線は祖先から子へ伝わる(計算値は伝わらない)。絶対配置と inline-block などは伝わりを止める
  const underlineOf = (element: Element): boolean => {
    for (
      let current: Element | null = element;
      current && !current.classList.contains("ds-slide");
      current = current.parentElement
    ) {
      const style = getComputedStyle(current);
      if (style.textDecorationLine.includes("underline")) return true;
      if (
        style.position === "absolute" ||
        style.position === "fixed" ||
        style.display.startsWith("inline-")
      ) {
        return false;
      }
    }
    return false;
  };

  const textStyleOf = (element: Element, style: CSSStyleDeclaration) => {
    const letterSpacing = letterSpacingOf(style);
    return {
      ...(letterSpacing !== 0 ? { letterSpacing } : {}),
      ...(underlineOf(element) ? { underline: true } : {}),
    };
  };

  const boxOf = (
    rect: MeasuredRect,
    style: CSSStyleDeclaration,
    rotate?: number,
  ): MeasuredBox | undefined => {
    const fill = toHex(style.backgroundColor);
    const sides = sidesOf(style);
    const uniform = sides.every((side) => sameLine(side, sides[0]));
    const hasLine = sides.some((side) => side !== undefined);
    if (!fill && !hasLine) return undefined;
    const radius = Math.min(
      lengthOf(style.borderTopLeftRadius, rect.w),
      rect.w / 2,
      rect.h / 2,
    );
    return {
      kind: "box",
      ...rect,
      radius,
      ellipse: radius * 2 >= Math.min(rect.w, rect.h) - 1,
      ...(rotate === undefined ? {} : { rotate }),
      ...(fill ? { fill } : {}),
      ...(uniform && sides[0] ? { line: sides[0] } : hasLine ? { sides } : {}),
    };
  };

  const textOf = (
    element: Element,
    rect: MeasuredRect,
    style: CSSStyleDeclaration,
  ): MeasuredText => {
    const left = px(style.paddingLeft);
    const top = px(style.paddingTop);
    return {
      kind: "text",
      x: rect.x + left,
      y: rect.y + top,
      w: Math.max(rect.w - left - px(style.paddingRight), 1),
      h: Math.max(rect.h - top - px(style.paddingBottom), 1),
      text: (element.textContent ?? "").replace(/\s+$/, ""),
      fontSize: px(style.fontSize),
      bold: px(style.fontWeight) >= 600,
      color: toHex(style.color) ?? "000000",
      align: alignOf(style),
      lineHeight: lineHeightOf(style),
      ...textStyleOf(element, style),
    };
  };

  // 箇条書きの点と番号は ::before が描く。実測できないので、その計算指定から起こす
  const markersOf = (element: Element, rect: MeasuredRect): MeasuredItem[] => {
    const before = getComputedStyle(element, "::before");
    const w = px(before.width);
    const h = px(before.height);
    if (w <= 0 || h <= 0) return [];
    const x = rect.x + px(before.left);
    const y = rect.y + px(before.top) - h / 2;
    const fill = toHex(before.backgroundColor);
    const box: MeasuredBox = {
      kind: "box",
      x,
      y,
      w,
      h,
      radius: Math.min(w, h) / 2,
      ellipse: true,
      ...(fill ? { fill } : {}),
    };
    const numbered =
      element.parentElement?.classList.contains("ds-bullets--number") === true;
    if (!numbered) return [box];
    const index = [...(element.parentElement?.children ?? [])].indexOf(element);
    return [
      box,
      {
        kind: "text",
        x,
        y,
        w,
        h,
        text: String(index + 1),
        fontSize: px(before.fontSize),
        bold: px(before.fontWeight) >= 600,
        color: toHex(before.color) ?? "000000",
        align: "center",
        lineHeight: h,
        middle: true,
      },
    ];
  };

  const tableOf = (table: Element, origin: DOMRect): MeasuredTable => {
    const cellStyle = getComputedStyle(table.querySelector("td") ?? table);
    // 表の外枠は、端のセルの辺に枠が無いときにその辺へ写す
    const outer = sidesOf(getComputedStyle(table));
    const rowElements = [...table.querySelectorAll("tr")];
    const rows = rowElements.map((row, rowIndex) => ({
      height: row.getBoundingClientRect().height,
      cells: [...row.children].map((cell, cellIndex, cells) => {
        const current = getComputedStyle(cell);
        const fill = toHex(current.backgroundColor);
        const own = sidesOf(current);
        const edge = [
          rowIndex === 0,
          cellIndex === cells.length - 1,
          rowIndex === rowElements.length - 1,
          cellIndex === 0,
        ];
        const sides = own.map(
          (side, index) => side ?? (edge[index] ? outer[index] : undefined),
        ) as MeasuredSides;
        return {
          text: (cell.textContent ?? "").trim(),
          fontSize: px(current.fontSize),
          bold: px(current.fontWeight) >= 600,
          color: toHex(current.color) ?? "000000",
          ...(fill ? { fill } : {}),
          ...textStyleOf(cell, current),
          sides,
        };
      }),
    }));
    const head = table.querySelector("tr");
    return {
      kind: "table",
      ...rectOf(table, origin),
      columns: [...(head?.children ?? [])].map(
        (cell) => cell.getBoundingClientRect().width,
      ),
      rows,
      padding: [
        px(cellStyle.paddingTop),
        px(cellStyle.paddingRight),
        px(cellStyle.paddingBottom),
        px(cellStyle.paddingLeft),
      ],
    };
  };

  const captureId = (element: Element, counter: { next: number }): string => {
    counter.next += 1;
    const id = `cap${counter.next}`;
    element.setAttribute("data-capture-id", id);
    return id;
  };

  const walk = (
    element: Element,
    origin: DOMRect,
    counter: { next: number },
  ): MeasuredItem[] => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return [];
    if (px(style.opacity) === 0) return [];
    const measured = rectOf(element, origin);
    if (measured.w <= 0 || measured.h <= 0) return [];
    const { rect, rotate } = rotationOf(element, measured, style);
    if (element.tagName === "svg") {
      return [
        { kind: "capture", ...rect, captureId: captureId(element, counter) },
      ];
    }
    if (element instanceof HTMLImageElement) {
      return [
        {
          kind: "image",
          ...rect,
          url: element.currentSrc || element.src,
          captureId: captureId(element, counter),
        },
      ];
    }
    if (element.tagName === "TABLE") return [tableOf(element, origin)];
    const box = boxOf(rect, style, rotate);
    const marker = element.classList.contains("ds-bullets__item")
      ? markersOf(element, rect)
      : [];
    const hasText = (element.textContent ?? "").trim().length > 0;
    const content =
      element.children.length === 0
        ? hasText
          ? [textOf(element, rect, style)]
          : []
        : [...element.children].flatMap((child) =>
            walk(child, origin, counter),
          );
    return [...(box ? [box] : []), ...marker, ...content];
  };

  const counter = { next: 0 };
  return [
    ...document.querySelectorAll<HTMLElement>("[data-print-root] .ds-slide"),
  ].map((slide) => ({
    slideId: slide.dataset.slideId ?? "",
    background: toHex(getComputedStyle(slide).backgroundColor) ?? "ffffff",
    items: [...slide.children].flatMap((child) =>
      walk(child, slide.getBoundingClientRect(), counter),
    ),
  }));
};
