import type { SampleText } from "./sample-i18n.ts";

// 文書の見本(document-sample.ts)の英語。日本語の文 → 英語。
// 日本語の見本の文を変えたら、ここの左も合わせる(英語の見本に日本語が残るとテストが止まる)
export const DOCUMENT_SAMPLE_EN: SampleText = new Map([
  ["文書の見本", "Document sample"],
  ["文書の見本 / 2026-09-18", "Document sample / 2026-09-18"],
  ["部品の見え方を確かめる", "Check how the parts look"],
  [
    "テーマの色・余白・部品の変種を変えると、この文書と質問票・スライドが同時に変わる。",
    "Change the theme's colors, spacing or part variants, and this document, the question sheets and the slides change together.",
  ],
  ["要約", "Summary"],
  [
    "表・カード・注意・図はテーマの変種で見た目が決まる。本文幅・脇・目次の位置は文書のレイアウトの型が決める。",
    "Tables, cards, notices and figures take their look from the theme's variants. The text width and the places of the side panel and the contents come from the document's layout.",
  ],
  ["表", "Table"],
  [
    "短い対応関係に使う。罫線・縞・最小の変種と、密度のパラメータがある。",
    "For short correspondences. There are ruled, striped and minimal variants, and a density setting.",
  ],
  ["段", "Stage"],
  ["内容", "Work"],
  ["担当", "Owner"],
  ["日数", "Days"],
  ["調査", "Research"],
  ["現状を聞き取る", "Hear how things are now"],
  ["自分", "Me"],
  ["設計", "Design"],
  ["方式を決める", "Choose the approach"],
  ["実装", "Build"],
  ["画面を作る", "Make the screens"],
  ["確認", "Review"],
  ["見本で確かめる", "Check with samples"],
  ["カード", "Cards"],
  ["案A", "Option A"],
  [
    "設定の修正だけで進める。変更は小さい。",
    "Only fix the settings. The change is small.",
  ],
  ["案B", "Option B"],
  [
    "型チェック用の環境を分ける。手順が増える。",
    "Split out an environment for type checks. More steps.",
  ],
  ["案C", "Option C"],
  [
    "実行ツールも移行する。確認の範囲が広い。",
    "Also move the runner. More to check.",
  ],
  ["注意", "Notices"],
  [
    "読み飛ばしても本筋が通るもの。",
    "Something you can skip without losing the thread.",
  ],
  [
    "帯と箱の変種がある。種類ごとの色は class で決まる。",
    "There are band and box variants. Each kind's color comes from its class.",
  ],
  ["検査がすべて通った。", "All checks passed."],
  ["処理時間は短くならない。", "It won't make processing faster."],
  [
    "元に戻せない操作。言葉を必ず添える。",
    "An action you can't undo. Always say so in words.",
  ],
  ["図", "Figure"],
  [
    "箱の形・矢印・線種はテーマの図の変種が決める。「外」の破線の枠だけは意味の区別なので変わらない。",
    "Box shapes, arrows and line styles come from the theme's figure variant. Only the dashed frame for “outside” stays, because it carries meaning.",
  ],
  [
    "図 依頼が届いてから記録に残るまで。規模の判断で3つに分かれ、記録へ合流する。",
    "Figure: from a request arriving to it being recorded. It splits three ways by size and joins again at the record.",
  ],
  ["依頼が届く", "Request arrives"],
  ["規模は", "How big?"],
  ["その場で直す", "Fix on the spot"],
  ["設計から作る", "Design first"],
  ["断る", "Decline"],
  ["記録に残す", "Record it"],
  ["画像", "Image"],
  [
    "スクリーンショットや生成した絵。ファイルは資料の assets/ に置き、描くときに埋め込む。",
    "Screenshots or generated pictures. Put the file in the handout's assets/; it is embedded when drawn.",
  ],
  ["スライドの資料一覧の画面", "The slide handout list screen"],
  [
    "資料一覧。お気に入りの資料が上に分かれて並ぶ",
    "The handout list. Favorites are grouped at the top",
  ],
  ["設計図", "Diagrams"],
  [
    "構成・シーケンス・ワークフロー・データの流れ・状態の移り変わりの設計図は ai-handout-studio diagram で画像に書き出し、画像として載せる。配色は図のものなので、テンプレートでは変わらない。",
    "Architecture, sequence, workflow, data flow and lifecycle diagrams are exported as images with ai-handout-studio diagram and placed as images. Their colors belong to the diagram, so the template doesn't change them.",
  ],
  ["構成図", "Architecture"],
  [
    "AI エージェント・CLI・API・画面・workspace・design・書き出しのつながり",
    "How the AI agent, CLI, API, screens, workspace, design and export connect",
  ],
  [
    "構成図: エージェントが書いた JSON を保存し、画面で直して書き出す",
    "Architecture: save the JSON the agent wrote, fix it on screen, and export",
  ],
  ["シーケンス図", "Sequence"],
  [
    "利用者・画面・API・workspace・印刷のあいだのやり取り",
    "Messages between the user, screen, API, workspace and printer",
  ],
  [
    "シーケンス図: 画面で書き出すを押してから PDF を受け取るまで",
    "Sequence: from pressing Export on screen to receiving the PDF",
  ],
  ["ワークフロー", "Workflow"],
  [
    "利用者・エージェント・Studio・差し戻しの段に分けた、依頼から反映までの流れ",
    "The flow from request to update, in lanes for the user, agent, Studio and send-backs",
  ],
  [
    "ワークフロー: 画面で書いた依頼をエージェントが直し、検査を通ったものだけ残す",
    "Workflow: the agent fixes what you asked for on screen, and only what passes the checks is kept",
  ],
  ["データの流れ", "Data flow"],
  [
    "JSON と画像が取り込み・保存・描画を経て、画面と書き出しへ届く流れ",
    "JSON and images pass through import, storage and rendering to the screen and export",
  ],
  [
    "データの流れ: JSON と画像を取り込み、描いて画面と書き出しへ渡す",
    "Data flow: import JSON and images, render them, and hand them to the screen and export",
  ],
  ["状態の移り変わり", "Lifecycle"],
  [
    "依頼・作成・編集中・検査・書き出し済みと、要修正から編集中へ戻る移り変わり",
    "Requested, created, editing, checking and exported, with a way back from needs-fixing to editing",
  ],
  [
    "状態の移り変わり: 頼んでから書き出すまで。検査に落ちたら編集へ戻る",
    "Lifecycle: from asking to exporting. Failing a check sends it back to editing",
  ],
  ["そのほかの部品", "Other parts"],
  ["番号の付く並び", "Numbered list"],
  ["1項目に1行の理由を添える。", "Give each item a one-line reason."],
  [
    "理由がない決定は、読者が後から覆せない。",
    "Readers can't revisit a decision later if it has no reason.",
  ],
  [
    "決定・仮説・未決を同じセクションに混ぜない。",
    "Don't mix decisions, hypotheses and open questions in one section.",
  ],
  ["引用", "Quote"],
  [
    "読みやすさは文書・文の連なり・文・語彙の四つの層で決まる。",
    "Readability is decided on four levels: the document, the run of sentences, the sentence and the words.",
  ],
  ["書き方の手引き", "A writing guide"],
  ["コード", "Code"],
  ["未決", "Open question"],
  [
    "段 E で新しいテンプレートの見本を決める。",
    "Decide the samples for new templates in stage E.",
  ],
  ["箇条書き", "Bullets"],
  ["並べるだけで順番に意味が無いもの。", "Items whose order doesn't matter."],
  [
    "番号と理由が要るなら、番号の付く並びにする。",
    "If they need numbers and reasons, use a numbered list.",
  ],
  ["用語", "Glossary"],
  ["テーマ", "Theme"],
  [
    "色・書体・余白と、部品の変種の組み合わせ。",
    "A set of colors, typefaces, spacing and part variants.",
  ],
  ["変種", "Variant"],
  [
    "部品ごとの見た目の選択肢。CSS 変数の値で表す。",
    "A choice of look for each part, expressed as CSS variable values.",
  ],
  ["レイアウト", "Layout"],
  [
    "本文幅・脇・目次の位置。",
    "The text width and where the side panel and contents go.",
  ],
]);
