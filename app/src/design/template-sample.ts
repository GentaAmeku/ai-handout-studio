import type { Slide } from "../schema/deck";
import type { SlideSample } from "../schema/design";
import {
  SAMPLE_ASSET_BASE,
  sampleDeck,
  templateSampleAssetBase,
} from "./sample-deck";

// テンプレートが持つ中身の見本(sample.json)から、画面に出すページを選ぶ。
// 見本は本物の deck.json(座標つき)なので、ここに出せるものは「この見た目で作成」でもそのまま作れる

// 見本を持たないテンプレートの落とし先。開発用のブロック一覧を共通の見本として使う
let fallback: Slide[] | undefined;
const commonSlides = (): Slide[] => {
  fallback ??= sampleDeck().slides;
  return fallback;
};

const slidesOf = (sample: SlideSample | null | undefined): Slide[] =>
  sample && sample.slides.length > 0 ? sample.slides : commonSlides();

// 見本の表紙。テンプレートの一覧のカードと、見た目から資料を作るときの選択肢に出す。
// 表紙は飾り(.ds-decoration__shape--1〜--6)が一番効くので、1枚で見比べられる
export const coverSlide = (
  sample: SlideSample | null | undefined,
): Slide | undefined => slidesOf(sample)[0];

// 見本の画像の基点。そのテンプレートの見本は同梱の絵(assets/)を、共通の見本は開発用の画像を読む
export const sampleAssetBase = (
  template: string,
  sample: SlideSample | null | undefined,
): string =>
  sample && sample.slides.length > 0
    ? templateSampleAssetBase(template)
    : SAMPLE_ASSET_BASE;

// 編集画面の見本。そのテンプレートの資料を全ページ出す(部品の見本はこの後ろに足す)
export const editorSlides = (sample: SlideSample | null | undefined): Slide[] =>
  slidesOf(sample);
