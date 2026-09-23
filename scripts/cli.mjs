#!/usr/bin/env node
// ai-handout-studio CLI の入口。本体の TypeScript を tsx で読む
// pnpm link --global で入れても、ここからリポジトリの node_modules を解決する
import { fileURLToPath } from "node:url";

// doctor は pnpm install の前にも動くよう、tsx を読まずに Node の標準だけで走らせる
if (process.argv[2] === "doctor") {
  const { main } = await import("./doctor.mjs");
  process.exitCode = await main(process.argv.slice(3));
} else {
  const { register } = await import("tsx/esm/api");
  // どのフォルダから呼んでも、リポジトリの tsconfig(JSX の設定など)で読む
  register({
    tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
  });
  await import("./cli.ts");
}
