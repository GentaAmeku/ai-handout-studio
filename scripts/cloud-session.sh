#!/bin/bash
# Claude のクラウドセッションを始めたときだけ、依存を揃える(SessionStart フックから呼ぶ)。
# Node 24 と pnpm 11 はクラウド環境のセットアップスクリプトが /opt/node24 に入れておく。
# 手元のセッションでは何もしない。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# 既定の PATH には Node 22 が先に並ぶ。以後のコマンドで Node 24 を使わせる
if [ -d /opt/node24/bin ]; then
  export PATH="/opt/node24/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="/opt/node24/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
  fi
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
pnpm install --frozen-lockfile
# Playwright を上げたときも、入っている Chromium を版に合わせる(揃っていればすぐ終わる)
pnpm exec playwright install chromium
