// 動画を書き出す: node scripts/render.mjs [en|ja]
// out/ai-handout-studio-demo.<lang>.mp4(H.264、1280x720、30fps)と、記事の poster 用に同名の .jpg(先頭のコマ)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const langs = process.argv[2] ? [process.argv[2]] : ["en", "ja"];
const outDir = join(videoRoot, "out");
mkdirSync(outDir, { recursive: true });

const run = (command, args) =>
  execFileSync(command, args, { cwd: videoRoot, stdio: "inherit" });

for (const lang of langs) {
  const mp4 = join(outDir, `ai-handout-studio-demo.${lang}.mp4`);
  run("npx", [
    "remotion",
    "render",
    "src/index.ts",
    `demo-${lang}`,
    mp4,
    "--codec=h264",
    "--crf=23",
    "--audio-codec=aac",
  ]);
  // poster は 1.5 秒目(0 秒目は見出しが出る前で白地だけ)
  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    "1.5",
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    mp4.replace(/\.mp4$/, ".jpg"),
  ]);
  const probe = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=codec_name,width,height,r_frame_rate",
    "-of",
    "default=nw=1",
    mp4,
  ]);
  console.log(`\n${mp4}\n${probe}`);
}
