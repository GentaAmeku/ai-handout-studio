---
name: ai-handout-studio
description: ai-handout-studio の資料を作る・直す。1280x720 のスライドは deck.json、設計書・要求要件・調査結果の HTML 資料は document.json で組む。どのフォルダの会話でも「資料を作って」「スライドを直して」「設計書を HTML にして」「調査結果を人に渡す形にして」「登壇資料を作って」「LT のスライドを作って」と頼まれたとき、またはアプリの request.md から patch.json を作るときに使う。
---

# ai-handout-studio の資料づくり

資料は3つの区分に分かれる。どれも `ai-handout-studio` コマンドで保存し、見た目はテンプレートが持つ。

| 頼まれたもの | どこを読むか |
| --- | --- |
| スライド(1280x720 の資料) | このファイル。`deck.json` を書く |
| 登壇スライド(登壇・LT・講義) | [references/talk.md](references/talk.md)。作る前の聞き取りに登壇の項目(告知ページ・持ち時間・伝えたいこと)を足して質問票で聞く。見た目は登壇用テンプレートの Podium(`--template podium`)。`deck.json` の書き方はこのファイル |
| HTML 資料(設計書・要求要件・調査結果) | [references/document.md](references/document.md)。`document.json` を書く |
| 質問票 | 同じリポジトリの question-sheet スキル([skills/question-sheet/](../question-sheet/SKILL.md))。保存は同じ `ai-handout-studio sheet new` コマンド。並べ方(レイアウト)は `--layout <focus\|overview\|all\|print>` で選べる。省略するとテンプレートの既定のまま。直すときは `ai-handout-studio sheet update <id> --layout <…>` |

以下はスライドの作り方。資料は `deck.json` 1つ。JSON は文章・構造・配置だけを持ち、色・フォント・余白の見た目はアプリのテンプレートが持つ。形の正はこのスキルと同じフォルダの `deck.schema.json`。

操作は `ai-handout-studio` コマンドで行う。資料の置き場所はコマンドが決めるので、パスを推測しない。

| コマンド | すること |
| --- | --- |
| `ai-handout-studio new --title <題名> [--outline <構成>] [--template <テンプレート>]` | 資料の場所を確保し、`id` / `path` / `createdAt` を返す。構成は中身の骨組み(`proposal`・`self-intro`・`study-session`・`kickoff`・`talk`)、テンプレートは見た目。2つは別で、`--outline` を付けると deck.json の骨組みも置く。`--template` を付けなければ既定のテンプレートになる |
| `ai-handout-studio check <ファイル>` | deck.json・patch.json を検証する。合格なら exit 0 |
| `ai-handout-studio check <deck.json> --minutes <分>` | 上に加えて、登壇向けの検査(尺の見積りと1枚の量の警告)をする。登壇スライド([talk.md](references/talk.md))で使う |
| `ai-handout-studio open [<id>] [--lan\|--no-lan]` | アプリを起こして開く URL を返す。id を渡すと `path` に deck.json の場所、渡さないと `decks` に資料フォルダの場所が出る。質問票と HTML 資料の id なら原寸で読む `readUrl` も出る。設定(`features.lan`)が true なら LAN にも開き、同じ Wi-Fi から開く `lanUrl`・`lanReadUrl` が出る |
| `ai-handout-studio restart [<id>] [--lan\|--no-lan]` | 動いているアプリを止めて起こし直す。LAN に開くかは `open` と同じ決め方 |
| `ai-handout-studio settings` | 今の設定(言語 `locale`・任意の機能 `features.*`)を出す |
| `ai-handout-studio templates [--kind slide\|sheet\|document]` | いまあるテンプレートの識別子・表示名・説明・既定を一覧で返す。テンプレートは利用者に聞かないが、利用者が名前(表示名でもよい)を挙げたときに識別子へ直して `--template` に渡すために使う |
| `ai-handout-studio share <id>` | 質問票・HTML 資料を、Claude の Artifact に配れる束(`share/index.html` と画像のファイルだけ)にする。束の場所・ファイルの一覧・Claude Code への依頼文を返す。スライドはまだ使えない |
| `ai-handout-studio share <id> --url <URL>` | 公開した Artifact の URL を資料に残す。次の `share <id>` は同じ URL を更新する依頼文になる |
| `ai-handout-studio shot <URL か HTML のファイル> --out <PNG> [--width 1440] [--height 900] [--full] [--wait <ミリ秒>]` | Web の画面か手元の HTML(見た目の案のモック)を PNG に撮る。撮った場所と大きさを出す。使い方は「画像を用意する」 |
| `ai-handout-studio diagram <architecture\|workflow\|sequence\|dataflow\|lifecycle> <spec.json> --out <画像>` | archify(別の作者のスキル)で図を作り、archify のビューアーの Export で図の全体を画像に書き出す。形式は `--out` の拡張子(`.png`・`.jpg`・`.webp`)で選ぶ。書き出した場所と大きさを出す。archify が無ければ exit 3。使い方は「図を載せる」 |

