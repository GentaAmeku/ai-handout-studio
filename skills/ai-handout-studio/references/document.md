# HTML 資料を組む

設計書・要求要件・調査結果を、読む人の負担が小さい1枚の HTML 資料にする。**構成と部品を固定して、判断の回数を減らす。**

スライド(1280x720 の資料)は [SKILL.md](../SKILL.md)。質問票は question-sheet スキル。

## 出すもの

**`document.json` 1つ。**文章と構造だけを持ち、色・書体・寸法・class は書かない。`.ds-*` の DOM とテンプレート(CSS)を当てて1枚の HTML にするのはアプリの仕事。形の正はこのスキルと同じフォルダ(`skills/ai-handout-studio/`)の `document.schema.json`。余分なキーは拒まれる。

| コマンド | すること |
| --- | --- |
| `ai-handout-studio document new --json <document.json> [--title <題名>] [--template <テンプレート>]` | 資料として保存する。`id` と開く `url`、原寸で読む `readUrl` を返す |
| `ai-handout-studio document update <id> --json <document.json> [--title <題名>]` | 同じ資料へ重ねる。保存のたびに版が残る |
| `ai-handout-studio document export <id> [--out <保存先.html>]` | 配れる1枚の HTML を書き出す |
| `ai-handout-studio check <document.json>` | 形を検査する。合格なら exit 0 |

`id` と `url`・`readUrl` を利用者へ伝える。`url` は編集の画面、`readUrl` は書き出しと同じ1枚を原寸で読むページ(スマホの幅でも読める)。資料を伝えるときは `ai-handout-studio open <id>` を実行し、出力に `lanReadUrl`(同じ Wi-Fi のスマホで開く URL)があれば並べて伝える。LAN に開くかは設定(`features.lan`)で決まる。`open` が `restart` を促したら、それを実行する。利用者が共有の Wi-Fi にいると言ったときは `--no-lan` を付ける。書き出したものは CSS が `<style>` に埋まった1枚で、外から読むのは Google Fonts(Noto Sans JP)だけ。テンプレートは資料一覧(`HTML 資料`)から後で替えられる。PDF を頼まれたら、書き出した HTML をブラウザーの印刷から PDF にしてもらう。資料は画面から直せる(セクション・ブロックの追加・並べ替え・属性)ので、直しの指示が画面で済むときは JSON を書き直さない。

- `id` と `meta.createdAt` / `meta.updatedAt` は `new` の出力の値。`update` では読み込んだ値のまま `updatedAt` だけをいまの日時にする
- `title` と `template` は `meta.json` が正で、保存時に書き戻される。`template` は利用者がテンプレートを指定したときだけ書く
- id は文書内で一意にする。セクションは `s01` から、ブロックは文書全体で `b01` からの連番
- 画像は `image` ブロックに手元のファイルのパス(絶対パスか、`document.json` からの相対パス)を書く。`document new/update` が資料の `assets/` へ写して `assets/img-<番号>.<拡張子>` に書き換え、書き出すときに埋め込む。PNG・JPEG・WebP で1枚 3MB まで。base64 や URL は書かない
- 書体は Google Fonts から読む。通信できない環境では代替書体に落ちるので、体裁が要る場面では先に確かめる
- 数式は持たない。要るなら別の道具を使う
- 数値・固有名詞・日程は、依頼に書かれたものだけを使う。無いものは `[[要確認]]` と書く

## 見本と生成器の場所

どちらも ai-handout-studio リポジトリの中にある。このスキルのフォルダ(`skills/ai-handout-studio/`)の2つ上がリポジトリの直下で、以下の `<studio>` はそこに置き換える。

| 読むもの | 何があるか |
| --- | --- |
| `<studio>/design/samples/document.html` | 文書の見本。見出し・目次(章の下に節の入れ子を持つ)・脇・表・カード・注意・要約・引用・コード・図を並べてある。ブラウザーで開いて、どの部品がどう見えるかを確かめる。DOM は `document.json` から自動で作られるので写さない |
| `<studio>/design/figure/schema.json` | 流れの図の入力の正本。見本は `<studio>/design/figure/examples/`(JSON と、生成した HTML) |

見本が飾りの無い素の HTML に見えるときは、テンプレートの CSS がまだ作られていない。`ai-handout-studio design build` を実行する。

## 作る前の聞き取り

