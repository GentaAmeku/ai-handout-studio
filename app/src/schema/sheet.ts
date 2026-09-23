import { z } from "zod";
import { imageSrc } from "./document.ts";
import { localeName } from "./profile.ts";

// 質問票(workspace/sheets/<id>/)。questions.json と answers.json の形は question-sheet スキルに合わせる。
// 知らない項目は落とさずに読む(スキルが先に項目を増やしても保存できる)

const shortId = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]{1,100}$/,
    "id は英数字・点・下線・ハイフンの100字以内にする",
  );

export const noticeKinds = ["success", "info", "warning"] as const;

export const noticeKind = z.enum(noticeKinds);

export type NoticeKind = z.infer<typeof noticeKind>;

// 比較表のセル。文字列か、記号と色の付く状態
const cellSchema = z.union([
  z.string(),
  z.looseObject({ text: z.string().max(100), kind: noticeKind }),
]);

export type SheetCell = z.infer<typeof cellSchema>;

const comparisonSchema = z.looseObject({
  type: z.literal("comparison"),
  caption: z.string(),
  columns: z.array(z.string()).min(2).max(4),
  rows: z.array(z.array(cellSchema)).min(1).max(4),
});

// 流れの図。中身の形は design/figure/schema.json。描くときに生成器が確かめる
const flowSchema = z.looseObject({
  type: z.literal("flow"),
  figure: z.unknown(),
});

// 案ごとのイメージ画像。1〜4枚を並べて見せるだけで、選択肢とは結び付けない。
// ファイルは質問票の assets/ に置き、描くときに埋め込む(HTML 資料の image と同じ)
const imagesSchema = z.looseObject({
  type: z.literal("images"),
  caption: z.string().max(140),
  items: z
    .array(
      z.looseObject({
        src: imageSrc,
        label: z.string().trim().min(1).max(50),
        alt: z.string().max(200),
      }),
    )
    .min(1)
    .max(4),
});

export type SheetImages = z.infer<typeof imagesSchema>;

// comparison・flow・images を描く。ほかの形(decision など)は読めるが、描画側は飛ばす
const visualSchema = z.union([
  comparisonSchema,
  flowSchema,
  imagesSchema,
  // images の形の誤りは、ここで黙って通さない(画像の場所の検査を抜けないように)
  z.looseObject({
    type: z.string().refine((type) => type !== "images", {
      message: "images の形が正しくない",
    }),
  }),
]);

export type SheetVisual = z.infer<typeof visualSchema>;

const optionSchema = z.looseObject({
  id: shortId,
  label: z.string().trim().min(1).max(50),
});

const fieldSchema = z.looseObject({
  id: shortId,
  label: z.string().trim().min(1).max(50),
  initial: z.string().optional(),
  multiline: z.boolean().optional(),
  required: z.boolean().optional(),
  requiredWhen: z.array(z.string()).optional(),
});

export type SheetField = z.infer<typeof fieldSchema>;

export const questionTypes = ["single", "multiple", "text"] as const;

export const sheetQuestionSchema = z
  .looseObject({
    id: shortId,
    title: z.string().trim().min(1).max(60),
    type: z.enum(questionTypes),
    summary: z.string().max(140).optional(),
    detail: z.string().max(1200).optional(),
    options: z.array(optionSchema).max(6).optional(),
    recommended: z.array(z.string()).optional(),
    noteLabel: z.string().max(50).optional(),
    fields: z.array(fieldSchema).max(4).optional(),
    visual: visualSchema.optional(),
    visualRationale: z.string().max(140).optional(),
    notices: z
      .array(z.looseObject({ kind: noticeKind, text: z.string().max(140) }))
      .max(3)
      .optional(),
    evidence: z
      .array(
        z.looseObject({ label: z.string().max(60), text: z.string().max(240) }),
      )
      .max(3)
      .optional(),
    // 全体図(Archify)。描くのは開く前の見出しだけ
    explorer: z.union([z.string(), z.boolean()]).optional(),
  })
  .superRefine((question, ctx) => {
    if (question.type === "text") return;
    if ((question.options ?? []).length >= 2) return;
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: `質問 ${question.id}: 選択肢は2〜6件にする`,
    });
  });

export type SheetQuestion = z.infer<typeof sheetQuestionSchema>;

export const sheetDocumentSchema = z.looseObject({
  schemaVersion: z.literal(1),
  id: shortId,
  revision: shortId,
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  context: z.string().max(500).optional(),
  questions: z.array(sheetQuestionSchema).min(1).max(60),
  // 画面の文言(「回答をコピー」など)の言語。無ければ ja で描く
  lang: localeName.optional(),
});

export type SheetDocument = z.infer<typeof sheetDocumentSchema>;

const answerSchema = z.looseObject({
  id: shortId,
  selected: z.array(z.string()).optional(),
  text: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  reviewed: z.boolean().optional(),
});

export type SheetAnswer = z.infer<typeof answerSchema>;

export const sheetAnswersSchema = z.looseObject({
  schemaVersion: z.literal(1),
  documentId: shortId,
  revision: shortId,
  digest: z.string().optional(),
  answers: z.array(answerSchema),
});

export type SheetAnswers = z.infer<typeof sheetAnswersSchema>;
