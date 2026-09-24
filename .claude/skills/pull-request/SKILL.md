---
name: pull-request
description: この repo で PR を作るときの手順。確認コマンドを通し、画面が変わるなら変更前・変更後のスクリーンショットを撮り、テンプレートの3セクション(概要・結果(エビデンス)・補足)で PR を作る。手元でもクラウドでも使う
---

# PR を作る

PR を作るときは、環境を問わずこの手順で進める。
Claude のクラウドセッション(`CLAUDE_CODE_REMOTE=true`)と GitHub Actions(`GITHUB_ACTIONS=true`)では、利用者は画面を見られない。そこで変更を終えたら、頼まれなくてもこの手順で PR まで作る(CLAUDE.md。利用者が前もって頼んでいるので、改めて確かめなくてよい)。GitHub Actions では、PR は `gh pr create` で作る。

## 1. 確かめる

AGENTS.md の確認コマンドをすべて通す。落ちたら直してから次へ進む。

## 2. スクリーンショットを撮る(画面が変わるときだけ)

画面が変わらない変更(サーバーだけ、スキル、文書など)なら、ここは飛ばす。エビデンスはコマンドの結果になる。

dev サーバーを日本語で起動する。言語は `workspace/profile.json` の `locale` で決まり、無ければサーバーの `LANG` で決まる。クラウドの既定は英語になる。

```
LANG=ja_JP.UTF-8 pnpm dev --port 5199 --strictPort   # run_in_background で起動する
```

`--strictPort` は外さない。外すと、止め忘れた古いサーバーがポートを使っているとき、新しいサーバーは黙って別のポートで起動する。すると撮影は古いサーバーに当たってしまう。
手元でポートが埋まっていたら(利用者が自分の dev サーバーを動かしているなど)、利用者のサーバーは止めない。別のポートで起動し、撮影に `--origin` を渡す。
Chromium が無ければ、先に `pnpm exec playwright install chromium` を実行する。

撮影には `node .claude/skills/pull-request/screenshot.mjs` を使う。使い方はファイルの先頭に書いてある。
- 帯だけなら `--selector "header.viewer__bar"` を付ける。
- 書き出しのお知らせのように、操作したあとの画面は `--click` と `--wait-for` で撮る。
- 資料の ID は `curl -s 127.0.0.1:5199/api/decks`(`/api/documents`・`/api/sheets`)で調べる。
- 同梱の見本は、dev サーバーを起動すると `workspace/` に入る。

変更前と変更後は、同じ引数で撮る。

- **変更後**: 作業ツリーのまま撮る。
- **変更前**: 変更をコミットし、`git status` が空なのを確かめてから、`git checkout <base> -- app design` で元に戻し、dev サーバーを起動し直して撮る。撮り終えたら `git checkout HEAD -- app design` で戻し、`git status` が空なのを確かめる。`app/server/` は起動時に読まれるので、切り替えるたびに起動し直す。
- 画面の手前には、撮影の都合でパネルや案内が重なることがある。撮った画像は Read で開いて、比べたいところが写っているか確かめる。
- dev サーバーは `pkill -f "[v]ite.js --port 5199"` で止め、`pgrep -f "[v]ite.js"` で何も出ないのを確かめる。
  - 実際のコマンド行は `node <repo>/node_modules/vite/bin/vite.js --port 5199` なので、`vite --port` では一致しない。
  - `[v]` を付けないと、そのコマンドを走らせているシェルまで止まる。
  - `pkill` は1つのコマンドとして単独で走らせる。同じコマンドの中の別の文字列(ヒアドキュメントなど)が一致すると、自分のシェルも止まる。

画像はリポジトリの外(クラウドならセッションのスクラッチパッド)に撮りためる。3 で置く場所とは別。

## 3. 画像を PR から見られるようにする

GitHub の MCP にも `gh` にも、PR の本文へ画像を上げる手段が無い。そこで次のようにする。

1. 画像を `pr-screenshots/` に置いてコミットし、push する。そのコミットの SHA を控える。
2. すぐ `git rm -r pr-screenshots` をコミットし、push する。
3. PR の本文では `https://github.com/<owner>/<repo>/blob/<SHA>/pr-screenshots/<file>.png?raw=true` で参照する。

SHA で固定した URL なので、2 で消したあとも表示される。PR の差分には画像が入らない。

## 4. PR を作る

PR は GitHub の MCP か `gh pr create` で作る。本文は `.github/pull_request_template.md` の3セクション(概要・結果(エビデンス)・補足)だけで書く。

- **概要**: 何のための変更か。変更内容は1行ほどでよい。
- **結果(エビデンス)**: 変更前と変更後を並べて比べられるようにする。
  - 小さな画像は表の左右に置く。
  - 帯のような横長の画像は、「変更前」「変更後」の小見出しで分けて上下に置く。
  - 撮影条件(幅・言語・どの資料か)と、通したコマンドも書く。
- **補足**: 任意。ほかの画面への影響、決めきれなかった点、画像の置き方(3)を短く書く。無ければ見出しごと消す。

作ったら、PR の URL を利用者に伝える。そのあとの修正で画面が変わったら、2〜3 をやり直し、本文の画像を差し替える。
