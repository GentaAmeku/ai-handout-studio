import type { OverflowReport } from "../renderer/overflow";
import type { Deck, Slide } from "../schema/deck";
import type {
  Components,
  Selection,
  SheetBase,
  SlideSample,
  Surface,
  TemplateOf,
  Tokens,
} from "../schema/design";
import type { DocumentFile } from "../schema/document";
import type { DocumentPatch } from "../schema/document-patch";
import type { SlidePatch } from "../schema/patch";
import type { Locale, Profile } from "../schema/profile";

// 画面と API の間でやり取りする形。サーバーとブラウザの両方から読む

// 資料一覧の1件。お気に入りかどうかは workspace/favorites.json から足す
export type WithFavorite<T> = T & { favorite: boolean };

export type FavoriteResult = { id: string; favorite: boolean };

export type DeckSummary =
  | {
      state: "ready";
      deckId: string;
      title: string;
      status: Deck["status"];
      tags: string[];
      template?: string;
      slideCount: number;
      updatedAt: string;
      cover: Slide | null;
    }
  | {
      state: "invalid";
      deckId: string;
      message: string;
      updatedAt: string;
    };

export type DeckDetail =
  | { state: "ready"; deckId: string; deck: Deck }
  | { state: "invalid"; deckId: string; message: string };

// スライドの中身の構成(templates/slide/<名前>/sample.json)
export type OutlineSummary = {
  outlineId: string;
  title: string;
  slideCount: number;
  cover: Slide | null;
  // 表紙の次のページ。テンプレートの一覧で本文の見本に使う
  body: Slide | null;
};

export type ExportFormat = "pdf" | "png" | "html" | "pptx";

export type ExportResult = {
  format: ExportFormat;
  // 書き出し先の絶対パス。files はその中のファイル名
  directory: string;
  files: string[];
  // 画面の「パスをコピー」が写すパス。ファイルが1つならそのファイル、いくつもあれば directory
  path: string;
  // 書き出したファイルの入ったフォルダを開くコマンド。サーバーの OS に合わせる
  openCommand: string;
  overflow: OverflowReport[];
};

// 依頼を渡すコマンド。リポジトリの直下で実行する形になっている
export type AgentCommands = Record<AgentId, string>;

// 履歴(versions/)。読めない版も一覧に残し、error に理由を入れる
export type VersionSummary = {
  versionId: string;
  savedAt: string;
  source: "save" | "generated";
  title?: string;
  slideCount?: number;
  // HTML 資料だけ
  sectionCount?: number;
  // HTML 資料だけ。比べる相手(1つ新しい版か今の資料)が読めないときは無い
  changes?: VersionChanges;
  error?: string;
};

// HTML 資料の版で変わった所。版はその保存で上書きされる前の姿なので、1つ新しい版
// (最新の版なら今の資料)と比べる。見るのはセクションの単位までで、細かい差分は持たない
export type SectionChange = "added" | "removed" | "changed" | "same";

export type VersionChanges = {
  // 題名・リード・要約・署名・脇の欄・足・目次・章の見せ方・テンプレート・言語のどれかが変わった
  front: boolean;
  // 両方にあるセクションの並びが変わった
  reordered: boolean;
  // 変更後のセクションの並びに、消えたセクションを元の位置で差し込んだもの
  sections: {
    id: string;
    heading: string;
    level: 2 | 3;
    change: SectionChange;
  }[];
};

export type VersionDetail = {
  versionId: string;
  savedAt: string;
  deck: Deck;
};

export type DocumentVersionDetail = {
  versionId: string;
  savedAt: string;
  document: DocumentFile;
};

// AI の編集案。依頼は ai/{日時}/ にまとめ、パッチはそのフォルダへ書いてもらう
export type AiRequestDetail = {
  requestId: string;
  requestPath: string;
  patchPath: string;
  commands: AgentCommands;
};

