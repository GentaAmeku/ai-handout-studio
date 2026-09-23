import type {
  SheetDocument,
  SheetImages,
  SheetQuestion,
} from "../src/schema/sheet.ts";

// 質問票の images(案ごとのイメージ画像)の src を集める・書き換える。
// 取り込みと埋め込みは handout-assets.ts(HTML 資料の image と同じ)

const imagesOf = (question: SheetQuestion): SheetImages | undefined =>
  question.visual?.type === "images"
    ? (question.visual as SheetImages)
    : undefined;

export const sheetImageSrcs = (doc: SheetDocument): string[] =>
  doc.questions.flatMap(
    (question) => imagesOf(question)?.items.map((item) => item.src) ?? [],
  );

export const withSheetImageSrcs = (
  doc: SheetDocument,
  mapping: ReadonlyMap<string, string>,
): SheetDocument =>
  mapping.size === 0
    ? doc
    : {
        ...doc,
        questions: doc.questions.map((question) => {
          const images = imagesOf(question);
          return images
            ? {
                ...question,
                visual: {
                  ...images,
                  items: images.items.map((item) => ({
                    ...item,
                    src: mapping.get(item.src) ?? item.src,
                  })),
                },
              }
            : question;
        }),
      };
