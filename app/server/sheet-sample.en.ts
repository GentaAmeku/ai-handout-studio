import type { SampleText } from "./sample-i18n.ts";

// 質問票の見本(sheet-sample.ts)の英語。日本語の文 → 英語。
// 日本語の見本の文を変えたら、ここの左も合わせる(英語の見本に日本語が残るとテストが止まる)
export const SHEET_SAMPLE_EN: SampleText = new Map([
  ["更新の進め方を決める", "Decide how to proceed with the update"],
  [
    "合成の見本です。検証結果と変更範囲を確認してから、回答を選んでください。",
    "This is a made-up sample. Check the test results and the scope of the change, then choose your answers.",
  ],
  [
    "合成の相談です。回答による外部操作はありません。",
    "A made-up consultation. Your answers don't trigger any outside actions.",
  ],
  ["どの案で更新を進めますか", "Which option should the update follow?"],
  [
    "設定の修正だけで進める案と、実行ツールも移行する案を比較します。",
    "Compare only fixing the settings with also moving the runner.",
  ],
  [
    "案Aは、設定の修正と不要なコメントの削除で検証が通った想定です。変更範囲を限定できますが、処理時間の短縮は今回の対象に含みません。\n\n案Bは、型チェック用の環境を分ける想定です。実行方法を保てる一方、複数の環境を管理する手順が必要になります。案Cは、実行ツールも移行する想定です。関連するスクリプトの動作確認を含めて範囲を決めます。",
    "Option A assumes the checks pass after fixing the settings and removing unneeded comments. It keeps the change small, but making processing faster is out of scope this time.\n\nOption B assumes a separate environment for type checks. It keeps how things run, but needs steps to manage several environments. Option C assumes the runner moves too. Its scope includes checking that the related scripts still work.",
  ],
  ["設定の修正だけで進める", "Only fix the settings"],
  ["型チェック用の環境を分ける", "Split out a type-check environment"],
  ["実行ツールも移行する", "Also move the runner"],
  ["検証結果と変更範囲を比べる", "Compare test results and scope of change"],
  ["案", "Option"],
  ["目的", "Goal"],
  ["必要な変更", "Changes needed"],
  ["確認状況", "Status"],
  ["案A", "Option A"],
  ["変更を小さく保つ", "Keep the change small"],
  ["設定の修正・コメント削除", "Fix settings, remove comments"],
  ["検証通過（合成例）", "Checks pass (made-up)"],
  ["案B", "Option B"],
  ["型チェックを分ける", "Separate the type checks"],
  ["別環境の追加・運用手順", "New environment, run steps"],
  ["運用方法の確認が必要", "Operation needs review"],
  ["案C", "Option C"],
  ["実行方法も見直す", "Rethink how it runs"],
  ["ツールとスクリプトの移行", "Move the tool and scripts"],
  ["影響範囲の確認が必要", "Impact needs review"],
  ["案Aは検証通過（合成例）", "Option A passes the checks (made-up)"],
  [
    "案Aだけでは処理時間は短くなりません。速さも求める場合は、追加作業を別途判断します。",
    "Option A alone won't make processing faster. If you also want speed, extra work is decided separately.",
  ],
  ["図の位置づけ", "About the figure"],
  [
    "図は初期案の変更範囲です。回答文を編集しても図は変わりません。",
    "The figure shows the scope of the initial proposal. Editing your answer doesn't change it.",
  ],
  ["どこで人の確認を挟みますか", "Where should a person review?"],
  [
    "AIが作った修正を、本番へ反映するまでの流れです。",
    "The flow from an AI-made fix to production.",
  ],
  ["本番へ反映する前に確認する", "Review before it goes to production"],
  ["反映後に結果を確認する", "Review the result after release"],
  [
    "初期案は、人の確認が済むまで本番へ進みません。",
    "In the initial proposal, nothing goes to production until a person has reviewed it.",
  ],
  ["修正とテスト", "Fix and test"],
  ["人が確認", "A person reviews"],
  ["修正を続ける", "Keep fixing"],
  ["本番へ反映", "Release to production"],
  [
    "図は初期案を示しています。回答を書き換えても図は変わりません。",
    "The figure shows the initial proposal. Rewriting your answer doesn't change it.",
  ],
  [
    "この回答だけで本番への反映を許可するものではありません。",
    "This answer alone doesn't approve a release to production.",
  ],
  ["反映の前に何を確かめますか", "What should be checked before release?"],
  ["当てはまるものをすべて選びます。", "Choose all that apply."],
  ["自動テストの結果", "Automated test results"],
  ["変更差分の読み合わせ", "Reading the diff together"],
  ["検証環境での動作", "Behavior on staging"],
  ["補足（任意）", "Notes (optional)"],
  ["確認した人", "Reviewed by"],
  ["共有先（任意）", "Share with (optional)"],
  ["一覧の見た目はどちらに寄せますか", "Which look should the list follow?"],
  [
    "案ごとのイメージを並べます。画像は今の画面を撮ったものです。",
    "An image for each option. The pictures are captures of the current screens.",
  ],
  ["案A 資料一覧の形に寄せる", "Option A: follow the handout list"],
  ["案B テンプレートの一覧の形に寄せる", "Option B: follow the template list"],
  [
    "イメージ(今の画面を撮ったもの)",
    "Images (captures of the current screens)",
  ],
  ["案A 資料一覧", "Option A: handout list"],
  [
    "お気に入りの資料が上に分かれて並ぶ、資料一覧の画面",
    "The handout list screen, with favorites grouped at the top",
  ],
  ["案B テンプレートの一覧", "Option B: template list"],
  [
    "既定のテンプレートが上に、ほかのテンプレートが3列で並ぶ画面",
    "The screen with the default template on top and the others in three columns",
  ],
  // 入力済みの回答。推奨の印は画面の文言(" (recommended)")に合わせる
  ["設定の修正だけで進める（推奨）", "Only fix the settings (recommended)"],
  [
    "本番へ反映する前に確認する（推奨）",
    "Review before it goes to production (recommended)",
  ],
]);
