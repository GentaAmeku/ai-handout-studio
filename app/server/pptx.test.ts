// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type {
  MeasuredCell,
  MeasuredSides,
  MeasuredSlide,
} from "../src/renderer/measure.ts";
import { buildPptx, mergeCellSides, sideRects } from "./pptx.ts";

const none: MeasuredSides = [undefined, undefined, undefined, undefined];

const cell = (sides: MeasuredSides = none): MeasuredCell => ({
  text: "x",
  fontSize: 16,
  bold: false,
  color: "000000",
  sides,
});

const slideXml = async (slide: MeasuredSlide): Promise<string> => {
  const zip = await JSZip.loadAsync(
    await buildPptx({
      slides: [slide],
      images: new Map(),
      title: "t",
      notes: new Map(),
    }),
  );
  return (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
};

describe("辺ごとの枠", () => {
  it("左だけの枠は、左の辺の幅の塗りの箱になる", () => {
    const rects = sideRects({
      kind: "box",
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      radius: 0,
      ellipse: false,
      sides: [undefined, undefined, undefined, { color: "ff0000", width: 8 }],
    });
    expect(rects).toEqual([{ x: 10, y: 20, w: 8, h: 50, color: "ff0000" }]);
  });

  it("回した箱の辺は、箱の中心のまわりに回して同じ角度を付ける", () => {
    const [bottom] = sideRects({
      kind: "box",
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      radius: 0,
      ellipse: false,
      rotate: 90,
      sides: [undefined, undefined, { color: "000000", width: 2 }, undefined],
    });
    // 下の辺(中心 10,19)を 90 度回すと左の辺の位置(中心 1,10)に来る
    expect(bottom?.rotate).toBe(90);
    expect((bottom?.x ?? 0) + (bottom?.w ?? 0) / 2).toBeCloseTo(1);
    expect((bottom?.y ?? 0) + (bottom?.h ?? 0) / 2).toBeCloseTo(10);
  });

  it("辺ごとの枠は、線なしの箱と辺の幅の塗りの箱で PPTX に出る", async () => {
    const xml = await slideXml({
      slideId: "s",
      background: "ffffff",
      items: [
        {
          kind: "box",
          x: 0,
          y: 0,
          w: 96,
          h: 96,
          radius: 0,
          ellipse: false,
          fill: "eeeeee",
          sides: [
            undefined,
            undefined,
            undefined,
            { color: "ff0000", width: 8 },
          ],
        },
      ],
    });
    // 8px = 76200 EMU の幅の赤い箱
    expect(xml).toContain('cx="76200"');
    expect(xml).toMatch(/<a:srgbClr val="FF0000"/i);
  });
});

describe("表の罫", () => {
  it("隣り合うセルの辺は太いほうを両方に持たせる", () => {
    const rule = { color: "000000", width: 2 };
    const thin = { color: "949494", width: 1 };
    const merged = mergeCellSides([
      { cells: [cell(), cell()] },
      {
        cells: [
          cell([rule, undefined, undefined, undefined]),
          cell([thin, undefined, undefined, thin]),
        ],
      },
    ]);
    // 見出しの下の線(本文の1行目の上の辺)が見出しのセルの下の辺にも入る
    expect(merged[0]?.[0]?.[2]).toEqual(rule);
    expect(merged[0]?.[1]?.[2]).toEqual(thin);
    // 縦の罫は左のセルの右の辺にも入る
    expect(merged[1]?.[0]?.[1]).toEqual(thin);
    expect(merged[0]?.[0]?.[1]).toBeUndefined();
  });

  it("セルごとの辺・字間・下線が PPTX の XML に出る", async () => {
    const xml = await slideXml({
      slideId: "s",
      background: "ffffff",
      items: [
        {
          kind: "table",
          x: 0,
          y: 0,
          w: 200,
          h: 80,
          columns: [100, 100],
          padding: [4, 4, 4, 4],
          rows: [
            {
              height: 40,
              cells: [{ ...cell(), letterSpacing: 4, underline: true }, cell()],
            },
            {
              height: 40,
              cells: [
                cell([
                  { color: "00ff00", width: 3 },
                  undefined,
                  undefined,
                  undefined,
                ]),
                cell(),
              ],
            },
          ],
        },
        {
          kind: "text",
          x: 0,
          y: 100,
          w: 200,
          h: 40,
          text: "字間と下線",
          fontSize: 16,
          bold: false,
          color: "000000",
          align: "left",
          lineHeight: 24,
          letterSpacing: 2,
          underline: true,
        },
      ],
    });
    // 3px = 2.25pt = 28575 EMU。見出しの下と本文の上の両方に出る
    expect(xml.match(/<a:ln[BT] w="28575"/g)).toHaveLength(2);
    expect(xml).toContain('<a:lnL w="0"');
    expect(xml).toContain('spc="150"');
    expect(xml).toContain('spc="300"');
    expect(xml).toContain('u="sng"');
  });
});

describe("発表者ノート", () => {
  const slide = (slideId: string): MeasuredSlide => ({
    slideId,
    background: "ffffff",
    items: [],
  });

  it("notes のあるスライドは ppt/notesSlides に同じ文が入る", async () => {
    const zip = await JSZip.loadAsync(
      await buildPptx({
        slides: [slide("s1")],
        images: new Map(),
        title: "t",
        notes: new Map([["s1", "台本の一行目\n二行目"]]),
      }),
    );
    const xml = await zip
      .file("ppt/notesSlides/notesSlide1.xml")
      ?.async("string");
    expect(xml).toContain("台本の一行目");
    expect(xml).toContain("二行目");
  });

  it("notes が空のスライドには文が入らない(ノートの欄が空のまま)", async () => {
    const zip = await JSZip.loadAsync(
      await buildPptx({
        slides: [slide("s1")],
        images: new Map(),
        title: "t",
        notes: new Map(),
      }),
    );
    const xml = await zip
      .file("ppt/notesSlides/notesSlide1.xml")
      ?.async("string");
    // ノート欄(body の placeholder)の文が空のまま。スライド番号の欄(1)は残る
    expect(xml).toContain("<a:t></a:t>");
  });
});