新しく作るときは、書き始める前に [SKILL.md](../SKILL.md) の「作る前の聞き取り」と同じやり方で、会話から分からないことを1回にまとめて質問票(question-sheet スキル)で聞く。テンプレートは聞かない。利用者が名前(表示名でもよい)を挙げたときだけ `ai-handout-studio templates --kind document` で識別子に直し、`--template` に渡す。挙げなければ既定のテンプレートで作る。長さは聞かない。

聞くのは会話から分からない項目だけ。分かっている項目は聞かず、質問票の頭に「こう受け取った」と短く書く。

| 項目 | 聞くとき | 聞き方 |
| --- | --- | --- |
| 目的・読み手 | 会話から決まらないとき | 自由入力 |
| スクリーンショット | 題材にアプリ・画面・操作の手順が絡むとき | 要る/要らない。要るならどの画面か |
| 画像生成 | 見た目・画面の変更を扱うとき、挿絵が合う資料のとき。`features.imageGeneration` が false なら聞かない | 要る/要らない。要るなら何の絵か(見た目の変更なら、どの案のイメージか) |
| 題名 | 会話から決まらないとき | 自由入力(推奨の案を初期値にする) |

スクリーンショットと画像は、こちらで撮る・作る。やり方は [SKILL.md](../SKILL.md) の「画像を用意する」。利用者が「聞かずに作って」「おまかせ」と言ったとき、会話だけで全部決まるときは、質問票を出さずに作る。

## 文書の形

```json
{
  "id": "doc_20260920_001",
  "title": "題名",
  "status": "draft",
  "meta": { "createdAt": "…", "updatedAt": "…", "audience": "読者" },
  "signature": { "org": "", "note": "設計書 / 2026-09-20" },
  "head": { "title": "題名", "lede": "1〜2行の要旨" },
  "summary": { "label": "要約", "text": "結論" },
  "toc": "auto",
  "sections": [
    {
      "id": "s01",
      "heading": "セクションの見出し",
      "level": 2,
      "blocks": [
        { "id": "b01", "type": "text", "props": { "text": "本文" } },
        { "id": "b02", "type": "notice", "props": { "kind": "warning", "label": "注意", "text": "読み落とすと困る条件" } }
      ]
    }
  ],
  "aside": { "label": "用語", "glossary": [{ "term": "語", "description": "意味" }] },
  "foot": { "org": "組織名", "showPage": true }
}
```

- `toc` は `auto`(セクションの見出しから目次を作る)か `none`。目次・本文・脇の列(3列まで)と、題名・リード・要約をページの上に置くか本文の列の上に置くか(テンプレートの `layout.head`)はテンプレートが決めるので、JSON には書かない
- `paging: "chapter"` を書くと、読む画面で章(level 2 のセクション)を1つずつ切り替えて見せる。左の目次で章を選ぶとその章だけが出て、目次には今の章の節だけが開く。本文の下に前へ・次へ、目次の上に「すべての章を表示」が出る。題名・リード・要約は最初の章にだけ出る。編集中のプレビュー・見本・PDF では全章を流す。章が5つ以上あり、各章が画面1枚を超えるような長い読み物に付ける。短い資料には付けない(省けば全章を1ページに流す)
- `level` は 2(既定)か 3。2 は章、3 は直前の 2 のセクションの中の節(小見出し)。目次には章が並び、節は章の下に入れ子で入る(節まで見せるかどうかはテンプレートが決める。既定・報告書・読み物・Civic は章だけを、Documentation は節まで見せる)。節にも目次から飛べるので、節の見出しも短く中身が分かる言葉にする
- 目次を持つ資料を画面で開くと、スクロールに合わせて読んでいる章・節の目次のリンクに印が付く(色はテンプレートが付ける)。JSON では何も書かない
- `summary`・`signature`・`aside`・`foot` は要らなければ省く。用語表が要らない文書では `aside` を省く
- `signature.org` はふだん空にする。空なら設定の組織名が出る(署名が無くても出る)。資料ごとに別の組織名を出すときだけ書く
- 見出し(`head.title`)は1つ。セクションの中に `h1` を作らない

## 部品(ブロックの type)

`blocks` の `type` と `props` は次の14種。ここに無いキーは書けない。

