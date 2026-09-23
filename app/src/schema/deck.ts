import { z } from "zod";
import { aiBlockSchema, blockSchema } from "./block.ts";

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

// テーマや背景は名前で引く。色コードやパスを書かせない
const token = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "英小文字・数字・ハイフンの名前で指定する");

export const slideLayouts = ["cover", "section", "content", "closing"] as const;

const buildSlideSchema = <B extends { id: string }>(block: z.ZodType<B>) =>
  z.strictObject({
    id: z.string().min(1),
    layout: z.enum(slideLayouts),
    notes: z.string().optional(),
    background: token.optional(),
    blocks: z.array(block),
  });

type IdEntry = { id: string; path: (string | number)[] };

const collectIds = (
  slides: readonly { id: string; blocks: readonly { id: string }[] }[],
): IdEntry[] =>
  slides.flatMap((slide, slideIndex) => [
    { id: slide.id, path: ["slides", slideIndex, "id"] },
    ...slide.blocks.map((block, blockIndex) => ({
      id: block.id,
      path: ["slides", slideIndex, "blocks", blockIndex, "id"],
    })),
  ]);

const buildDeckSchema = <B extends { id: string }>(block: z.ZodType<B>) =>
  z
    .strictObject({
      id: z.string().min(1),
      title: z.string(),
      // スライドのテンプレートの名前(design/templates/slide/)。未指定はスライドの既定のテンプレート
      template: token.optional(),
      // 旧い名前(段 I より前)。移行期は読み、template が無ければこれを使う
      theme: token.optional(),
      size: z.strictObject({
        width: z.literal(SLIDE_WIDTH),
        height: z.literal(SLIDE_HEIGHT),
      }),
      status: z.enum(["draft", "done"]),
      meta: z.strictObject({
        audience: z.string().optional(),
        tags: z.array(z.string()).optional(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }),
      slides: z.array(buildSlideSchema(block)),
    })
    .superRefine((deck, ctx) => {
      const entries = collectIds(deck.slides);
      entries
        .filter(
          (entry, index) =>
            entries.findIndex((other) => other.id === entry.id) !== index,
        )
        .forEach((entry) => {
          ctx.addIssue({
            code: "custom",
            message: `id "${entry.id}" がデッキ内で重複している`,
            path: entry.path,
          });
        });
    });

export const slideSchema = buildSlideSchema(blockSchema);
export type Slide = z.infer<typeof slideSchema>;
export type SlideLayout = Slide["layout"];

// 読み込み用。未知の type を通す
export const deckSchema = buildDeckSchema(blockSchema);
export type Deck = z.infer<typeof deckSchema>;

// 資料が指すテンプレート。旧い theme も受ける
export const deckTemplate = (deck: {
  template?: string;
  theme?: string;
}): string | undefined => deck.template ?? deck.theme;

// AI 出力用。カタログ内の type と使えるアイコン名だけを通す。JSON Schema の元
export const aiDeckSchema = buildDeckSchema(aiBlockSchema);

export type DeckCheck =
  | { success: true; deck: Deck }
  | { success: false; message: string };

const checkWith =
  (schema: z.ZodType<Deck>) =>
  (input: unknown): DeckCheck => {
    const result = schema.safeParse(input);
    return result.success
      ? { success: true, deck: result.data }
      : { success: false, message: z.prettifyError(result.error) };
  };

export const checkDeck = checkWith(deckSchema);
export const checkAiDeck = checkWith(aiDeckSchema);

export const validateDeck = (input: unknown): Deck => {
  const result = checkDeck(input);
  if (!result.success) throw new Error(result.message);
  return result.deck;
};
