import { resolve } from "node:path";
import { checkFile } from "./check-file.ts";

// pnpm deck:check <ファイル>。合格なら exit 0

const run = async (target: string | undefined): Promise<number> => {
  if (!target) {
    console.error(
      "使い方: pnpm deck:check <deck.json / patch.json などのパス>",
    );
    return 2;
  }
  // pnpm はリポジトリ直下で実行するので、呼び出した場所からの相対パスに直す
  return checkFile(resolve(process.env.INIT_CWD ?? process.cwd(), target));
};

process.exitCode = await run(process.argv[2]);