export type AiPatchStatus =
  | { state: "none" }
  | { state: "invalid"; message: string }
  | { state: "ready"; patches: SlidePatch[] };

export type DocumentAiPatchStatus =
  | { state: "none" }
  | { state: "invalid"; message: string }
  | { state: "ready"; patch: DocumentPatch };

// AI パネルからのエージェント起動(試作)。run は ai/{日時}/ の依頼にぶら下がる
// 表(scripts/harnesses.mjs)の id と同じ。agent-table.test.ts が揃っているか確かめる
export type AgentId =
  | "claude"
  | "codex"
  | "opencode"
  | "gemini"
  | "cursor"
  | "grok";

// GET /api/agents の 1 件。手元の PATH にあるものだけ返る
export type AgentInfo = { id: AgentId; label: string };

export type AgentRunStatus = {
  runId: string;
  deckId: string;
  requestId: string;
  agent: AgentId;
  command: string;
  state: "running" | "done" | "failed" | "cancelled";
  exitCode?: number;
  message?: string;
  logTail?: string;
  startedAt: string;
  updatedAt: string;
};

// 未設定なら profile は null
// locale は画面の言語(149)が読む既定値込みの値。資料ごとの言語(schema/profile の lang)とは別
export type ProfileDetail = { profile: Profile | null; locale: Locale };

// テンプレートの一覧の1件
export type DesignTemplateSummary = {
  name: string;
  label: string;
  description?: string;
};

export type DesignTemplatesDetail = {
  tokens: Tokens;
  components: Components;
  // 区分ごとのテンプレート(design/templates/<区分>/)。名前の順
  templates: Record<Surface, DesignTemplateSummary[]>;
  // 区分ごとの既定のテンプレート(design/selection.json)
  selection: Selection;
};

export type DesignTemplateDetail = {
  [S in Surface]: {
    surface: S;
    name: string;
    template: TemplateOf[S];
  };
}[Surface];

// テンプレートが持つ中身の見本(design/templates/slide/<名前>/sample.json)。持たなければ sample は null
export type DesignTemplateSampleDetail = {
  surface: Surface;
  name: string;
  sample: SlideSample | null;
};

export type DesignBuildResult = { files: string[] };

// 質問票と HTML 資料(workspace/sheets/・workspace/documents/)。
// 中身が読めない資料も一覧から消さず、error に理由を入れる
export type HandoutKind = "sheet" | "document";

export type HandoutSummary = {
  kind: HandoutKind;
  id: string;
  title: string;
  // テンプレートの名前(design/templates/<区分>/)
  template: string;
  createdAt: string;
  updatedAt: string;
  // 質問票だけ
  questionCount?: number;
  hasAnswers?: boolean;
  // いま効いているレイアウト(骨格)。控えの layout か、無ければテンプレートの既定
  layout?: SheetBase;
  error?: string;
  // 公開した Artifact の URL(share.json)。資料の1件の詳細だけに乗る。無ければ null
  shareUrl?: string | null;
};

// 資料の1件。お気に入りかどうかも1件の取得にだけ足す(1件の画面の帯の ☆)
export type HandoutDetail = WithFavorite<HandoutSummary>;

export type HandoutExportResult = {
  kind: HandoutKind;
  id: string;
  // 書き出した単体 HTML の絶対パス
  path: string;
  // 書き出したファイルの入ったフォルダを開くコマンド。サーバーの OS に合わせる
  openCommand: string;
};

// 共有用の束を作る(128。束の作り方は 127 の buildShareBundle)
export type ShareFileEntry = { readonly name: string; readonly bytes: number };

export type ShareApiResult = {
  bundle: string;
  files: readonly ShareFileEntry[];
  textBytes: number;
  warning?: string;
  // 前に公開した URL(share.json)。無ければ null
  url: string | null;
  // Claude Code に渡す依頼文
  prompt: string;
};

// code はサーバーの守りが断ったときだけ付く。画面はこれを見て文言を訳す
export type ApiErrorBody = { error: string; code?: string };
