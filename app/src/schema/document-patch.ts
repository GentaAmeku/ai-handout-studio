import { z } from "zod";
import { documentBlockSchema, shortId } from "./document.ts";

// HTML 資料の AI の編集案。置き換えるのは指示された1つのセクションの blocks だけ(スライドの patch.ts と同じ考え方)。
// 残すブロックは元の id のまま。新しいブロックは id を書かず、取り込みのときにアプリが振る

const patchBlockOptions = documentBlockSchema.options.map((option) =>
  option.extend({ id: shortId.optional() }),
) as unknown as [
  (typeof documentBlockSchema.options)[number],
  ...(typeof documentBlockSchema.options)[number][],
];

export const documentPatchBlockSchema = z.discriminatedUnion(
  "type",
  patchBlockOptions,
) as unknown as z.ZodType<
  Omit<z.infer<typeof documentBlockSchema>, "id"> & { id?: string | undefined },
  Omit<z.input<typeof documentBlockSchema>, "id"> & { id?: string | undefined }
>;

export const documentPatchSchema = z.strictObject({
  sectionId: z.string().min(1),
  blocks: z.array(documentPatchBlockSchema),
});

export type DocumentPatch = z.infer<typeof documentPatchSchema>;
export type DocumentPatchBlock = DocumentPatch["blocks"][number];

export type DocumentPatchCheck =
  | { success: true; patch: DocumentPatch }
  | { success: false; message: string };

export const checkDocumentPatch = (input: unknown): DocumentPatchCheck => {
  const result = documentPatchSchema.safeParse(input);
  return result.success
    ? { success: true, patch: result.data }
    : { success: false, message: z.prettifyError(result.error) };
};
