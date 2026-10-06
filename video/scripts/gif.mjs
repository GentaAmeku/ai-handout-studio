// テンプレート切り替えの GIF を書き出す: node scripts/gif.mjs [en|ja]
// switch-<lang> の合成(場面 6 の 5 秒)を描いてから、ffmpeg の palettegen で 960px・12fps の GIF にする。
// 置き場は docs/images/<lang>/template-switch.gif(README が参照する)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(videoRoot, "..");
const langs = process.argv[2] ? [process.argv[2]] : ["en", "ja"];

const run = (command, args) =>
  execFileSync(command, args, { cwd: videoRoot, stdio: "inherit" });

for (const lang of langs) {
  const tmp = mkdtempSync(join(tmpdir(), "switch-gif-"));
  const mp4 = join(tmp, `switch.${lang}.mp4`);
  run("npx", [
    "remotion",
    "render",
    "src/index.ts",
    `switch-${lang}`,
    mp4,
    "--codec=h264",
    "--crf=18",
    "--muted",
  ]);
  const gif = join(repoRoot, "docs/images", lang, "template-switch.gif");
  // 1 回目の通過でパレットを作り、2 回目で当てる。文字が潰れないよう誤差拡散は弱め(bayer)
  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    mp4,
    "-filter_complex",
    "[0:v]fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop",
    "0",
    gif,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    `wrote ${gif} (${(statSync(gif).size / 1024 / 1024).toFixed(2)} MB)`,
  );
}
