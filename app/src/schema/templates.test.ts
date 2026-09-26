import { describe, expect, it } from "vitest";
import catalogEn from "../dev/block-catalog.en.json";
import catalog from "../dev/block-catalog.json";
import { isKnownBlock, knownBlockTypes } from "./block";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide, validateDeck } from "./deck";
import { slideSampleSchema, slideTemplateSchema } from "./design";

const samples = import.meta.glob<unknown>(
  "../../../design/templates/slide/*/sample.json",
  { eager: true, import: "default" },
);

// 英語の見本(sample.en.json)。日本語の見本の隣に置く
const englishSamples = import.meta.glob<unknown>(
  "../../../design/templates/slide/*/sample.en.json",
  { eager: true, import: "default" },
);

// 文の中身を除いた形(ページとブロックの id・種類・座標)。英語の見本は日本語と同じ形にする
const shapeOf = (deck: { slides: readonly Slide[] }) =>
  deck.slides.map((slide) => ({
    id: slide.id,
    layout: slide.layout,
    blocks: slide.blocks.map(({ id, type, x, y, w, h }) => ({
      id,
      type,
      x,
      y,
      w,
      h,
    })),
  }));

// 未記入の印([[要確認]])は英語の資料でも同じなので、それを除いて日本語の文字を探す
const japaneseIn = (value: unknown): string[] =>
  typeof value === "string"
    ? /[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/.test(
        value.replaceAll("[[要確認]]", ""),
      )
      ? [value]
      : []
    : Array.isArray(value)
      ? value.flatMap(japaneseIn)
      : value !== null && typeof value === "object"
        ? Object.values(value).flatMap(japaneseIn)
        : [];

// テンプレートに同梱の絵。中身は読まず、あるかだけを見る
const templateAssets = import.meta.glob(
  "../../../design/templates/slide/*/assets/*.svg",
);

const templateFiles = import.meta.glob<unknown>(
  "../../../design/templates/*/*/template.json",
  { eager: true, import: "default" },
);

// 中身の見本を、新規作成と同じ形の資料にして確かめる
const asDeck = (sample: unknown) => ({
  id: "tpl",
  title: "見本",
  size: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
  status: "draft",
  meta: {
    ...slideSampleSchema.parse(sample).meta,
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
  },
  slides: slideSampleSchema.parse(sample).slides,
});

const PROPOSAL = "../../../design/templates/slide/proposal/sample.json";

const SLIDE_MARGIN = 64;

describe("design/templates/slide/ の中身の見本", () => {
  it("中身の見本を持つテンプレートがある", () => {
    expect(Object.keys(samples)).toEqual(
      expect.arrayContaining([
        PROPOSAL,
        "../../../design/templates/slide/kickoff/sample.json",
        "../../../design/templates/slide/self-intro/sample.json",
        "../../../design/templates/slide/study-session/sample.json",
        "../../../design/templates/slide/talk/sample.json",
      ]),
    );
  });

  it.each(Object.entries(samples))(
    "%s がスキーマを通り、既知の type だけで左右64pxの余白に収まる",
    (_path, data) => {
      const blocks = validateDeck(asDeck(data)).slides.flatMap(
        (slide) => slide.blocks,
      );
      const unknownIds = blocks
        .filter((block) => !isKnownBlock(block))
        .map((block) => block.id);
      const outsideIds = blocks
        .filter(
          (block) =>
            block.x < SLIDE_MARGIN ||
            block.x + block.w > SLIDE_WIDTH - SLIDE_MARGIN ||
            block.y + block.h > SLIDE_HEIGHT,
        )
        .map((block) => block.id);
      expect(unknownIds).toEqual([]);
      expect(outsideIds).toEqual([]);
    },
  );

  // 見本の image は src に assets/<ファイル> と書く。そのファイルはテンプレートに同梱(<名前>/assets/)していて、
  // createDeckFromOutline が作った資料の assets/ へ写す(写すことは app/server/api.test.ts で確かめる)
  it.each(Object.entries(samples))(
    "%s の image の src はテンプレートの assets/ に実在する",
    (path, data) => {
      const folder = path.replace(/sample\.json$/, "");
      const missing = validateDeck(asDeck(data))
        .slides.flatMap((slide) => slide.blocks)
        .flatMap((block) =>
          block.type === "image" ? [String(block.props.src)] : [],
        )
        .filter((src) => !(`${folder}${src}` in templateAssets));
      expect(missing).toEqual([]);
    },
  );

  it("同梱の絵は各テンプレートに3〜4点", () => {
    const names = Object.keys(templateAssets).map(
      (path) => path.split("/").at(-3) ?? "",
    );
    const counts = Object.fromEntries(
      [...new Set(names)].map((name) => [
        name,
        names.filter((other) => other === name).length,
      ]),
    );
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    expect(
      Object.entries(counts).filter(([, count]) => count < 3 || count > 4),
    ).toEqual([]);
  });

  it("中身の見本はどれも英語の見本(sample.en.json)を持つ", () => {
    expect(Object.keys(englishSamples).sort()).toEqual(
      Object.keys(samples)
        .map((path) => path.replace(/sample\.json$/, "sample.en.json"))
        .sort(),
    );
  });

  it.each(Object.entries(englishSamples))(
    "%s は日本語の見本と同じ形で、日本語が残らない",
    (path, data) => {
      const japanese =
        samples[path.replace(/sample\.en\.json$/, "sample.json")];
      expect(shapeOf(validateDeck(asDeck(data)))).toEqual(
        shapeOf(validateDeck(asDeck(japanese))),
      );
      expect(japaneseIn(data)).toEqual([]);
    },
  );

  it("提案の見本は12〜20枚", () => {
    const deck = validateDeck(asDeck(samples[PROPOSAL]));
    expect(deck.slides.length).toBeGreaterThanOrEqual(12);
    expect(deck.slides.length).toBeLessThanOrEqual(20);
  });
});

describe("design/templates/ のテンプレート", () => {
  it("スライドの template.json はスキーマを通る", () => {
    const slides = Object.entries(templateFiles).filter(([path]) =>
      path.includes("/templates/slide/"),
    );
    expect(slides.length).toBeGreaterThan(0);
    expect(
      slides.filter(([, data]) => !slideTemplateSchema.safeParse(data).success),
    ).toEqual([]);
  });
});

describe("確認用デッキ", () => {
  it("英語の一覧は日本語と同じ形で、日本語が残らない", () => {
    expect(shapeOf(validateDeck(catalogEn))).toEqual(
      shapeOf(validateDeck(catalog)),
    );
    expect(japaneseIn(catalogEn)).toEqual([]);
  });

  it("初期10種と未知の type を含む", () => {
    const blocks = validateDeck(catalog).slides.flatMap(
      (slide) => slide.blocks,
    );
    expect(blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining([...knownBlockTypes]),
    );
    expect(blocks.some((block) => !isKnownBlock(block))).toBe(true);
  });
});
