import catalogEn from "../dev/block-catalog.en.json";
import catalog from "../dev/block-catalog.json";
import { isKnownBlock } from "../schema/block.ts";
import { type Deck, deckSchema } from "../schema/deck.ts";
import type { Locale } from "../schema/profile.ts";

const CATALOGS: Record<Locale, unknown> = { ja: catalog, en: catalogEn };

// 見本のスライド。開発用のブロック一覧から、未知の type を除いて使う。
// design/samples/slide.html とデザインページのはみ出し検査が同じ資料を描く。
// 英語の一覧(block-catalog.en.json)は日本語と同じ並び・座標で、文だけを訳してある
export const sampleDeck = (lang: Locale = "ja"): Deck => {
  const deck = deckSchema.parse(CATALOGS[lang]);
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      blocks: slide.blocks.filter(isKnownBlock),
    })),
  };
};

// 見本の画像(assets/sample.svg)は app/public/dev/ に置いてある
export const SAMPLE_ASSET_BASE = "/dev";

// テンプレートに同梱する絵(design/templates/slide/<名前>/assets/)は、design build が
// design/samples/slide.<名前>/assets/ へ写す。見本の HTML(samples/slide.<名前>.html)はこの相対の基点で読む
export const templateSampleAssetDir = (template: string): string =>
  `slide.${template}`;

// 画面で見本(そのテンプレートの sample.json)を描くときの基点
export const templateSampleAssetBase = (template: string): string =>
  `/api/design/files/samples/${templateSampleAssetDir(encodeURIComponent(template))}`;
