import type { Locale } from "../src/schema/profile.ts";
import {
  type SheetDocument,
  type SheetQuestion,
  sheetDocumentSchema,
} from "../src/schema/sheet.ts";
import { HANDOUT_STRINGS } from "./handout-i18n.ts";

// 質問 JSON の検査。形の合否は sheetDocumentSchema(Zod)が決め、中身の判断は警告にとどめる

export type SheetFileCheck =
  | { ok: true; sheet: SheetDocument; warnings: string[] }
  | { ok: false; errors: string };

type Option = { id: string; label: string };

// 半角・全角の括弧の「(推奨)」だけを見る。「推奨値」のような途中の語は対象にしない。
// 二重の判定(末尾)は、英語の質問票の印「 (recommended)」も見る
const RECOMMENDED_WORD = /\(推奨\)|（推奨）/;
const RECOMMENDED_SUFFIX = /(?:\(推奨\)|（推奨）|\(recommended\))$/i;

// 画面が選択肢の後ろに足す推奨の印。文言は質問票の言語の辞書から取る。
// 作者が label の末尾に書いていたら二重にしない
export const recommendedMark = (
  question: SheetQuestion,
  option: Option,
  lang: Locale = "ja",
): string =>
  question.recommended?.includes(option.id) &&
  !RECOMMENDED_SUFFIX.test(option.label.trim())
    ? HANDOUT_STRINGS[lang].sheet.recommendedMark
    : "";

// 見た目に関わる語。選択肢のある質問の題か要約にあって、案ごとの画像(images)が無ければ知らせる。
// 選択肢の文までは見ない(「見た目を確かめる」のような項目で出すぎる)。語で見るので外れることもある。保存は止めない
const LOOK_WORD =
  /デザイン|見た目|レイアウト|配色|配置|色|UI|モック|画面|意匠|外観/;

const lookWordOf = (question: SheetQuestion): string | undefined => {
  if ((question.options ?? []).length === 0) return undefined;
  const text = [question.title, question.summary ?? ""].join("\n");
  return LOOK_WORD.exec(text)?.[0];
};

const recommendedWarnings = (question: SheetQuestion): string[] =>
  (question.options ?? [])
    .filter((option) => RECOMMENDED_WORD.test(option.label))
    .map(
      (option) =>
        `質問 ${question.id}: 選択肢 ${option.id} の label に (推奨) がある。推奨は recommended で示す。label に (推奨) を書かない`,
    );

const imageWarnings = (question: SheetQuestion): string[] => {
  const word = lookWordOf(question);
  return word && question.visual?.type !== "images"
    ? [
        `質問 ${question.id}: 見た目に関わる質問(「${word}」)に案ごとの画像が無い。visual を images にして、案ごとのイメージ画像を並べる(要らない質問ならこの警告は無視してよい)`,
      ]
    : [];
};

export const sheetWarnings = (doc: SheetDocument): string[] =>
  doc.questions.flatMap((question) => [
    ...recommendedWarnings(question),
    ...imageWarnings(question),
  ]);

export const checkSheetFile = (input: unknown): SheetFileCheck => {
  const parsed = sheetDocumentSchema.safeParse(input);
  return parsed.success
    ? { ok: true, sheet: parsed.data, warnings: sheetWarnings(parsed.data) }
    : { ok: false, errors: parsed.error.message };
};

// 質問 JSON は questions を持つ。deck.json は slides、document.json は sections を持つ
export const isSheetInput = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "questions" in value &&
  !("slides" in value) &&
  !("sections" in value);
