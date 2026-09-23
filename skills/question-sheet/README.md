# question-sheet(質問票)

複数の未決事項を1枚の画面にまとめ、回答をJSONで受け取るスキルです。要件整理、方針の比較、候補の確認のように、質問を見渡してから答えたい場面で使います。

既定では1問ずつ読み、広い画面では質問一覧を開いた状態で始まります。右上のボタンで一覧を開閉でき、回答欄は説明と図解の下、前へ・次へは画面下にあります。`--layout` で全問を並べる(`all`)・印刷向けの書き込み用紙(`print`)も選べます(`overview` は1問ずつと同じ)。単一回答は選択肢を選ぶと回答文へ入り、自由に編集できます。「(推奨)」付きの文章が入力欄の初期値に入っているので、そのまま送ることも、条件を書き足すこともできます。1〜2件の短い即答は会話で済むので、この画面は使いません。

## 要るもの

通常の質問票にはNode.js 22以上とブラウザーが必要です。構成図などを載せる場合だけ、別途[Archify](https://github.com/tt-a1i/archify)を使います(`ai-handout-studio diagram`で画像にして`images`で載せます)。未導入なら比較表や文章で提示し、最後に`npx skills add tt-a1i/archify -g`での導入を1度だけ紹介します。自動インストールはしません。特殊な配置は`ARCHIFY_SKILL_DIR`で指定できます。

画面のスタイルと簡単な図の生成器は、このスキルが入っている ai-handout-studio のリポジトリの `design/dist` を直接読みます(リポジトリで `pnpm install` を実行すると作られます)。Archifyの本体は含めません。生成したHTMLは単体で閲覧でき、図の閲覧時にも外部へ通信しません。

## 入れる

このスキルは ai-handout-studio のリポジトリの `skills/question-sheet/` にあります。リポジトリで `pnpm install` を実行してから、エージェントのスキルの置き場へ symlink で見せます(手順はリポジトリの SETUP.md)。コピーではなく symlink にしてください。スクリプトは実体の場所からリポジトリの `design/dist` を辿ります。

## 使う

エージェントに「まとめて質問して」と頼めば、質問の組み立てから表示までスキルが担当します。手で動かすときは次のコマンドを使います。`<skill>` は入れた先の `SKILL.md` があるディレクトリに置き換えます。

```bash
# 比較表・図の抜けを確認する（不要なら visualRationale に理由を書く）
node <skill>/scripts/sheet.mjs audit <questions.json>

# 一時サーバーを立てて回答を回収する
node <skill>/scripts/sheet.mjs serve <questions.json> --out <answers.json>

# サーバーを使えない環境向けに単体HTMLを出す
node <skill>/scripts/sheet.mjs render <questions.json> --out <sheet.html>

# 全件・版・必須入力を検査する
node <skill>/scripts/sheet.mjs validate <questions.json> --answers <answers.json>
```

質問の書き方は [references/questions.md](references/questions.md)、図と表の使い分けは [references/visual-guidance.md](references/visual-guidance.md)、他の開発フローへの組み込みは [references/integration.md](references/integration.md) にあります。動く見本は [examples/](examples/) に置いてあります。

## 決めていること

- 回答の受領だけを行います。送信・投稿・外部操作の権限は持ちません
- 生成したHTMLと回答には会話の内容が入ります。回答後の保持と削除は、使う側の規則に従ってください
- 画面の文言は日本語です

## ライセンス

MIT([LICENSE](LICENSE))。同梱物には次の条件も併せて適用されます。

- 画面の意匠は ai-handout-studio の `design/dist`(同じリポジトリの生成物。MIT)を読みます。書体ファイルは含みません

Archifyで生成した図には、導入先のライセンスと第三者表記を埋め込みます。

比較表・意味別の注記・全体図・回答欄を組み合わせた見本は [examples/reading.json](examples/reading.json) です。成功は緑、注意は橙、補足は青で表し、記号と文言を併記します。