| type | 使う場面 | props |
| --- | --- | --- |
| `text` | 段落 | `text`(改行は `\n`) |
| `bullets` | 並列の短い要点 | `items`(文字列の配列) |
| `ordered` | 番号の付く並び。1項目に1行の理由を添える | `items: [{ text, why? }]` |
| `table` | 短い対応関係、数字の比較 | `headers`・`rows`・`rowLabel?`(先頭列を行見出しに)・`numeric?`(右へ寄せる列の番号。0 から) |
| `cards` | 並列の概念を2〜4個 | `columns: 2 \| 3`・`items: [{ title, body }]` |
| `notice` | 情報・確かめた結果・読み落とすと困る条件 | `kind: "info" \| "success" \| "warning"`・`label?`・`text` |
| `note` | 読み飛ばしても本筋が通る補足 | `text` |
| `alert` | 元に戻せない操作 | `text` |
| `open` | 未決 | `text` |
| `quote` | 引用 | `text`・`source?` |
| `code` | コマンド・コード | `text`・`caption?` |
| `figure` | 図。中身は生成器が作る | `html`(`.ds-figure-frame` の中身)・`caption?` |
| `image` | スクリーンショット・生成した絵 | `src`(手元の画像ファイルのパス。保存で `assets/` に取り込まれる)・`alt`・`caption?` |
| `html` | 他の型で書けない例外と移行の受け皿。**まず他の型を使う** | `html`(`.ds-*` の断片) |

`html` と `figure` の `html` は、`.ds-*` の class だけを持つ断片に限る。`<script>`・`<style>`・外から読む `src`・入力部品・ページの枠はアプリが拒む。注意の色は `kind` が決める。帯か箱か、罫線か縞か、角の丸さはテンプレートが決めるので、JSON では選ばない。

### 文中の短いコード

`text`・`bullets`・`ordered`(`text`・`why`)・`table`(セル)・`cards`(`body`)・`notice`・`note`・`alert`・`open`・`quote`(本文)・`summary`・`head.lede` の文字列は、`` ` `` で囲んだ部分をコードとして描く。コマンド・ファイル名・キー名を文中に書くときはこれを使う。

```
"`ai-handout-studio open` でサーバーを起動する"
```

対にならない `` ` `` はそのまま字で出る(`check` が警告する)。見出し・題名・カードの題・引用の出典・図や画像の説明では効かない。長いコードや複数行になるものは、この書き方ではなく `code` ブロックを使う。

## 手順

1. **読者を1人決める** — 役割ではなく、実在する1人。この人が決まると、どの語を用語表へ起こすか、どの数字を1つの表へ集めるか、どこまで前提を書くかが全部決まる。決めずに組むと、そこが毎回その場の裁量になる。
   *完了条件*: 読者を1人挙げ、その人が説明できない語を全部拾った。

2. **型を選ぶ** — 実装前の合意なら設計書、解きたいことが中心なら要求・要件、調べた事実を渡すなら調査結果。[document-templates.md](document-templates.md) の該当する型を読み、セクションをそのまま使う。
   *完了条件*: 型のすべてのセクションに中身があるか、空のセクションに「未決」と1行ある。

3. **見本を読む** — `<studio>/design/samples/document.html` をブラウザーで開く。
   *完了条件*: 使う部品が、見本でどう見えるかを見て決めた。

4. **画像を用意する** — 画面・操作・見た目の話があれば、スクリーンショットを撮り、見た目の変更なら完成イメージを作る([SKILL.md](../SKILL.md) の「画像を用意する」)。文だけで追える話に飾りの画像は足さない。
   *完了条件*: 載せる画像が手元のファイルになっている。画面・見た目の話があるのに画像を載せないなら、理由を言える。

5. **組む** — `document.json` を書く。数字を並べるなら `table`、並列の要点なら `cards`、読み落とすと困る条件なら `notice`、手順なら `ordered`、画面や完成イメージと archify の図は `image`(`src` に手元の画像のパス)。他の型で書けるものを `html` に逃がさない。
   *完了条件*: 型のセクションを `sections` に写し、色・寸法・class を1つも書いておらず、`html` ブロックが無い(あるなら他の型で書けない理由を言える)。

6. **検査して保存する** — `ai-handout-studio check <document.json>` が exit 0 になるまで直す。次に `ai-handout-studio document new --json <document.json> --title <題名>` を実行する。
   *完了条件*: `check` と `document new` の終了コードがどちらも 0 で、`id` と `url` が出ている。

