import type { Locale } from "../src/schema/profile.ts";
import type { SheetAnswers, SheetDocument } from "../src/schema/sheet.ts";
import { localizeSample } from "./sample-i18n.ts";
import { sampleImages } from "./sample-images.ts";
import { SAMPLE_ORG_NAMES } from "./sample-org.ts";
import { withSheetImageSrcs } from "./sheet-images.ts";
import { sheetBody, sheetView } from "./sheet-render.ts";
import { SHEET_SAMPLE_EN } from "./sheet-sample.en.ts";

// 質問票の見本(design/samples/sheet.<骨格>.html)の中身。
// DOM を組むのは sheet-render.ts。ここが持つのは、質問票スキルの
// examples/reading.json・visual-demo.json を元にした合成の4問だけ(4問目は案ごとのイメージ画像)。
// 英語の見本は同じ形のまま、文を sheet-sample.en.ts の表で置き換える

export const SHEET_LAYOUTS = ["focus", "overview", "all", "print"] as const;
export type SheetLayout = (typeof SHEET_LAYOUTS)[number];

const sample: SheetDocument = {
  schemaVersion: 1,
  id: "reading-demo",
  revision: "1",
  title: "更新の進め方を決める",
  description:
    "合成の見本です。検証結果と変更範囲を確認してから、回答を選んでください。",
  context: "合成の相談です。回答による外部操作はありません。",
  questions: [
    {
      id: "version",
      title: "どの案で更新を進めますか",
      type: "single",
      summary:
        "設定の修正だけで進める案と、実行ツールも移行する案を比較します。",
      detail:
        "案Aは、設定の修正と不要なコメントの削除で検証が通った想定です。変更範囲を限定できますが、処理時間の短縮は今回の対象に含みません。\n\n案Bは、型チェック用の環境を分ける想定です。実行方法を保てる一方、複数の環境を管理する手順が必要になります。案Cは、実行ツールも移行する想定です。関連するスクリプトの動作確認を含めて範囲を決めます。",
      options: [
        { id: "a", label: "設定の修正だけで進める" },
        { id: "b", label: "型チェック用の環境を分ける" },
        { id: "c", label: "実行ツールも移行する" },
      ],
      recommended: ["a"],
      visual: {
        type: "comparison",
        caption: "検証結果と変更範囲を比べる",
        columns: ["案", "目的", "必要な変更", "確認状況"],
        rows: [
          [
            "案A",
            "変更を小さく保つ",
            "設定の修正・コメント削除",
            { text: "検証通過（合成例）", kind: "success" },
          ],
          [
            "案B",
            "型チェックを分ける",
            "別環境の追加・運用手順",
            { text: "運用方法の確認が必要", kind: "info" },
          ],
          [
            "案C",
            "実行方法も見直す",
            "ツールとスクリプトの移行",
            { text: "影響範囲の確認が必要", kind: "warning" },
          ],
        ],
      },
      notices: [
        { kind: "success", text: "案Aは検証通過（合成例）" },
        {
          kind: "warning",
          text: "案Aだけでは処理時間は短くなりません。速さも求める場合は、追加作業を別途判断します。",
        },
      ],
      explorer: true,
      evidence: [
        {
          label: "図の位置づけ",
          text: "図は初期案の変更範囲です。回答文を編集しても図は変わりません。",
        },
      ],
    },
    {
      id: "approval",
      title: "どこで人の確認を挟みますか",
      type: "single",
      summary: "AIが作った修正を、本番へ反映するまでの流れです。",
      options: [
        { id: "before", label: "本番へ反映する前に確認する" },
        { id: "after", label: "反映後に結果を確認する" },
      ],
      recommended: ["before"],
      visual: {
        type: "flow",
        figure: {
          figure: 1,
          caption: "初期案は、人の確認が済むまで本番へ進みません。",
          flow: [
            { label: "修正とテスト" },
            {
              label: "人が確認",
              kind: "branch",
              fork: [{ label: "修正を続ける" }, { label: "本番へ反映" }],
            },
          ],
        },
      },
      notices: [
        {
          kind: "info",
          text: "図は初期案を示しています。回答を書き換えても図は変わりません。",
        },
        {
          kind: "warning",
          text: "この回答だけで本番への反映を許可するものではありません。",
        },
      ],
    },
    {
      id: "checks",
      title: "反映の前に何を確かめますか",
      type: "multiple",
      summary: "当てはまるものをすべて選びます。",
      options: [
        { id: "test", label: "自動テストの結果" },
        { id: "diff", label: "変更差分の読み合わせ" },
        { id: "staging", label: "検証環境での動作" },
      ],
      recommended: ["test", "diff"],
      noteLabel: "補足（任意）",
      fields: [
        { id: "checker", label: "確認した人", required: true },
        { id: "note", label: "共有先（任意）" },
      ],
    },
    {
      id: "look",
      title: "一覧の見た目はどちらに寄せますか",
      type: "single",
      summary: "案ごとのイメージを並べます。画像は今の画面を撮ったものです。",
      options: [
        { id: "list", label: "案A 資料一覧の形に寄せる" },
        { id: "templates", label: "案B テンプレートの一覧の形に寄せる" },
      ],
      recommended: ["list"],
      visual: {
        type: "images",
        caption: "イメージ(今の画面を撮ったもの)",
        items: [
          {
            src: "assets/sample-screen.jpg",
            label: "案A 資料一覧",
            alt: "お気に入りの資料が上に分かれて並ぶ、資料一覧の画面",
          },
          {
            src: "assets/sample-templates.jpg",
            label: "案B テンプレートの一覧",
            alt: "既定のテンプレートが上に、ほかのテンプレートが3列で並ぶ画面",
          },
        ],
      },
    },
  ],
};

// 見本の中で入力済みにした回答。1問目だけが確認済み、2問目は初期値のまま
const sampleAnswers: SheetAnswers = {
  schemaVersion: 1,
  documentId: sample.id,
  revision: sample.revision,
  answers: [
    {
      id: "version",
      selected: ["a"],
      text: "設定の修正だけで進める（推奨）",
      reviewed: true,
    },
    {
      id: "approval",
      selected: ["before"],
      text: "本番へ反映する前に確認する（推奨）",
      reviewed: false,
    },
    { id: "checks", selected: [], text: "", reviewed: false },
    { id: "look", selected: [], text: "", reviewed: false },
  ],
};

// 1問ずつ(focus・overview)は一覧を開いて始まるので、一覧に入力済み・初期値あり・未入力が
// 並ぶよう2問目を開いた状態で見せる
const currentOf = (layout: SheetLayout): number =>
  layout === "focus" || layout === "overview" ? 1 : 0;

export const sheetSample = (
  lang: Locale = "ja",
): { sheet: SheetDocument; answers: SheetAnswers } =>
  lang === "ja"
    ? { sheet: sample, answers: sampleAnswers }
    : {
        sheet: localizeSample(sample, SHEET_SAMPLE_EN),
        answers: localizeSample(sampleAnswers, SHEET_SAMPLE_EN),
      };

export const sheetSampleBody = (
  layout: SheetLayout,
  lang: Locale = "ja",
): string => {
  const { sheet, answers } = sheetSample(lang);
  return sheetBody(
    {
      ...sheetView(
        withSheetImageSrcs(
          sheet,
          sampleImages(["sample-screen.jpg", "sample-templates.jpg"]),
        ),
        answers,
        currentOf(layout),
        lang,
      ),
      orgName: SAMPLE_ORG_NAMES[lang],
    },
    layout,
  );
};
