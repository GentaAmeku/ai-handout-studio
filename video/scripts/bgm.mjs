// BGM を Tone.js でオフライン合成し、ラウドネスを整えて public/bgm.wav に書く: node scripts/bgm.mjs
// Tone.js は Web Audio を要るので、リポジトリの Playwright の Chromium の中で合成し、WAV を受け取る。
// 曲は 100 BPM・4 コードの 8 小節を 2 回(約 38 秒)と締めの 1 小節。製品の白と薄い青に合う、軽いプラックとパッド
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(videoRoot, "..");
const { chromium } = createRequire(join(repoRoot, "package.json"))(
  "playwright",
);
const toneJs = createRequire(join(videoRoot, "package.json")).resolve(
  "tone/build/Tone.js",
);

const SECONDS = 42;
// 最終的なラウドネス(LUFS)。ナレーションが無いので、動画全体でこの値になる
const LOUDNESS = -16;

// ブラウザーの中で走る作曲。Tone.Offline で描き、16 ビットの WAV を base64 で返す
const compose = async ({ seconds }) => {
  const Tone = window.Tone;
  const BPM = 100;
  const bar = (60 / BPM) * 4;
  const chords = [
    ["C4", "E4", "G4", "B4"],
    ["A3", "C4", "E4", "G4"],
    ["F3", "A3", "C4", "E4"],
    ["G3", "B3", "D4", "F4"],
  ];
  const bass = ["C2", "A1", "F1", "G1"];
  const rendered = await Tone.Offline(
    ({ transport }) => {
      transport.bpm.value = BPM;
      const master = new Tone.Limiter(-1).toDestination();
      const comp = new Tone.Compressor(-20, 3).connect(master);
      const verb = new Tone.Reverb({ decay: 2.6, wet: 0.3 }).connect(comp);
      const delay = new Tone.FeedbackDelay("8n.", 0.22).connect(verb);
      delay.wet.value = 0.25;
      const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fattriangle", count: 3, spread: 18 },
        envelope: { attack: 0.8, decay: 0.4, sustain: 0.7, release: 1.6 },
        volume: -22,
      }).connect(verb);
      const pluck = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.004, decay: 0.22, sustain: 0.05, release: 0.3 },
        volume: -16,
      }).connect(delay);
      const bassSynth = new Tone.MonoSynth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 },
        filter: { type: "lowpass", Q: 1 },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.4,
          baseFrequency: 200,
          octaves: 1.5,
        },
        volume: -14,
      }).connect(comp);
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 5,
        envelope: { attack: 0.001, decay: 0.28, sustain: 0 },
        volume: -12,
      }).connect(comp);
      const hat = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
        volume: -30,
      }).connect(new Tone.Filter(9000, "highpass").connect(comp));
      const shaker = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0 },
        volume: -34,
      }).connect(new Tone.Filter(5000, "highpass").connect(verb));
      // 単音のシンセは時刻順にしか予約できないので、小節末のフィルは別のシンセで鳴らす
      const fill = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.005, decay: 0.08, sustain: 0 },
        volume: -32,
      }).connect(new Tone.Filter(5000, "highpass").connect(verb));

      const totalBars = Math.floor(seconds / bar);
      const arpOf = (chord, index) =>
        [
          chord[0],
          chord[2],
          chord[1],
          chord[3],
          chord[2],
          chord[0],
          chord[3],
          chord[1],
        ][index];
      for (let b = 0; b < totalBars; b++) {
        const t0 = b * bar;
        const chord = chords[b % 4];
        const last = b === totalBars - 1;
        if (last) {
          pad.triggerAttackRelease(["C4", "E4", "G4", "C5"], bar * 1.5, t0);
          bassSynth.triggerAttackRelease("C2", bar, t0);
          pluck.triggerAttackRelease(["C5", "E5", "G5"], "8n", t0, 0.6);
          kick.triggerAttackRelease("C1", "8n", t0, 0.9);
          break;
        }
        pad.triggerAttackRelease(chord, bar * 0.95, t0);
        // 最初の 2 小節は入りをやわらかく(パッドだけ)、3 小節目からリズムを足す
        const intro = b < 2;
        for (let e = 0; e < 8; e++) {
          const t = t0 + (e * bar) / 8;
          if (!intro || e >= 4)
            pluck.triggerAttackRelease(
              Tone.Frequency(arpOf(chord, e)).transpose(12).toNote(),
              "16n",
              t,
              e % 2 ? 0.55 : 0.8,
            );
          if (intro) continue;
          hat.triggerAttackRelease("32n", t, e % 2 ? 0.5 : 0.8);
          if (e % 2) shaker.triggerAttackRelease("16n", t + bar / 16, 0.6);
        }
        if (intro) continue;
        bassSynth.triggerAttackRelease(bass[b % 4], "4n", t0, 0.9);
        bassSynth.triggerAttackRelease(bass[b % 4], "8n", t0 + bar * 0.5, 0.7);
        bassSynth.triggerAttackRelease(bass[b % 4], "8n", t0 + bar * 0.75, 0.6);
        kick.triggerAttackRelease("C1", "8n", t0, 0.9);
        kick.triggerAttackRelease("C1", "8n", t0 + bar * 0.5, 0.7);
        // 8 小節の終わりに、軽いフィル
        if (b % 8 === 7)
          for (let f = 0; f < 4; f++)
            fill.triggerAttackRelease("16n", t0 + bar * (0.75 + f / 16), 0.9);
      }
    },
    seconds,
    2,
    44100,
  );
  const buffer = rendered.get();
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const n = left.length;
  const bytes = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (offset, text) => {
    for (const [i, c] of [...text].entries())
      bytes.setUint8(offset + i, c.charCodeAt(0));
  };
  str(0, "RIFF");
  bytes.setUint32(4, 36 + n * 4, true);
  str(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 2, true);
  bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * 4, true);
  bytes.setUint16(32, 4, true);
  bytes.setUint16(34, 16, true);
  str(36, "data");
  bytes.setUint32(40, n * 4, true);
  const clamp = (v) => Math.max(-1, Math.min(1, v)) * 32767;
  for (let i = 0; i < n; i++) {
    bytes.setInt16(44 + i * 4, clamp(left[i]), true);
    bytes.setInt16(46 + i * 4, clamp(right[i]), true);
  }
  const u8 = new Uint8Array(bytes.buffer);
  const parts = [];
  for (let i = 0; i < u8.length; i += 0x8000)
    parts.push(String.fromCharCode(...u8.subarray(i, i + 0x8000)));
  return btoa(parts.join(""));
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  await page.addScriptTag({ path: toneJs });
  const base64 = await page.evaluate(compose, { seconds: SECONDS });
  await browser.close();
  await mkdir(join(videoRoot, "public"), { recursive: true });
  const raw = join(videoRoot, "public", "bgm.raw.wav");
  const out = join(videoRoot, "public", "bgm.wav");
  await writeFile(raw, Buffer.from(base64, "base64"));
  // 2 パスにはせず loudnorm を 1 回掛ける。短い BGM なので十分合う。最後の 2 秒は消えていく
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    raw,
    "-af",
    `loudnorm=I=${LOUDNESS}:TP=-1.5:LRA=9,afade=t=out:st=${SECONDS - 2.5}:d=2.5`,
    "-ar",
    "48000",
    out,
  ]);
  await rm(raw);
  const stats = execFileSync(
    "ffmpeg",
    ["-i", out, "-af", "loudnorm=print_format=summary", "-f", "null", "-"],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  console.log(`wrote ${out}`);
  console.log(
    String(stats)
      .split("\n")
      .filter((line) => /Input Integrated|Input True Peak/.test(line))
      .join("\n"),
  );
};

await main();
