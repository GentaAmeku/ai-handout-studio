// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type FigureInput,
  snippet,
  validate,
} from "../../design/figure/render.mjs";
import { resolveTemplate, templateVariables } from "../src/design/theme.ts";
import {
  componentsSchema,
  selectionSchema,
  templateSchemas,
  tokensSchema,
} from "../src/schema/design.ts";

// 図の箱が字の大きさの倍率に合わせて大きくなることを実ブラウザで確かめる。pnpm test:export で流す。
// HTML 資料と質問票の見本(design/samples/)に、build と同じ関数で解いた 100% と 120% の変数を当てて描き、
// 図の枠・箱・ラベルを実測する。HTML 資料は印刷(PDF にするときの見え方)でも測る
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designDir = join(repoRoot, "design");
const SCALE = 1.2;
// ラベルの幅の実測は書体の丸めで少し揺れるので、比は 2% まで許す
const RATIO_TOLERANCE = 0.02;
// ラベルの高さ(字の行の高さ)は Chromium が整数の px に丸める(16px の字が 16.6px なら 17px)。
// 16px では 1px が 6% にあたり比では測れないので、期待の高さから 1px までのずれを許す
const HEIGHT_ROUNDING_PX = 1;

const context: { browser?: Browser } = {};

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(designDir, path), "utf8"));

type FigureSurface = "document" | "sheet";

// 既定のテンプレートを倍率つきで解いた変数。build の CSS と同じ関数(templateVariables)で作る
const variablesCss = async (
  surface: FigureSurface,
  scale: number,
): Promise<string> => {
  const name = selectionSchema.parse(await readJson("selection.json"))[surface];
  const template = templateSchemas[surface].parse(
    await readJson(`templates/${surface}/${name}/template.json`),
  );
  const result = resolveTemplate(
    surface,
    name,
    { ...template, textScale: scale },
    tokensSchema.parse(await readJson("tokens.json")),
    componentsSchema.parse(await readJson("components.json")),
  );
  if (!result.success) throw new Error(result.message);
  const declarations = templateVariables(result.template)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return `:root { ${declarations} }`;
};

// 箱が2つ横に並ぶ図。ラベルは上限(10 字幅)いっぱいのものを入れる。120% でも枠の内寸に収まる幅
const wideLabels: FigureInput = {
  figure: 1,
  caption: "図 上限いっぱいのラベルが箱に収まるかを見る",
  flow: [
    { label: "依頼をまとめて受ける", kind: "outside" },
    {
      label: "規模を見て分ける",
      kind: "branch",
      fork: [
        { label: "その場で小さく直す" },
        { label: "設計の段から作り直す" },
      ],
    },
    { label: "作業の記録をまとめる", kind: "store" },
  ],
};

type Rect = { x: number; y: number; w: number; h: number };
type MeasuredFigure = {
  svg: Rect;
  // width・height の属性(生成器が組んだ寸法)
  attr: { w: number; h: number };
  zoom: string;
  maxWidth: string;
  fontSize: number;
  fsUi: number;
  frameInner: number;
  overflow: number;
  labels: { text: string; box: Rect; label: Rect }[];
};

