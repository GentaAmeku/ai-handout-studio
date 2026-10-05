// AI Handout Studio の資料の区分。id の頭(deck_・doc_・sheet_)で分かる
export type HandoutKind = "deck" | "document" | "sheet";

// 帯とパネルの言葉。studio の設定(workspace/profile.json の locale)に合わせる
export type Locale = "ja" | "en";

// この mod が入っている clone の場所
export type Studio = {
  // clone の根(mods/handout-watch の2つ上)
  root: string;
  // 資料の置き場。AI_HANDOUT_STUDIO_WORKSPACE があればそこ
  workspace: string;
};

// この会話で作った・直した資料1件。区分ごとの meta.json・deck.json・questions.json から作る
export type HandoutRow = {
  id: string;
  kind: HandoutKind;
  title: string;
  description: string;
  // 質問票は質問の数、スライドは枚数、HTML 資料は章の数
  count: number;
  questionTitles: string[];
  createdAt: number;
  updatedAt: number;
  // 質問票の回答が保存されているか。ほかの区分は常に false
  isAnswered: boolean;
};

declare module "claude-code" {
  interface PluginState {
    "handout-watch": {
      // clone の場所。mod が clone の外に置かれて見つからなければ null
      studio: Studio | null;
      locale: Locale;
      // この会話で作った・直した資料の id
      tracked: string[];
      // tracked の中身(未回答の質問票が先、あとは直した新しい順)
      handouts: HandoutRow[];
      // 帯から隠した id。この会話の間だけ覚える
      hidden: string[];
      // studio のサーバーが応えるか。まだ確かめていなければ null
      isServerUp: boolean | null;
      // 最後に見た時刻。経過時間の基準にも使う
      scannedAt: number;
      // studio のアイコン(favicon.svg)。読めなければ null
      icon: string | null;
    };
  }
}
