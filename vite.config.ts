import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { LAN_ENV } from "./app/server/lan.ts";
import { aiHandoutStudioApi } from "./app/server/plugin.ts";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot =
  process.env.AI_HANDOUT_STUDIO_WORKSPACE ?? join(repoRoot, "workspace");
// 資料を同じ LAN から読めないよう、ふだんはループバックだけで待ち受ける。
// `ai-handout-studio open --lan` / `restart --lan` で起こしたその起動だけ、全ての口に開く
const host = process.env[LAN_ENV] === "1" ? true : "127.0.0.1";

export default defineConfig({
  root: "app",
  plugins: [react(), aiHandoutStudioApi({ repoRoot, workspaceRoot })],
  server: {
    host,
    // 画面が読むのは app/ と design/(app/ の外にある)と依存だけ。/@fs/ で読める範囲をこれに絞り、
    // --lan の起動で LAN の端末が workspace/ の生のファイルや .claude/ を読めないようにする。
    // 資料は API(/api/)を通して読む
    fs: {
      allow: ["app", "design", "node_modules"].map((dir) =>
        join(repoRoot, dir),
      ),
    },
    // 画面は同じ origin から読むので CORS は要らない。既定の CORS は localhost の任意のポートの
    // origin を反射し、手元のほかの Web アプリから API を読めてしまう
    cors: false,
  },
  preview: { host, cors: false },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    // 日時の表示は手元の時刻帯で書く。期待値は日本時間なので、CI(UTC)でも同じになるよう固定する。
    // 設定の locale が無いときの言語(中身の見本の言語も)は LANG で決まる。期待値は日本語なので固定する
    env: { TZ: "Asia/Tokyo", LANG: "ja_JP.UTF-8" },
    // 面が読む値(app/src/design/surface-usage.ts)は部品の CSS を ?raw で読む。
    // テストは既定で CSS を空にするので、この3枚と、テンプレートの専用の CSS(template.css)だけは中身を通す
    css: {
      include: [/design\/(slide|document|interaction)\.css/, /template\.css/],
    },
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.export.test.ts"],
  },
});
