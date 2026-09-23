import { z } from "zod";
import { iconNames } from "./icons.ts";

// 画像は資料フォルダの assets/ からの相対パスだけ。外部URL・絶対パス・上位参照は通さない
const assetPath = z
  .string()
  .regex(/^assets\/[^:\\]+$/, "画像は assets/ からの相対パスで指定する")
  .refine((path) => !path.split("/").includes(".."), {
    message: "画像パスに .. は使えない",
  });

const geometry = {
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
};

const requiredId = z.string().min(1);

const withoutKeys =
  (keys: readonly string[]) =>
  (value: unknown): unknown =>
    typeof value === "object" &&
    value !== null &&
    keys.some((key) => key in value)
      ? Object.fromEntries(
          Object.entries(value).filter(([key]) => !keys.includes(key)),
        )
      : value;

const column = z.strictObject({
  title: z.string().optional(),
  body: z.string(),
});

// icon と id は用途で変える。読み込み用は id 必須、パッチ用は新しいブロックの id を省ける。
// id の型は渡したスキーマに従う(ここを固定すると、読み込み用まで id が任意になる)
const buildKnownBlockSchema = <I extends z.ZodType<string | undefined>>(
  icon: z.ZodType<string>,
  id: I,
) => {
  // ブロックと props は余分なキーを通さない。色やフォント名を JSON に書かせないため
  const defineBlock = <T extends string, P extends z.ZodType>(
    type: T,
    props: P,
  ) => z.strictObject({ ...geometry, id, type: z.literal(type), props });

  return z.discriminatedUnion("type", [
    defineBlock(
      "heading",
      z.strictObject({
        kicker: z.string().optional(),
        text: z.string(),
        level: z.union([z.literal(1), z.literal(2)]),
      }),
    ),
    defineBlock(
      "text",
      z.strictObject({
        text: z.string(),
        align: z.enum(["left", "center", "right"]).optional(),
      }),
    ),
    defineBlock(
      "bullets",
      z.strictObject({
        items: z.array(z.string()),
        marker: z.enum(["disc", "number"]).optional(),
      }),
    ),
    defineBlock(
      "card-grid",
      z.strictObject({
        columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        items: z.array(
          z.strictObject({
            title: z.string(),
            body: z.string(),
            icon: icon.optional(),
          }),
        ),
      }),
    ),
    defineBlock(
      "kpi-row",
      z.strictObject({
        items: z.array(
          z.strictObject({
            value: z.string(),
            label: z.string(),
            note: z.string().optional(),
          }),
        ),
      }),
    ),
    defineBlock("two-col", z.strictObject({ left: column, right: column })),
    defineBlock(
      "process",
      z.strictObject({
        steps: z.array(z.strictObject({ title: z.string(), body: z.string() })),
      }),
    ),
    defineBlock(
      "table",
      z
        .strictObject({
          headers: z.array(z.string()).min(1),
          rows: z.array(z.array(z.string())),
        })
        .refine(
          ({ headers, rows }) =>
            rows.every((row) => row.length === headers.length),
          { message: "表の各行は headers と同じ列数にする", path: ["rows"] },
        ),
    ),
    defineBlock(
      "image",
      z.strictObject({
        src: assetPath,
        fit: z.enum(["cover", "contain"]).optional(),
        caption: z.string().optional(),
      }),
    ),
    defineBlock(
      "footer",
      // ロゴ(showLogo)と右下のイラスト(showIllustration)は 130 で廃止した。
      // 前の資料も読めるよう、読むときに捨てる
      z.preprocess(
        withoutKeys(["showLogo", "showIllustration"]),
        z.strictObject({
          showPage: z.boolean().optional(),
        }),
      ),
    ),
  ]);
};

export const knownBlockSchema = buildKnownBlockSchema(z.string(), requiredId);

// AI 出力用。カタログ内の type と、使えるアイコン名だけを通す
export const aiBlockSchema = buildKnownBlockSchema(
  z.enum(iconNames),
  requiredId,
);

// AI の編集案(パッチ)用。新しいブロックは id を書かず、反映のときにアプリが振る
export const patchBlockSchema = buildKnownBlockSchema(
  z.enum(iconNames),
  requiredId.optional(),
);

export type KnownBlock = z.infer<typeof knownBlockSchema>;
export type KnownBlockType = KnownBlock["type"];
export type BlockOf<T extends KnownBlockType> = Extract<
  KnownBlock,
  { type: T }
>;
export type PatchBlock = z.infer<typeof patchBlockSchema>;

export const knownBlockTypes: readonly KnownBlockType[] = [
  "heading",
  "text",
  "bullets",
  "card-grid",
  "kpi-row",
  "two-col",
  "process",
  "table",
  "image",
  "footer",
];

const isKnownType = (type: string): type is KnownBlockType =>
  (knownBlockTypes as readonly string[]).includes(type);

// 未知の type はアプリを落とさないために通し、描画側でプレースホルダにする
const unknownBlockSchema = z.strictObject({
  ...geometry,
  id: requiredId,
  type: z.string().refine((type) => !isKnownType(type)),
  props: z.record(z.string(), z.unknown()),
});

export type UnknownBlock = z.infer<typeof unknownBlockSchema>;
export type Block = KnownBlock | UnknownBlock;

// 既知の type は既知のスキーマだけで判定し、エラーを未知扱いの分岐と混ぜない。
// 読んだ値はスキーマを通した後のもの(廃止したキーを捨てた後)を返す
export const blockSchema: z.ZodType<Block> = z
  .looseObject({ type: z.string() })
  .pipe(
    z.custom<Block>().transform((value, ctx) => {
      const schema = isKnownType(value.type)
        ? knownBlockSchema
        : unknownBlockSchema;
      const result = schema.safeParse(value);
      if (result.success) return result.data;
      result.error.issues.forEach((issue) => {
        ctx.addIssue({ ...issue, code: "custom", message: issue.message });
      });
      return z.NEVER;
    }),
  );

export const isKnownBlock = (block: Block): block is KnownBlock =>
  isKnownType(block.type);
