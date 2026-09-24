# セットアップ

この手順はコーディングエージェント(Claude Code か Codex CLI)に向けて書いてある。入れるときは、次のどれかで始める。エージェントは利用者の言語で進める。

- **Claude Code:** リポジトリを clone し、そのフォルダで起動して `/studio-setup` と打つ
- **Codex CLI:** clone したリポジトリを開いて **「SETUP.md のとおりに入れて」**(この日本語の手順を読ませるなら「SETUP.ja.md のとおりに入れて」)と頼む
- **clone の前なら:** エージェントに「https://github.com/GentaAmeku/ai-handout-studio を clone して、SETUP.md のとおりに入れて」と頼む

進み方はゲームブックの形で、`doctor` が状態を調べて次に読む節を返す。節の番号は英語の [SETUP.md](SETUP.md) と同じ。

## 1. はじめに(エージェントへ)

`ok` が `true` になるまで、次を繰り返す。

1. リポジトリの直下で `node scripts/doctor.mjs --json` を実行する(Node の標準だけで動くので `pnpm install` の前でも使える。節5のあとは `ai-handout-studio doctor --json` でも同じ)。
2. `next.section` の節を読む。`next.reason` に足りないことが書いてある。済むまでは終了コードが 1 になる。
3. その節のとおりにしてから、もう一度 doctor を実行する。

`checks` は項目ごとの `status` を持つ。`ok`・`missing`(無い)・`outdated`(古い・別の場所を指す)・`skipped`(入っていないエージェント、断った共通指示)・`warn`(伝えておくが止めない)。

利用者への約束:

- 利用者の言語で話す。聞くのは選ぶところ(言語・組織名・共通指示への追記・任意の機能)だけ。ほかはこちらで決めて進める。
- 利用者の共通指示(`~/.claude/CLAUDE.md`・`~/.codex/AGENTS.md`)とシェルの設定(`~/.zshrc`・`~/.bashrc` など)は、同意を取ってから書き換える。
- `sudo` は使わない。要るときはコマンドを示し、利用者に実行してもらう。
- 節に書いていないことは変えない。ここに書いた以外のところから道具を入れない。
- 節6でスキルを入れるまでは会話で聞く。節9からは質問票で聞く。

## 2. 前提

doctor は `git`・Node 24 以上・pnpm 11・OS(macOS か Linux。Windows は WSL の中で使う)を確かめる。

- **mise(推奨):** `mise.toml` が Node と pnpm の版を決めている。`mise` があればリポジトリの直下で `mise install` を実行する。無ければ利用者に入れてもらい(mise の説明のとおり)、シェルで有効にしてもらう。
- **mise を使わないとき:** Node 24 以上を入れ、corepack で pnpm を使えるようにする。`corepack enable` と `corepack install --global pnpm@11`。`corepack enable` が権限で失敗したら利用者に実行してもらう。
- **git:** macOS は利用者に `xcode-select --install` を実行してもらう。Linux はパッケージマネージャーで入れてもらう(`sudo apt install git` など)。
- **Windows:** 止めて、WSL を入れ、WSL の中に clone し、そこでエージェントを起こすよう伝える。

## 3. 依存と見た目の生成物

doctor は `node_modules` と `design/dist` を確かめる。

```bash
pnpm install
```

`pnpm install` の `prepare` が `design/dist`(CSS と見本)を作る。それでも `design/dist` が無ければ `pnpm design:build` を実行する。

## 4. ブラウザー

doctor は Playwright の Chromium(PDF・PNG の書き出しとスクリーンショットに使う)と `lsof`(待ち受けているプロセスを調べるのに使う)を確かめる。

```bash
pnpm exec playwright install chromium
```

- Linux で、システムのライブラリが足りずに Chromium が起きないときは、利用者に `sudo pnpm exec playwright install-deps chromium` を実行してもらう。
- `lsof` が無ければ(Linux の最小構成)、利用者に入れてもらう(`sudo apt install lsof` など)。macOS には入っている。

## 5. コマンド

doctor は `ai-handout-studio` が `PATH` にあり、このリポジトリを指すことを確かめる。

推奨: `~/.local/bin` に symlink を張る。

```bash
mkdir -p ~/.local/bin
ln -sfn "$PWD/scripts/cli.mjs" ~/.local/bin/ai-handout-studio
```