7. **渡す** — `ai-handout-studio open <id>` を実行し、`id` と開く `url`・原寸で読む `readUrl`(出ていればスマホで読む `lanReadUrl` も)を伝える。配れるファイルが要るなら `export` して場所も伝える。
   *完了条件*: 利用者が url を開いて中身を読め、画面でセクションやブロックを直せる。

## 既存の資料を直す

1. `ai-handout-studio open <id>` で `path` を確かめ、`document.json` を読む。`document.json` が無い旧い資料(`document.html` だけ)は、`document update <id> --json` を実行すると初めて `document.json` ができる。
2. 直すのは指示のセクション・ブロックだけ。残すブロックの id は変えず、新しいブロックは文書全体の最大番号の次から振る。`meta.updatedAt` をいまの日時にする。
3. `ai-handout-studio check <document.json>` が exit 0 になるまで直し、`document update <id> --json <document.json>` を実行する。
   *完了条件*: `check` と `document update` の終了コードがどちらも 0。

旧い `--html <本文.html>` は移行期の受け口で、本文を `html` ブロック1つの文書として保存する。新しく組むときには使わない。

## 編集案(パッチ)

アプリの編集画面の AI の欄から直す依頼が来たら、`request.md` の指示に従って `patch.json` を作る。資料そのものは書き換えない(取り込みは利用者が画面で行う)。

1. `request.md` を読み、対象のセクション・指示・書き出し先を確かめる。
2. 同じフォルダの `target.json` を読む。これが直す前の資料全体。
3. 指示に沿って、対象のセクションの `blocks` だけを作り直す。
4. `patch.json` を書き出し先に保存する。形は `skills/ai-handout-studio/document-patch.schema.json`。
5. `ai-handout-studio check <書き出し先>` が exit 0 になるまで直す。

```json
{ "sectionId": "s02", "blocks": [] }
```

- 置き換えるのは対象のセクションの `blocks` だけ。セクションの見出し・ほかのセクション・表紙まわり・用語集は書かない
- 残すブロックは `target.json` と同じ id のままにする
- 新しいブロックには id を書かない。id はアプリが振る
- セクションの増減と並べ替えはしない
- 部品の種類と props は上の「部品」と同じ。色・class は書かない

## 図を出すか

本文の言い換えになる図は置かない。読者が文だけで追える構造に図を足すと、同じことを2回読ませる。一方向の手順は、図にせず番号付きの説明にする。

出すと決めたら、**流れの図(縦の連鎖・枝分かれ・合流)は手で描かない。**小さな JSON を書いて生成器に出させる。座標も色も書かない。

```bash
node <studio>/design/figure/deliver.mjs 図.json
```

出てきた `<figure class="ds-figure">` の中の `.ds-figure-frame` の中身(`<svg>` 1つ)を、`figure` ブロックの `html` に入れる。`<figcaption>` があれば `caption` に文字だけ入れる。先頭のコメントと外側の `<figure>`・`.ds-figure-frame` は入れない(アプリが付ける)。**終了コードが 0 でなければ何も出ていない。**診断が規則id・場所・数値・直し方を持つので、それに従って入力を直し、通してから貼る。**生成物は手で直さない。**直したいことがあれば入力の JSON を直して作り直す。

生成器が扱うのはこの3つの形だけ。**まず「図にしない」で済ませる。**それでも構成・シーケンス・データの流れ・状態の移り変わり・戻る線(ループ)のある流れの図が要るなら、archify で作って画像にし、`image` ブロックで載せる(`caption` に何の図かを書く)。手順と、archify が無いときの扱いは [SKILL.md](../SKILL.md) の「図を載せる」。ER・ガント・データのグラフはどちらでも描かないので、表か文にする。

生成器の外の簡単な図を手で描くときは、見本の図と同じ `.ds-node` / `.ds-link` / `.ds-arrow` だけを使い、SVG に色を書かない。**同じ環境に `diagram-design` があっても使わない。**あちらは別の配色を持つ。

## 見た目を変えたくなったら

本文(JSON)は直さない。資料一覧(`HTML 資料`)からテンプレートを替えるか、文書のテンプレートそのものを直す。値は `<studio>/design/tokens.json` とテンプレート(`<studio>/design/templates/document/<名前>/`)だけが持ち、CSS は `ai-handout-studio design build` の生成物なので手で直さない。書き方は `<studio>/design/templates/README.md`。
