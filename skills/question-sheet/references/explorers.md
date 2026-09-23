# 強調図と全体図

動く例は[explorer.json](../examples/explorer.json)。通常はdecisionの強調図で判断する。

全体図(`explorers`)は古い質問票を読むために残している形で、新しく作る質問票では使わない。ai-handout-studioに保存した質問票では中身が描かれないため。構成や経路の図が要るときは、Archifyの図を画像にして`visual.type: images`で載せる(SKILL.mdの「Archifyの図を載せる」)。下の全体図の説明は、古い質問票を読み直すときのためのもの。

visualのtypeをdecisionにし、caption（140字）、steps（2〜6段）、focus（強調する段ID）、任意のtable（2列×1〜4行）を置く。stepsは{id,label,role?}で、label40字、role30字。tableの各セルは80字まで。focusは選択値ではなく説明上の判断点。推奨案の欠点を隠したり、全項目を強調したりしない。

最上位のexplorers（5件まで）へ{id,spec}を置き、質問のexplorerにそのIDを指定する。同じ全体図を複数の質問から参照できる。specはインストール済みArchifyの構造化JSON。形式はarchitecture / workflow / sequence / dataflow / lifecycleで、検出したスキルのschemasを使う。新規workflowはschema_version:2。任意HTMLは渡さない。

生成器は全体図をFlow＋Lightの静止表示にし、Archifyのdeliver検査が通った図だけをHTMLへ埋め込む。全体図は質問JSONの照合値にも含まれる。外部フォントは取得せず、ファイル参照と外部ブランドの取得は受け付けない。閲覧画面は回答画面から隔離され、外部通信を禁止する。

生成後は通常表示と全体図を実画面で確認する。機械検査だけで、人が経路を読み違えないとは判断しない。特に往復の経路、交差、担当の受け渡しを見る。担当別の段で縦に伸びすぎるなら、作業順を横一列にして各作業へ担当名を添える。読めない図を縮小で押し込まない。

FlowとLightは初期設定。閲覧中にテーマを変えることはできる。生成図は初期案を示し、自由回答を編集しても自動で描き替わらない。この区別はcaptionか短い説明で明示する。

## 検出と導入

`node <skill>/scripts/archify.mjs`は、作業ディレクトリと親ディレクトリ、その後ユーザー領域の`.agents/skills/archify`、`.claude/skills/archify`、`.codex/skills/archify`、`.cursor/skills/archify`を探す。`CODEX_HOME/skills/archify`にも対応する。特殊な配置では`ARCHIFY_SKILL_DIR`にSKILL.mdがあるディレクトリを指定する。明示指定が不正なときは他の版へ切り替えず、案内して終了する。

未導入なら、作成側で選んだ補助図は比較表や文章に置き換え、explorersと各質問のexplorerを省いて生成する。利用者が全体図を明示指定した場合だけ、公式の`npx skills add tt-a1i/archify -g`を案内して導入を確認する。公式: https://github.com/tt-a1i/archify 。自動ダウンロードや自動更新はしない。通常の質問票は外部スキルなしで動くが、全体図を指定した生成は導入まで終了コード1になる。既存HTML・回答は上書きしない。

導入済みスキルの`bin/archify.mjs deliver`を使う。CLIの互換性が変わって生成に失敗した場合は、診断と導入版を確認し、成功扱いにしない。検査後の生成HTMLにだけ、初期Light表示・外部フォントの除去・通信制限を適用する。導入先のファイルは書き換えない。生成HTMLには導入先のライセンス・第三者表記を残す。レイアウトの生成処理は変更しない。
