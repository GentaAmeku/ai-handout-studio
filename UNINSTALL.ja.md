# 外し方

この手順はコーディングエージェント(Claude Code か Codex CLI)に向けて書いてある。外すときは、clone したリポジトリのフォルダで、次のどれかで始める。エージェントは利用者の言語で進める。

- **Claude Code:** そのフォルダで起動して `/studio-uninstall` と打つ
- **Codex CLI:** そのフォルダを開いて **「UNINSTALL.md のとおりに外して」**(この日本語の手順を読ませるなら「UNINSTALL.ja.md のとおりに外して」)と頼む
- **clone をもう消していたら:** もう一度 clone してから、上のどちらかで始める

進み方は [SETUP.ja.md](SETUP.ja.md) と同じゲームブックの形で、`doctor --uninstall` が残っているものを調べて次に読む節を返す。節の番号は英語の [UNINSTALL.md](UNINSTALL.md) と同じ。

## 1. はじめに(エージェントへ)

### 始める前に1回だけ聞く

1. リポジトリの直下で `node scripts/doctor.mjs --uninstall --json` を実行する(Node の標準だけで動く。節5でコマンドを外したあとも使えるよう、`ai-handout-studio doctor` ではなくこちらを使う)。
2. `status` が `remaining` の項目を、外すものの一覧として利用者に見せる。節6で Playwright の Chromium も外すこと(ほかのプロジェクトが使っているものは残る)と、外さないもの(下の約束)も添える。
3. 次を1回にまとめて聞く。
   - 一覧のものを外してよいか。共通指示からは ai-handout-studio の段落だけを消し、ほかの行は変えないことを添える。
   - `archify` が `warn`(入っている)なら、archify も外すか。別の作者のスキルで、ほかの用途で入れたものかもしれない。
   - 資料と clone をどうするか。`workspace` の detail に資料の場所と件数がある。「clone ごと消す(資料も消える)」「資料を別のフォルダへ移してから clone を消す(移す先も聞く)」「clone は残す(外に置いたものだけ外す)」から選んでもらう。

外すのを断られたら、何も変えずに止める。

### 繰り返す

`ok` が `true` になるまで、次を繰り返す。

1. `node scripts/doctor.mjs --uninstall --json` を実行する。
2. `next.section` の節を読む。`next.reason` に残っているものが書いてある。残っている間は終了コードが 1 になる。
3. その節のとおりにしてから、もう一度 doctor を実行する。

`ok` が `true` になれば、clone の外に置いたものは外れている。最後に節6で仕上げる。

`checks` は項目ごとの `status` を持つ。`ok`(無い・外れた)・`remaining`(残っている。外す)・`skipped`(別の clone や別のアプリのもの。触らない)・`warn`(伝えておくが止めない)。

利用者への約束:

- 利用者の言語で話す。聞くのは始める前の1回と、clone を消す直前の確かめだけ。ほかはこちらで決めて進める。
- 消すのは、doctor が `remaining` と言ったものと、節6に書いたものだけ。`skipped` のものには触らない。
- 共通指示(`~/.claude/CLAUDE.md`・`~/.codex/AGENTS.md`)からは ai-handout-studio の段落だけを消す。
- `sudo` は使わない。要るときはコマンドを示し、利用者に実行してもらう。
- 入れるときに使った共通の道具(git・Node・pnpm・mise・lsof・Linux のシステムのライブラリ)と、シェルの設定に足した `PATH` の行は外さない。ほかの道具も使うため。外したいと言われたら、どこにあるかを伝える。

## 2. サーバー

doctor は、`127.0.0.1:5190` でこのリポジトリのサーバーが動いていないことと、サーバーのログ(システムの一時フォルダの `ai-handout-studio-dev.log`)が無いことを確かめる。

```bash
kill $(lsof -ti tcp:5190 -sTCP:LISTEN)
rm -f "$(node -p "require('os').tmpdir()")/ai-handout-studio-dev.log"
```

- `kill` は `server` が `remaining` のときだけ実行する。doctor は、5190 番のサーバーがこのリポジトリのものだと確かめてから `remaining` にする。
- ログはサーバーを止めてから消す。別の clone のサーバーが動いているとき(`skipped`)は、そのサーバーがログを使っているので残す。

## 3. 共通指示