`~/.local/bin` が `PATH` に無ければ、同意を取ってシェルの設定に `export PATH="$HOME/.local/bin:$PATH"` を足す。効くのは新しいシェルからなので、doctor は新しい `PATH` で実行する(`PATH="$HOME/.local/bin:$PATH" node scripts/doctor.mjs --json`)。

ほかの入れ方: `pnpm link --global`(pnpm のグローバルの bin が要る。`pnpm setup` はシェルの設定を書き換えるので先に同意を取る)。

`outdated` なら、コマンドが別の clone を指している。上のコマンドで張り直す。

## 6. スキル

doctor は、設定のフォルダがあるエージェント(Claude Code は `~/.claude`、Codex CLI は `~/.codex`)ごとに、2つのスキルのリンクがあり、このリポジトリを指すことを確かめる。

| エージェント | スキルの置き場 |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex CLI | `~/.agents/skills/` |

```bash
# Claude Code
mkdir -p ~/.claude/skills
ln -sfn "$PWD/skills/ai-handout-studio" ~/.claude/skills/ai-handout-studio
ln -sfn "$PWD/skills/question-sheet" ~/.claude/skills/question-sheet

# Codex CLI
mkdir -p ~/.agents/skills
ln -sfn "$PWD/skills/ai-handout-studio" ~/.agents/skills/ai-handout-studio
ln -sfn "$PWD/skills/question-sheet" ~/.agents/skills/question-sheet
```

- コピーではなく symlink にする。質問票のスクリプトはリンクの実体からリポジトリの `design/dist` を辿る。
- `outdated` はリンクが別の場所(別の clone や、古い `<リポジトリ>/skills`)を指している。`ln -sfn` で張り直す。リンクではなく中身のあるフォルダなら消さずに利用者に聞く。
- 入れたスキルは、今の会話を起こし直すまで一覧に出ないことがある。それまでは、節で要るときに `skills/question-sheet/SKILL.md` を直接読む。

## 7. 言語と組織名

doctor は `workspace/profile.json` の `locale` と `orgName` が決まっていることを確かめる。

1回にまとめて聞く。資料の言語(`ja` か `en`)と、スライドの表紙と締め・HTML 資料・質問票に出す組織名(空でもよい)。

```bash
ai-handout-studio settings --set locale=ja --set orgName="○○株式会社"
```

## 8. 共通指示

doctor は、エージェントごとの共通指示のファイル(`~/.claude/CLAUDE.md`・`~/.codex/AGENTS.md`。symlink なら実体)に ai-handout-studio の段落があり、版が新しいことを確かめる。

段落は「スライドと HTML 資料は ai-handout-studio スキルで作る」「質問は質問票で聞く」をエージェントに伝え、どのフォルダの会話でも同じ動きにする。無ければ、利用者がスキルの名前を挙げたときだけ使われる。

1. `setup/agent-instructions.<locale>.md` の段落を利用者に見せ、足すか聞く。
2. **足す:** ファイルの中身を目印ごと、それぞれの共通指示の末尾に足す(ファイルが無ければ作る。symlink なら実体を書き換え、リンクは残す)。doctor が `outdated` と言うときは、`<!-- ai-handout-studio:start … -->` から `<!-- ai-handout-studio:end -->` までを新しい段落に入れ替える。
3. **断る:** 答えを残す。以後 doctor はこの節を飛ばす。

```bash
ai-handout-studio settings --set agentInstructions=declined
```

あとでまた聞いてほしくなったら `ai-handout-studio settings --set agentInstructions=ask`。

## 9. 任意の機能

doctor は `features.lan`・`features.imageGeneration`・`features.share` が決まっている(`true` か `false`)ことを確かめる。archify(別の作者のスキル)が入っているかも見る(入っていれば `ok`、無ければ `warn` で止めない)。

3つを1枚の質問票でまとめて聞く。archify が無ければ、入れるかも同じ質問票で聞く(question-sheet スキル。質問の JSON を書いて `ai-handout-studio sheet new` で保存し、`readUrl` を伝える。貼られた回答は `ai-handout-studio sheet answers` で残す)。危うさは質問の中に書く。