// ページの中の図をすべて測る。箱はラベルの直前に並ぶ形(円筒は胴と蓋の2つ)を合わせた範囲
const measureFigures = (): MeasuredFigure[] => {
  const rectOf = (element: Element): Rect => {
    const b = element.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const union = (rects: Rect[]): Rect => {
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    return { x, y, w: right - x, h: bottom - y };
  };
  const shapesBefore = (text: Element): Element[] => {
    const previous = text.previousElementSibling;
    if (!previous?.classList.contains("ds-node")) return [];
    const earlier = previous.previousElementSibling;
    // 円筒だけは胴と蓋の2つ。蓋は胴と同じ幅で、胴の上端に乗る
    return earlier?.tagName === "path" && previous.tagName === "path"
      ? [earlier, previous]
      : [previous];
  };
  return [...document.querySelectorAll(".ds-figure-frame svg")].map((svg) => {
    const frame = svg.parentElement as HTMLElement;
    const frameStyle = getComputedStyle(frame);
    const style = getComputedStyle(svg);
    const probe = document.createElement("span");
    probe.style.fontSize = "var(--fs-ui)";
    frame.append(probe);
    const fsUi = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return {
      svg: rectOf(svg),
      attr: {
        w: Number(svg.getAttribute("width")),
        h: Number(svg.getAttribute("height")),
      },
      zoom: style.zoom,
      maxWidth: style.maxWidth,
      fontSize: Number.parseFloat(style.fontSize),
      fsUi,
      frameInner:
        frame.clientWidth -
        Number.parseFloat(frameStyle.paddingLeft) -
        Number.parseFloat(frameStyle.paddingRight),
      overflow: frame.scrollWidth - frame.clientWidth,
      labels: [...svg.querySelectorAll("text")].map((text) => ({
        text: text.textContent ?? "",
        box: union(shapesBefore(text).map(rectOf)),
        label: rectOf(text),
      })),
    };
  });
};

const openSample = async (
  sample: string,
  surface: FigureSurface,
  scale: number,
  setup?: (page: Page) => Promise<void>,
): Promise<MeasuredFigure[]> => {
  const page = await (context.browser as Browser).newPage({
    viewport: { width: 1280, height: 800 },
  });
  try {
    await page.goto(pathToFileURL(join(designDir, "samples", sample)).href);
    await page.addStyleTag({ content: await variablesCss(surface, scale) });
    await setup?.(page);
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(measureFigures);
  } finally {
    await page.close();
  }
};

// HTML 資料の見本(箱が3つ横に並ぶ図)に、箱が2つ横に並ぶ図を足して測る
const openDocument = (scale: number, media: "screen" | "print" = "screen") =>
  openSample("document.html", "document", scale, async (page) => {
    await page.emulateMedia({ media });
    await page.evaluate((html) => {
      document.querySelector(".ds-main")?.insertAdjacentHTML("beforeend", html);
    }, snippet(wideLabels));
  });

const ratio = (after: number, before: number): number => after / before;

// 並びの index 番目。無ければ測り方の誤りなので止める
const nth = <T>(list: readonly T[], index: number): T => {
  const item = list[index];
  if (item === undefined) throw new Error(`${index} 番目が無い`);
  return item;
};

// ラベルが箱の内側にある(横は箱の内、縦は箱の上下の間)
const expectLabelsInBoxes = (figure: MeasuredFigure) => {
  for (const { text, box, label } of figure.labels) {
    expect(label.x, text).toBeGreaterThanOrEqual(box.x);
    expect(label.x + label.w, text).toBeLessThanOrEqual(box.x + box.w);
    expect(label.y, text).toBeGreaterThanOrEqual(box.y);
    expect(label.y + label.h, text).toBeLessThanOrEqual(box.y + box.h);
  }
};

// 箱の幅・高さとラベルの字が、そろって同じ割合(expected)で変わる
const expectScaledTogether = (
  before: MeasuredFigure,
  after: MeasuredFigure,
  expected: number,
) => {
  expect(after.labels).toHaveLength(before.labels.length);
  after.labels.forEach(({ text, box, label }, index) => {
    const base = nth(before.labels, index);
    expect(ratio(box.w, base.box.w), text).toBeCloseTo(expected, 3);
    expect(ratio(box.h, base.box.h), text).toBeCloseTo(expected, 3);
    expect(
      Math.abs(ratio(label.w, base.label.w) - expected),
      text,
    ).toBeLessThanOrEqual(expected * RATIO_TOLERANCE);
    expect(
      Math.abs(label.h - base.label.h * expected),
      text,
    ).toBeLessThanOrEqual(HEIGHT_ROUNDING_PX);
  });
};

beforeAll(async () => {
  expect(validate(wideLabels)).toEqual([]);
  context.browser = await chromium.launch();
});

afterAll(async () => {
  await context.browser?.close();
});

describe("図の箱が字の大きさの倍率に合わせて大きくなる", () => {
  it("倍率 1 は今までと同じ(生成器の寸法のまま、zoom も幅の上限も効かない)", async () => {
    const figures = await openDocument(1);
    expect(figures).toHaveLength(2);
    for (const figure of figures) {
      expect(figure.svg.w).toBe(figure.attr.w);
      expect(figure.svg.h).toBe(figure.attr.h);
      expect(figure.zoom).toBe("1");
      expect(figure.maxWidth).toBe("none");
      expect(figure.fontSize).toBe(figure.fsUi);
      expectLabelsInBoxes(figure);
    }
  });

  it.each(["screen", "print"] as const)(
    "HTML 資料(%s)は 120% で箱とラベルがそろって 1.2 倍になり、枠からはみ出さない",
    async (media) => {
      const [before, after] = await Promise.all([
        openDocument(1, media),
        openDocument(SCALE, media),
      ]);
      const [wideBefore, wideAfter] = [before, after].map((figures) =>
        figures.find((f) =>
          f.labels.some(({ text }) => text === nth(wideLabels.flow, 0).label),
        ),
      );
      if (!wideBefore || !wideAfter) throw new Error("足した図が無い");
      // 箱が2つ横に並ぶ図は、枠の内寸に収まるので倍率のまま大きくなる
      expect(wideAfter.svg.w).toBeLessThan(wideAfter.frameInner);
      expect(ratio(wideAfter.svg.w, wideBefore.svg.w)).toBeCloseTo(SCALE, 2);
      expect(ratio(wideAfter.svg.h, wideBefore.svg.h)).toBeCloseTo(SCALE, 2);
      expectScaledTogether(wideBefore, wideAfter, SCALE);
      // 図の字は本文の --fs-ui と同じ大きさで見える(中の字は倍率で割り、zoom で掛け戻す)
      expect(wideAfter.fsUi).toBeCloseTo(wideBefore.fsUi * SCALE, 1);
      expect(wideAfter.fontSize * SCALE).toBeCloseTo(wideAfter.fsUi, 1);

      after.forEach((figure, index) => {
        const base = nth(before, index);
        expectLabelsInBoxes(figure);
        // どの図も枠の中に収まり、枠を横に送らない
        expect(figure.svg.w).toBeLessThanOrEqual(figure.frameInner + 0.5);
        expect(figure.overflow).toBeLessThanOrEqual(0);
        // 枠の幅まで縮めた図も、箱とラベルは同じ割合のまま
        const grow = ratio(figure.svg.w, base.svg.w);
        expect(grow).toBeGreaterThanOrEqual(1);
        expect(grow).toBeLessThanOrEqual(SCALE + 0.001);
        expectScaledTogether(base, figure, grow);
      });
    },
  );

  it("質問票は 120% で箱とラベルがそろって 1.2 倍になる", async () => {
    const [befores, afters] = await Promise.all([
      openSample("sheet.focus.html", "sheet", 1),
      openSample("sheet.focus.html", "sheet", SCALE),
    ]);
    expect(afters).toHaveLength(1);
    const [before, after] = [nth(befores, 0), nth(afters, 0)];
    // 質問票の図は枠の幅いっぱい(width: 100%)に置くので、大きくなるのは高さと中身
    expect(ratio(after.svg.h, before.svg.h)).toBeCloseTo(SCALE, 2);
    expectScaledTogether(before, after, SCALE);
    expectLabelsInBoxes(after);
    expect(after.overflow).toBeLessThanOrEqual(0);
  });
});