資料を伝えるときは `ai-handout-studio open <id>` を実行し、出力に `lanReadUrl`(スライドは `lanUrl`)があれば、スマートフォンで読む URL として並べて伝える。LAN に開くかは設定(`features.lan`)で決まるので `--lan` は付けない。`open` が `restart` を促したら、それを実行する。利用者が共有の Wi-Fi にいると言ったときは `--no-lan` を付ける。

コマンドが見つからなければ、ai-handout-studio リポジトリの SETUP.md のとおりに入れる(利用者に頼まれたら、そのリポジトリでエージェントが進める)。

## 言語

資料は利用者の言語(`ai-handout-studio settings` の `locale`、または会話の言語)で書く。HTML 資料(`document.json`)と質問票の JSON には、その言語を `lang`(`ja` か `en`)で書く。画面の文言がその言語で出る。字数の目安(全角の文字数など)と日本語の書き方の決まりは、日本語の資料のときだけ当てる。

## 共有する(URL で渡す)

質問票・HTML 資料を「共有して」「URL で渡したい」と頼まれたら、次の手順で進める。スライドはまだ作っていない。先に `ai-handout-studio settings` を読み、`features.share` が false なら共有せず、「使うには ai-handout-studio の SETUP.md の節9で共有をオンにする」と伝える。

1. `ai-handout-studio share <id>` を実行する。束(`share/`)を作り直し、束の場所・`files`(画像の一覧)・依頼文を返す。`warning` が出たら中身を確かめる([[要確認]] の残りなど。止めなくてよい)
2. 出力の依頼文のとおりに、Artifact ツールでこの束を公開する。中身とデザインは直さない。画像があれば `files` に相対パスのまま渡す。公開の範囲は変えない(エージェントからは変えられない。既定の非公開のままにする)
3. 公開できたら `ai-handout-studio share <id> --url <公開した URL>` を実行して URL を残す
4. 利用者に URL を伝え、「公開リンクにするには Artifact の画面の Share から選ぶ」ことも添える。資料に入っている名前(署名など)は公開リンクにすると誰でも読めることも伝える

もう一度「共有して」と頼まれたら、同じ手順を繰り返す。前に残した URL があれば、`share <id>` の依頼文が「この URL の Artifact を更新してください」に変わるので、同じ Artifact を更新する。

## 新しく作る

### 作る前の聞き取り

「資料を作って」と頼まれたら、作り始める前に、会話から分からないことを1回にまとめて質問票(question-sheet スキル)で聞く。テンプレートは聞かない。作る前も作ったあとも確かめず、「ほかのテンプレートも選べる」とも添えない。利用者が名前(表示名でもよい)を挙げたときだけ `ai-handout-studio templates --kind slide` で識別子に直し、`--template` に渡す。挙げなければ `--template` を付けず、既定のテンプレートで作る。ただし登壇スライドは、挙げなくても登壇用の `podium` を付ける([references/talk.md](references/talk.md))。

聞くのは会話から分からない項目だけ。分かっている項目は聞かず、質問票の頭に「こう受け取った」と短く書く。

