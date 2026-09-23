import { execFile } from "node:child_process";
import { join } from "node:path";
import type { BuildResult } from "./design.ts";

// 開発サーバーから design build を回す。見本は React で描くので、Vite の設定と
// 同じ読み込み(JSX を解かない)には載せず、CLI を別プロセスで呼ぶ
export const buildDesignInProcess =
  (repoRoot: string) => (): Promise<BuildResult> =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [join(repoRoot, "scripts", "cli.mjs"), "design", "build"],
        { cwd: repoRoot, timeout: 60_000 },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              success: false,
              message: stderr.trim() || error.message,
            });
            return;
          }
          resolve({
            success: true,
            files: stdout
              .split("\n")
              .map((line) => line.match(/^作った: design\/(.+)$/)?.[1])
              .filter((file): file is string => file !== undefined),
          });
        },
      );
    });
