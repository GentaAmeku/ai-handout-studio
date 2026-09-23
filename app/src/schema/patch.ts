import { z } from "zod";
import { patchBlockSchema } from "./block.ts";

// AI の編集案。置き換えるのは対象スライドの blocks だけ

export const slidePatchSchema = z.strictObject({
  slideId: z.string().min(1),
  blocks: z.array(patchBlockSchema),
});

// デッキ全体への編集案も、スライドごとのパッチの集まりとして受け取る
export const deckPatchSchema = z.strictObject({
  patches: z.array(slidePatchSchema).min(1),
});

export const patchSchema = z.union([slidePatchSchema, deckPatchSchema]);

export type SlidePatch = z.infer<typeof slidePatchSchema>;
export type DeckPatch = z.infer<typeof deckPatchSchema>;
export type Patch = z.infer<typeof patchSchema>;

export type PatchCheck =
  | { success: true; patches: SlidePatch[] }
  | { success: false; message: string };

export const toSlidePatches = (patch: Patch): SlidePatch[] =>
  "patches" in patch ? patch.patches : [patch];

export const checkPatch = (input: unknown): PatchCheck => {
  const result = patchSchema.safeParse(input);
  return result.success
    ? { success: true, patches: toSlidePatches(result.data) }
    : { success: false, message: z.prettifyError(result.error) };
};