| 項目 | 聞くとき | 聞き方 |
| --- | --- | --- |
| 区分(スライドか HTML 資料か) | 会話から決まらないとき | 選択肢 |
| 目的・読み手 | 会話から決まらないとき | 自由入力 |
| 枚数 | 会話から決まらないとき(登壇は話す分数) | 自由入力 |
| スクリーンショット | 題材にアプリ・画面・操作の手順が絡むとき | 要る/要らない。要るならどの画面か |
| 画像生成 | 表紙や挿絵が合う資料(紹介・勉強会・登壇など)のとき、見た目・画面の変更を扱うとき。`features.imageGeneration` が false なら聞かない | 要る/要らない。要るなら何の絵か(見た目の変更なら、どの案のイメージか) |
| 題名 | 会話から決まらないとき | 自由入力(推奨の案を初期値にする) |

- 登壇スライドは、この聞き取りに [references/talk.md](references/talk.md) の項目を足して、同じ質問票で聞く
- スクリーンショットと画像は、こちらで撮る・作る。やり方は下の「画像を用意する」
- 利用者が「聞かずに作って」「おまかせ」と言ったとき、会話だけで全部決まるときは、質問票を出さずに作る。決めたこと(読み手・枚数など)は最後に伝える

### 画像を用意する

スライド・HTML 資料・質問票のどれでも同じ手順で用意する。画面・操作・見た目の話は、文だけより画像の方が早く伝わる。飾りのためだけの画像は足さない。

- **スクリーンショット**: Web の画面は `ai-handout-studio shot <URL> --out <PNG>` で撮る(既定は 1440x900。縦に長いページは `--full`)。Web でない画面は、環境にある画面を撮る道具を使う。撮れなければ置き場所を `[[要確認]]` にして利用者に伝える
- **見た目の変更案(完成イメージ)**: 次の順で作る
  1. 自分で作る。Claude はふつうの画像を直接は出せないので、HTML でモックを描いて `ai-handout-studio shot <モック.html> --out <PNG>` で撮る(作れる画面に近い)。画像生成を持つエージェント(Codex など)は、その機能で作ってもよい
  2. 写真調の絵・挿絵・雰囲気の案のように HTML で描けないものは、画像生成の CLI に頼む。先に `ai-handout-studio settings` を読み、`features.imageGeneration` が false なら使わず、「使うには ai-handout-studio の SETUP.md の節9で画像生成をオンにする」と伝える。どちらも1枚およそ1分で、保存先を指示すればそこに PNG を置く
     - Codex CLI: `codex exec --skip-git-repo-check -s workspace-write -C <保存先のフォルダ> "画像生成の機能で、<題材・画風・色・文字を入れない・縦横比>の画像を1枚作り、このフォルダに <名前>.png で保存して、絶対パスだけを答えて"`(「モデルがこのアカウントでは使えない」で失敗したら、CLI を更新するか、`-m` で使えるモデルを指定する)
     - Antigravity CLI: `agy --dangerously-skip-permissions --add-dir <保存先のフォルダ> --print-timeout 480s -p "<同じ依頼。保存先は絶対パスで書く>"`
  3. どれも使えなければ、置き場所を `[[要確認]]` にして利用者に伝える
- 生成した画像とモックは、完成品と取り違えないよう、説明(`caption` か `label`)に「イメージ」と書く
- 大きさ: 資料に取り込めるのは PNG・JPEG・WebP の1枚 3MB まで、1MB を超えると警告が出る。生成した画像は 1〜2MB になりやすいので、縮めてから載せる。macOS は `sips -s format jpeg -s formatOptions 80 --resampleWidth 1200 <元.png> --out <小さい.jpg>`、Linux は ImageMagick の `magick <元.png> -resize 1200x -quality 80 <小さい.jpg>`
- 載せ方: HTML 資料は `image` ブロック、質問票は `visual` の `images`(案ごとに1枚)に、手元の画像のパスを書く。保存のとき資料の `assets/` に取り込まれる。スライドは、`new` の出力の資料フォルダの `assets/` に画像を写してから、`image` ブロックの `src` に `assets/<名前>` と書く

### 図を載せる

