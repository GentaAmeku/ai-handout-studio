import { z } from "zod";
import { sheetBaseNames, templateName } from "./design.ts";

// 質問票と HTML 資料の meta.json(workspace/sheets/<id>/・workspace/documents/<id>/)。
// 中身(questions.json・document.html)とは別に、題名・テンプレート・日付をここが持つ。
// 中身が読めなくなっても資料一覧に出せるようにする

export const handoutMetaSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  template: templateName,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  // 質問票だけ。骨格(89 で「レイアウト」に言い換えた語)を明示に選んだとき。
  // 無ければテンプレートの layout.base を使う(handout-html.ts の sheetBaseOf)
  layout: z.enum(sheetBaseNames).optional(),
});

export type HandoutMeta = z.infer<typeof handoutMetaSchema>;
