import { z } from "zod";
import { aiDeckSchema } from "./deck.ts";
import { documentFileSchema } from "./document.ts";
import { documentPatchSchema } from "./document-patch.ts";
import { patchSchema } from "./patch.ts";

// エージェントに渡す JSON Schema。skills/ai-handout-studio/*.schema.json はこれを書き出したもの

export const buildDeckJsonSchema = () => ({
  ...z.toJSONSchema(aiDeckSchema, { target: "draft-2020-12", io: "input" }),
  title: "ai-handout-studio deck",
  description:
    "1280x720 のスライド資料。色・フォントは持たず、文章・構造・配置だけを持つ。",
});

export const buildPatchJsonSchema = () => ({
  ...z.toJSONSchema(patchSchema, { target: "draft-2020-12", io: "input" }),
  title: "ai-handout-studio patch",
  description:
    "1スライド分の blocks を置き換える編集案。新しいブロックは id を書かない。",
});

export const buildDocumentJsonSchema = () => ({
  ...z.toJSONSchema(documentFileSchema, {
    target: "draft-2020-12",
    io: "input",
  }),
  title: "ai-handout-studio document",
  description:
    "HTML 資料(設計書・要求要件・調査結果)。文章・構造だけを持ち、色・書体・寸法は持たない。",
});

export const buildDocumentPatchJsonSchema = () => ({
  ...z.toJSONSchema(documentPatchSchema, {
    target: "draft-2020-12",
    io: "input",
  }),
  title: "ai-handout-studio document patch",
  description:
    "HTML 資料の1つのセクションの blocks を置き換える編集案。新しいブロックは id を書かない。",
});