スライド・HTML 資料・質問票のどれでも同じ決まりで載せる。以下の `<studio>` は ai-handout-studio リポジトリの直下(このスキルのフォルダの2つ上)。

- 図を出すかの判断は今までどおり。本文の言い換えになる図は置かない。一方向の手順は図にせず番号付きの説明にする([references/document.md](references/document.md) の「図を出すか」)
- 縦の連鎖・枝分かれ・合流の流れの図は、同梱の生成器(`<studio>/design/figure/deliver.mjs`)で作る。テンプレートの色で描ける(HTML 資料は `figure` ブロック、質問票は `visual.type: flow`)
- それ以外の図(構成・シーケンス・データの流れ・状態の移り変わり・戻りのある流れ)は archify で作り、画像にして載せる
  1. `node <studio>/skills/question-sheet/scripts/archify.mjs` で archify の場所を調べる。見つからなければ(exit 1)下の「archify が無いとき」に進む
  2. 出た場所の `SKILL.md` の手順(Fast authoring path)に従い、種類(`architecture`・`workflow`・`sequence`・`dataflow`・`lifecycle`)に合う schema と例を読んで spec の JSON を書く。`meta.quality_profile` は `"showcase"`。文言は資料の言語で書く
  3. `ai-handout-studio diagram <種類> <spec.json> --out <名前>.png` を実行する。archify の `deliver` で検査し、ビューアーの Export で図の全体を明るい配色で書き出す(既定は4倍の大きさ)。exit 1 なら何も書き出していない。出た診断に従って spec を直し、通るまで繰り返す(直し方は archify の `SKILL.md`)
  4. 載せる。スライドは `new` の出力の資料フォルダの `assets/` に画像を置き(`--out` にそこを渡してよい)、`image` ブロックの `src` に `assets/<名前>.png` と書く。HTML 資料は `image` ブロック、質問票は `visual.type: images` に画像のパスを書く(保存のとき `assets/` に取り込まれる)
  5. 説明(HTML 資料と質問票は `caption`、質問票の画像は `label` も)に何の図かを書く(「構成図: 注文の受け付けから配送まで」など)。1MB を超えたと警告が出たら、`--out` を `.webp` にして書き出し直す(中身は同じで、PNG の半分ほどになる)
- archify の配色はテンプレートと違う。画像として載せるので、テンプレートの色に合わせなくてよい