doctor は、エージェントごとの共通指示のファイル(`~/.claude/CLAUDE.md`・`~/.codex/AGENTS.md`。symlink なら実体)に ai-handout-studio の段落が無いことを確かめる。段落は、セットアップの節8で足した `<!-- ai-handout-studio:start … -->` から `<!-- ai-handout-studio:end -->` まで。detail に行の番号がある。

1. ファイルを読み、detail の行に段落があることを確かめる。
2. 目印の2行を含めて段落を消す。段落の前後に続く空行は1つにまとめる。ほかの行は変えない。symlink なら実体を書き換え、リンクは残す。
3. 消したあと空白しか残らないファイルは、ファイルごと消す。symlink のときは、リンクも実体も残す。

detail に「start と end がそろっていない」とあるときは、目印のまわりを利用者に見せ、どこまで消すかを確かめてから消す。

## 4. スキル

doctor は、スキルの置き場(Claude Code は `~/.claude/skills/`、Codex CLI は `~/.agents/skills/`)に、このリポジトリを指す `ai-handout-studio`・`question-sheet` のリンクが無いことを確かめる。指す先の無いリンク(消した clone を指していたもの)も外す。

```bash
# detail に挙がったリンクだけを消す
rm ~/.claude/skills/ai-handout-studio ~/.claude/skills/question-sheet
rm ~/.agents/skills/ai-handout-studio ~/.agents/skills/question-sheet
```

- `rm` にはリンクの名前をそのまま渡す。`-r` と末尾の `/` は付けない。付けるとリンクの先(このリポジトリの `skills/`)を消してしまう。
- `skipped` のもの(中身のあるフォルダ、別の clone を指すリンク)は残す。スキルの置き場のフォルダも残す。

## 5. コマンド

doctor は、`PATH` と `~/.local/bin` に、このリポジトリを指す `ai-handout-studio` が無いことを確かめる。detail に、見つけた場所と入れ方がある。

- **`(symlink)`**(セットアップの節5の推奨の入れ方): `rm ~/.local/bin/ai-handout-studio`。detail の場所が違えば、その場所を消す。
- **`(pnpm のグローバルの入口)`**: `pnpm remove --global ai-handout-studio`

`~/.local/bin` のフォルダと、シェルの設定の `PATH` の行は残す。

## 6. 仕上げ

doctor の `ok` が `true` になったら、ここを行う。clone の中の `node_modules` を使うので、この順に進める。

1. **Chromium:** `pnpm exec playwright uninstall` を実行する。このリポジトリが入れたブラウザーの登録を外し、ほかのプロジェクトが使っていないものだけを消す。`--all` は付けない(ほかのプロジェクトのブラウザーまで消える)。clone を残すときも外す(また使うときはセットアップの節4で入れ直せる)。`node_modules` が無い(clone し直して `pnpm install` をしていない)ときは飛ばし、ブラウザーの置き場(macOS は `~/Library/Caches/ms-playwright`、Linux は `~/.cache/ms-playwright`)を利用者に伝える。ほかのプロジェクトも使うので、消すかは利用者が決める。
2. **archify:** 外すと答えたときだけ、`npx skills remove archify archify-review -g -y` を実行する(archify を入れると archify-review も一緒に入る)。
3. **warn:** ほかに `warn` の項目(どのリポジトリのものか分からないサーバーなど)があれば、利用者に伝える。
4. **資料と clone:** 始める前の答えに従う。
   - **clone ごと消す:** 消す場所(clone の絶対パス)を利用者に見せて確かめてから、clone の外(親のフォルダ)に移って `rm -rf <clone の絶対パス>` を実行する。
   - **資料を移してから消す:** `workspace` の detail の場所のフォルダを、答えの移す先へ `mv` で移す。移せたことを確かめてから、上と同じく clone を消す。
   - **clone は残す:** ここで終える。
   - `workspace` の detail の場所が clone の外にある(`AI_HANDOUT_STUDIO_WORKSPACE` で外に置いた)ときは、clone を消しても資料は残る。そのことを伝え、資料も消すかは利用者が決める。
5. 外したものと残したもの(`skipped`、残すと決めたもの、共通の道具)を短くまとめて伝える。clone を消したら、その中で動いていたエージェントの会話は閉じてよいことも伝える(作業のフォルダが無くなるため)。