| 機能 | できること | 伝える危うさ |
| --- | --- | --- |
| `lan` | 同じ Wi-Fi のスマホで資料を読む(`open` が全ての口で起こし、`lanReadUrl` を出す) | 同じネットワークの誰でも資料を読める(書き込みとエージェントの起動はこの PC からだけ)。共有の Wi-Fi では使わない。ファイアウォールで止まることがある |
| `imageGeneration` | 画像生成の CLI で挿絵やイメージを作る。Codex CLI(`codex exec`)か Antigravity CLI(`agy`) | それぞれのサービスの利用枠を使う。Antigravity CLI は `--dangerously-skip-permissions` で起こすので、確かめずにコマンドを実行しファイルを書ける。保存先のフォルダを渡すが、囲いではない。Codex は保存先のフォルダで `-s workspace-write` で動く |
| `share` | 質問票と HTML 資料を Claude の Artifact で共有する(`ai-handout-studio share`)。Claude Code が要る | Artifact は非公開で始まる。公開リンクにすると、資料に入っている名前も含めて誰でも読める |

画像生成は、`codex` と `agy` のどちらが入っているかを見て、質問に書く(どちらも `PATH` に無いと doctor が warn を出す)。

```bash
ai-handout-studio settings --set features.lan=false --set features.imageGeneration=true --set features.share=false
```

archify([tt-a1i/archify](https://github.com/tt-a1i/archify)。MIT)を入れると、エージェントが構成図・シーケンス図・データの流れ・状態の移り変わりの図を作り、画像にしてスライド・HTML 資料・質問票に載せられる(`ai-handout-studio diagram`)。入れなくても資料は作れ、図は表や文、同梱の流れの図で済ませる。質問では、何ができるかと、別の作者のスキルで、このリポジトリには同梱しないことを書く。入れると答えたときだけ、次を実行する。断られたら入れない(doctor の warn は残るが、止まらない)。

```bash
npx skills add tt-a1i/archify -g
```

## 10. 起動と確かめ

doctor はサーバーが `127.0.0.1:5190` で答え、このリポジトリのものであることと、同梱資料(使い方のスライドとセットアップの HTML 資料)が入っていることを確かめる。同梱資料は、サーバーが初めて起きたときにスライドと HTML 資料が1件も無ければ自動で入る(質問票は数えない)。別のリポジトリのサーバーなら `ai-handout-studio restart` で起こし直す。同梱資料が入っていなければ(`examples` が `warn`)、入れるかを利用者に聞き、望めば `ai-handout-studio examples` を実行する。

```bash
ai-handout-studio open
```

`url`(出ていれば `lanUrl` も)を利用者に伝える。続けて、どのフォルダの会話でもよいので「○○の資料を作って」と頼んでみるよう案内する。エージェントが足りないことを質問票で聞き、資料を作って検査し、URL を返す。

## 付録 A. 更新

```bash
git pull
pnpm install
node scripts/doctor.mjs --json
```

あとは節1のとおり doctor に従う。共通指示の段落が `outdated` なら、節8で(同意を取って)入れ替える。

`pnpm install` の `prepare` が git の `post-merge`・`post-rewrite` フックを置く。以後の `git pull` では、依存(`pnpm-lock.yaml`)か `design/dist` の元が変わったときだけ、フックが入れ直し・作り直しをして、動いているサーバーを起こし直す。`ai-handout-studio open`・`restart` と `pnpm dev` も、サーバーを起こす前に同じことを確かめる。サーバーのコードだけが変わったときは、動いているサーバーが自分で読み直す。

## 付録 B. 外す

外すときも、同じゲームブックの形で進める。Claude Code なら `/studio-uninstall` と打ち、Codex CLI なら「UNINSTALL.md のとおりに外して」と頼む。`node scripts/doctor.mjs --uninstall --json` が残っているものを調べ、次に読む節を返す。手順は [UNINSTALL.ja.md](UNINSTALL.ja.md)(英語は [UNINSTALL.md](UNINSTALL.md))。

## 付録 C. 困ったとき

- **5190 番が使われている:** `lsof -nP -iTCP:5190 -sTCP:LISTEN` で相手が分かる。ai-handout-studio でなければ、止めてよいか利用者に聞く。サーバーのログはシステムの一時フォルダの `ai-handout-studio-dev.log`(`node -p "require('os').tmpdir()"`)。
- **Chromium が起きない(Linux):** 利用者に `sudo pnpm exec playwright install-deps chromium` を実行してもらう。
- **スマホで `lanReadUrl` が開けない:** スマホが同じ Wi-Fi にいること(ゲスト用のネットワークは端末どうしを切り離すことが多い)。サーバーが LAN 向けに起きていること(`ai-handout-studio restart --lan`、または `features.lan=true`)。ファイアウォール: macOS は `node` の受信を許す(システム設定 > ネットワーク > ファイアウォール)。Linux の ufw なら利用者に `sudo ufw allow 5190/tcp` を実行してもらう。
