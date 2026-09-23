# 質問の形式

動く例は [通常の相談](../examples/general.json) と [候補確認](../examples/candidates.json)。

最上位は `schemaVersion: 1`、`id`、`revision`、`title`、`questions`。任意でdescription、context。質問群IDには日付だけでなく対象のセッションを含める。IDとrevisionは英数字・点・下線・ハイフン100字以内。質問は1〜60件。多い場合は業務の区切りで分け、候補を黙って落とさない。

質問はid、title（60字）、type（single / multiple / text）。summaryは140字、detailは1,200字まで。選択肢は `options: [{id,label}]` で2〜6件、labelは50字。複数選択で選ばないことを許すなら「該当なし」を選択肢にする。推奨は `recommended: [選択肢ID]`。自由入力型に推奨は付けない。

label に (推奨) を書かない。推奨は `recommended` で示し、画面が「（推奨）」を付ける。書いてしまっても画面の「（推奨）」は1回だけで、`audit` が警告を出す。

singleは選択肢のラジオボタンと自由編集欄を表示する。選ぶと回答文へ入り、以後は自由に編集できる。推奨ラベル＋「（推奨）」をtextの初期値にする自由編集欄。補足をここへ統合する。multipleのみ補足が付き、noteLabelで呼び名を変える。用途別の入力欄はfields（4件まで）に `{id,label,initial?,multiline?,required?,requiredWhen?}` を置く。requiredWhenは選択肢IDの配列。該当回答と、選択肢に一致しない自由回答では必須になる。multilineは長い送信文などに使う。入力値は20,000字まで。

根拠は `evidence: [{label,text}]` で3件まで。labelに時刻や出所を入れる。textは240字まで。引用を作らず、入力元の内容から取る。

visualは主図を1つ持つ。判断点の強調と補助表・全体図は[追加形式](explorers.md)を使う。比較は `{type:"comparison",caption,columns:[列名],rows:[[セル]]}`。2〜4列、1〜4行。流れは `{type:"flow",figure: ...}` とし、figureは [図の形式](../../../design/figure/schema.json)に従う。生成器が文字幅と構造を検査する。案ごとのイメージ画像は `{type:"images",caption?,items:[{src,label,alt}]}`(1〜4枚。label50字、alt200字)。srcは質問JSONからの相対か絶対のパスで、PNG・JPEG・WebPの3MBまで。描くときに埋め込み、ai-handout-studioに保存すると`assets/`へ取り込む。見た目の語があって`images`の無い質問は`audit`が警告する。任意HTML・SVG・URLやdata:の画像は受け付けない。

回答はschemaVersion、documentId、revision、digest、answersを持つ。answersは `{id,selected:[選択肢ID],text,fields:{欄ID:値},reviewed}`。digestは生成器が質問全体から算出する照合値で、承認の証明ではない。singleのtextが回答の正本。selectedは文が選択肢と完全一致するときだけ入る。自由な文では空配列。下書きはreviewed=falseや未入力を許すが、返却時は全件確認と必須欄を検査する。

字数: 1,311 / 1,500字（字数表示を除く）。

`detail`の空行は段落の区切りとして表示する。長い説明を`title`や`summary`へ移さない。回答は説明・図解・根拠の後に置く。

結果や注意を区別する場合は任意の`notices: [{kind:"success",text:"検証が通りました"}]`を使う。kindは`success`（成功）、`info`（情報）、`warning`（注意）。3件まで、textは140字まで。色・記号・ラベルは画面側で付く。意味のある結果だけを示し、選択を誘導する装飾にしない。

比較表のセルは文字列、または`{text:"検証通過",kind:"success"}`。kindは`success / info / warning`、textは100字まで。記号と意味別の文字色が付き、言葉は省かない。成功を表す根拠がないセルは文字列にする。

比較のための質問は`visual`で違いを並べる。図表が要らない質問は`visualRationale`（140字まで）に理由を書く。`audit`がこの指定漏れを検出する。従来の入力は引き続き生成できるが、新規の提出物はauditを通す。
