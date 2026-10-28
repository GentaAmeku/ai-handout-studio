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
  // 質問票だけ。作った場所(sheet new を走らせたフォルダとブランチ、AI が --from で渡す会話の名前)。
  // 会話を並べて使うと、どの会話の質問票か分からなくなるので、原寸の画面とタブ名に「質問元」として出す
  askedFrom: z
    .strictObject({
      folder: z.string().trim().min(1).max(100),
      branch: z.string().trim().min(1).max(100).optional(),
      conversation: z.string().trim().min(1).max(100).optional(),
    })
    .optional(),
});

export type AskedFrom = NonNullable<HandoutMeta["askedFrom"]>;

export type HandoutMeta = z.infer<typeof handoutMetaSchema>;