**archify が無いとき**(`archify.mjs` が exit 1、または `diagram` が exit 3): 図なしで作る(表・文・同梱の生成器で済ませる)。仕上げの報告の最後に、archify の紹介を1行添える。例:「archify(別の作者のスキル。https://github.com/tt-a1i/archify)を入れると、構成図・シーケンス図・データの流れ・状態の移り変わりの図を資料に載せられます。入れるなら `npx skills add tt-a1i/archify -g`」。同じ会話で2回は紹介しない。利用者に頼まれない限り入れない。

### 作る

1. 近い構成があれば選び、`ai-handout-studio new --title <題名> --outline <構成>` を実行する。利用者がテンプレートを指定したときだけ `--template <テンプレート>` を足す。構成が無ければ `--outline` を付けない。
2. 出力の `path` が構成の骨組み(`outline: 骨組みを置いた`)なら読み、スライドの並びとブロックの座標を出発点にする。無ければ「構成の型」から組む。
3. 1枚1メッセージで構成を決め、`path` に `deck.json` を直接書く。`id` と日時は `new` の出力の値。
4. `ai-handout-studio check <path>` を実行し、exit 0 になるまで直す。警告は中身を確かめ、根拠の無い値は `[[要確認]]` のまま残す。
5. `ai-handout-studio open <id>` の `url`(出ていれば `lanUrl` も)を利用者に伝える。

完了条件: `check` が exit 0 になり、伝えたいことの各項目がどれかのスライドに載り、開く URL を伝えている。

## 既存の資料を直す

1. 直す資料の id を確かめる。分からなければ `ai-handout-studio open` の `decks` にあるフォルダの `deck.json` の `title` から探し、候補を利用者に確かめる。
2. `ai-handout-studio open <id>` を実行し、`path` の `deck.json` を読む。
3. 指示のスライドの `blocks` だけを書き戻す。
   - 残すブロックは id をそのまま保つ
   - 新しいブロックは、デッキ全体の最大番号の次から `bNN` の連番を振る
   - `meta.updatedAt` をいまの日時(ISO 8601)にする
   - `layout` とメモ(`notes`)、他のスライドは変えない。スライドの増減と並べ替えはしない(アプリで行う)
4. `ai-handout-studio check <path>` が exit 0 になるまで直す。
5. `url`(出ていれば `lanUrl` も。`open <id>` の出力)を伝える。アプリで開いたままなら、保存時に外での書き換えを検知して再読み込みを促す。

## 出力の契約

- ルートは deck 1つ。`id` と `meta.createdAt` / `meta.updatedAt` は `ai-handout-studio new` の出力の値、`title` は依頼の題名、`template` は `new` の出力の `template:` の値(骨組みを置いたときは deck.json に入っている)をそのまま残し、利用者がテンプレートの名前を指定したときだけ書く(書かなければ ai-handout-studio の design/selection.json でスライドの既定に選んだテンプレートで描く。旧い `theme` は書かない)、`size` は `{ "width": 1280, "height": 720 }`、`status` は `"draft"`
- id はデッキ内で一意にする。スライドは `s01` から、ブロックはデッキ全体で `b01` からの連番
- ブロックの `type` は下の表の10種を使い、`props` にはスキーマにあるキーだけを書く
- 数値・金額・日程・固有名詞は、依頼(会話・渡された資料)に書かれたものだけを使う。無いものは `[[要確認]]` と書く
- 画像は資料フォルダの `assets/` にあるファイルだけを `src` に書く。テンプレートに同梱の絵(`design/templates/slide/<名前>/assets/*.svg`)は、資料を作ったときに資料の `assets/` へ写るので、写っていれば同じ名前(`assets/hero.svg` など)で使ってよい

## キャンバスと座標

- 1280x720、原点は左上、単位は px。座標と大きさは 8 の倍数にそろえる
- 左右の余白は 64px。どのブロックも `x >= 64`、`x + w <= 1216`、`y + h <= 720`
- 本文スライドの基本配置: 見出し `x64 y48 w1152 h96`、本文の領域 `y176`〜`y632`、フッター `x64 y664 w1152 h32`(`showPage: true`)
- 表紙と締め: 見出しを `y200`〜`y280` あたりに置き、フッターは `x64 y640 w1152 h48` で `showPage: false`
- 高さは中身が収まる大きさにする。本文 16px は1行およそ 26px、全角でおよそ `w / 16` 文字。見出し level 1 は 36px で1行およそ 49px、level 2 は 28px
- はみ出しはアプリの描画後検査で見つかるので、余裕を持たせた高さにする

## 見た目とテンプレート

- 色・書体・飾り(表紙のウェーブ、本文の帯、見出しの線など)はテンプレートが決める。飾りを図形や色付きのブロックで描かず、ブロックに色を書かない
- 見た目のテンプレートは英語一語の固有名(`default`=AI Handout Studio Design、`civic`=Civic、`lumen`=Lumen など)。名前と説明は `ai-handout-studio templates --kind slide` で調べる。利用者が選んだときは `deck.json` の `template` に識別子を書く。中身の構成(`proposal` など)はテンプレートではなく、`template` には書かない。どちらも ai-handout-studio の `design/templates/slide/` にある
- テンプレートの飾りは基本配置(見出し `y48`、本文 `y176` から)に合わせてある。見出しは基本配置に置く
- テンプレートそのものの見た目(変数では表せない帯や見出しの作り)を直す・作るときは、ai-handout-studio リポジトリで `design/templates/<区分>/<名前>/template.css` に書く。書き方は `design/templates/README.md`

## スライドの `layout`

| layout | 使う場面 |
| --- | --- |
| `cover` | 表紙。1枚目 |
| `section` | 中扉。章の切り替え |
| `content` | 本文 |
| `closing` | 締め。最後の1枚 |

## ブロック

| type | 使う場面 | 書き方の目安 |
| --- | --- | --- |
| `heading` | スライドの見出し | `kicker` に章名、`text` にその1枚のメッセージ。2行以内 |
| `text` | 補足の本文 | 20〜40秒で読める量。改行は `\n` |
| `bullets` | 並列の要点 | 3〜5項目。順番に意味があれば `marker: "number"` |
| `card-grid` | 並列の概念を2〜4個 | カード本文は2〜3行。`icon` はスキーマの一覧から選ぶ |
| `kpi-row` | 数値の指標 | `value` は依頼にある数値。無ければ `[[要確認]]` |
| `two-col` | 対比(現状と目標、対象と対象外) | 各列の本文は3〜5行 |
| `process` | 順番のある手順 | 3〜5ステップ |
| `table` | 行と列で比べる情報 | 各行の列数は `headers` と同じ。5行以内 |
| `image` | 素材の画像 | `src` は `assets/` からの相対パス |
| `footer` | ページ番号 | 各スライドに1つ |

## アプリから依頼したとき

アプリの AI パネルは、資料フォルダに `request.md` を置き、リポジトリの直下でエージェントを起こす。このときは `deck.json` を書かず、次のファイルを作る。取り込みは利用者がアプリで行う。

### 編集案(パッチ)

アプリの AI パネルから直す依頼が来たら、`request.md` の指示に従って `patch.json` を作る。HTML 資料のセクションの依頼(`request.md` の題が「セクション … の編集案(HTML 資料)」)は `references/document.md` の「編集案(パッチ)」に従う。

1. `request.md` を読み、対象(このスライドかデッキ全体)・指示・書き出し先を確かめる。
2. 同じフォルダの `target.json` を読む。これが直す前の現物。
3. 指示に沿って、対象スライドの `blocks` を作り直す。
4. `patch.json` を書き出し先に保存する。
5. `pnpm deck:check <書き出し先>` が exit 0 になるまで直す。

形は次のとおり。デッキ全体は `{ "patches": [{ "slideId": "s01", "blocks": [] }] }`。

```json
{ "slideId": "s04", "blocks": [] }
```

- 置き換えるのは対象スライドの `blocks` だけ。`layout` とメモ(`notes`)は書かない
- 残すブロックは `target.json` と同じ id のままにする
- 新しいブロックには id を書かない。id はアプリが振る
- スライドの増減と並べ替えはしない
- 座標・文章量・使える type とアイコンの決まりは、上の「出力の契約」と同じ

## 構成の型

テンプレートの指定が無いとき、依頼の目的に近いものを出発点にする。

- 提案: 表紙 / 目次 / 現状理解 / 課題 / 方針 / スコープ / 進め方 / 見積り / 前提 / 締め
- 勉強会: 表紙 / 今日のゴール / 論点 / 事例 / まとめ / 宿題
- 自己紹介: 表紙 / いま何をしているか / 強み / 実績 / 進め方 / 次の話
- キックオフ: 表紙 / 目的 / 成果物 / マイルストーン / 役割 / リスク
- 登壇: 表紙 / 自己紹介 / つかみ / 中扉 / 本文 / 本文 / 中扉 / 本文 / まとめ / 締め。組み方は [references/talk.md](references/talk.md)

## HTML 資料を作る

設計書・要求要件・調査結果は、スライドではなく HTML 資料にする。`document.json` にセクションとブロック(部品)で書き、資料として保存する。JSON は文章と構造だけを持ち、色・寸法・class は書かない。DOM とテンプレートを当てて1枚の HTML にするのはアプリの仕事。形の正は同じフォルダの `document.schema.json`。

```bash
ai-handout-studio check <document.json>
ai-handout-studio document new --json <document.json> --title <題名>
ai-handout-studio document update <id> --json <document.json>
ai-handout-studio document export <id> --out <保存先.html>
```

手順(読者を1人決める・型を選ぶ・見本を読む・画像を用意する・組む・保存する・渡す)と部品・図の決まりは [references/document.md](references/document.md)。設計書・要求要件・調査結果・PR 説明・ADR のセクションの型は [references/document-templates.md](references/document-templates.md)。
