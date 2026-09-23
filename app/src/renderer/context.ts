import type { Profile } from "../schema/profile";

// ページ番号や組織名は全スライドへ複製せず、描画時に Renderer から渡す
export type RenderContext = {
  pageNumber: number;
  pageCount: number;
  assetBaseUrl: string;
  orgName?: string;
  // deck.json の template(旧い theme)。未指定はスライドの既定のテンプレート(design/selection.json)
  template?: string;
  // デザインページの編集中の値。あればテンプレートの名前より優先して変数を当てる
  themeVariables?: Readonly<Record<string, string>>;
};

export const resolveAsset = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/${path}`;

export const deckAssetBaseUrl = (deckId: string): string =>
  `/api/decks/${encodeURIComponent(deckId)}`;

// プロフィールの値を描画の文脈へ足す。組織名が空なら足さず、描画側は何も出さない
export const withProfile = (
  context: RenderContext,
  profile?: Profile | null,
): RenderContext =>
  profile?.orgName ? { ...context, orgName: profile.orgName } : context;
