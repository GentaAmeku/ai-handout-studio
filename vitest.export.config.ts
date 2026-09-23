import { defineConfig } from "vitest/config";

// 実ブラウザでの書き出しテストだけを流す設定(pnpm test:export)
export default defineConfig({
  root: "app",
  test: {
    environment: "node",
    include: ["server/**/*.export.test.ts"],
    // 画面の言語は設定の locale、無ければ LANG で決まる。見る文言は日本語なので固定する
    env: { LANG: "ja_JP.UTF-8" },
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
