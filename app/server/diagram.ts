import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  archifyHome,
  archifyInstall,
  findArchify,
} from "../../skills/question-sheet/scripts/archify.mjs";
import { IMAGE_LIMIT_BYTES, IMAGE_WARN_BYTES } from "./handout-assets.ts";

// 同梱の図の生成器で描けない図(構成・シーケンス・データの流れ・状態の移り変わり)を、
// 別の作者のスキル archify で作って画像にする。archify は同梱せず、入っているものを探して使う

export const DIAGRAM_TYPES = [
  "architecture",
  "workflow",
  "sequence",
  "dataflow",
  "lifecycle",
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const isDiagramType = (value: string): value is DiagramType =>
  DIAGRAM_TYPES.some((type) => type === value);

// archify のビューアーの Export メニューの形式。--out の拡張子で選ぶ
export type DiagramFormat = "png" | "jpeg" | "webp";

const FORMATS: ReadonlyMap<string, DiagramFormat> = new Map([
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".webp", "webp"],
]);

export const diagramFormatOf = (out: string): DiagramFormat | undefined =>
  FORMATS.get(extname(out).toLowerCase());

export type DiagramOptions = {
  readonly type: DiagramType;
  // archify の JSON(spec)。作業フォルダからの相対か絶対のパス
  readonly spec: string;
  readonly out: string;
};

// archify を探す場所と、パスを解く作業フォルダ
export type DiagramContext = {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly home: string;
};

export type ExportRequest = {
  // archify の deliver が書いた HTML
  readonly html: string;
  // 絶対パス
  readonly out: string;
  readonly format: DiagramFormat;
};

export type Exported = {
  readonly path: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
};

export type DiagramOutcome =
  | { readonly kind: "missing" }
  | { readonly kind: "preset"; readonly preset: string }
  | {
      readonly kind: "failed";
      readonly code: number;
      readonly diagnostics: string;
    }
  | ({ readonly kind: "done" } & Exported);

export const ARCHIFY_MISSING = `archify が見つからない。入れるなら: ${archifyInstall}(${archifyHome})`;

// archify のビューアーの Export メニュー。押すと形式ごとのボタンが出る
const EXPORT_BUTTON = "#btn-export";
const formatButtonOf = (format: DiagramFormat): string =>
  `#export-menu button[data-format="${format}"]`;

// ビューアーの Export で書き出す。archify が、案内・焦点・拡大などの見ている状態を外した図の全体を、
// 自分で決めた倍率(既定は4倍。大きすぎれば下げる)で描いて落とす。明るい配色・動きなしで開いて押す
export const exportDiagram = async (
  request: ExportRequest,
): Promise<Exported> => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await page.goto(pathToFileURL(request.html).href, { waitUntil: "load" });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page
        .click(EXPORT_BUTTON, { timeout: 10_000 })
        .then(() =>
          page.click(formatButtonOf(request.format), { timeout: 10_000 }),
        ),
    ]);
    await mkdir(dirname(request.out), { recursive: true });
    await download.saveAs(request.out);
    // 縦横は、落とした画像をそのまま開いて読む
    await page.goto(pathToFileURL(request.out).href);
    const size = await page.evaluate(() => {
      const image = document.images[0];
      return image
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : { width: 0, height: 0 };
    });
    return {
      path: request.out,
      bytes: (await stat(request.out)).size,
      ...size,
    };
  } finally {
    await browser.close();
  }
};

type Delivered = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

// archify の deliver(検査して HTML を書く)。終了コードと出力をそのまま返す
const deliver = (
  archify: string,
  options: DiagramOptions,
  spec: string,
  html: string,
  env: Record<string, string | undefined>,
): Promise<Delivered> =>
  new Promise((done) => {
    execFile(
      process.execPath,
      [
        join(archify, "bin", "archify.mjs"),
        "deliver",
        options.type,
        spec,
        html,
        "--quality",
        "showcase",
        "--json",
      ],
      {
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        // 更新の確かめは外へ通信するので止める
        env: { ...env, ARCHIFY_UPDATE_CHECK_DISABLED: "1" },
      },
      (error, stdout, stderr) =>
        done({
          code:
            error === null
              ? 0
              : typeof error.code === "number"
                ? error.code
                : 1,
          stdout,
          stderr:
            error !== null && typeof error.code !== "number" && stderr === ""
              ? error.message
              : stderr,
        }),
    );
  });

// archify の決まり(references/authoring-contract.md の「Visual preset default」)では、見た目の型は
// 使う人が名指ししたときだけ書く。見本の spec に書いてあるのを写しやすいので、書き出す前に見つける。
// 読めない spec の誤りは、archify の deliver が伝える
const visualPresetOf = async (spec: string): Promise<string | undefined> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(spec, "utf8"));
    if (typeof parsed !== "object" || parsed === null || !("meta" in parsed)) {
      return undefined;
    }
    const meta: unknown = parsed.meta;
    return typeof meta === "object" && meta !== null && "visual_preset" in meta
      ? String(meta.visual_preset)
      : undefined;
  } catch {
    return undefined;
  }
};

// archify で HTML を作り、ビューアーの Export で画像に書き出す
export const makeDiagram = async (
  options: DiagramOptions,
  context: DiagramContext,
  exportImage: (request: ExportRequest) => Promise<Exported> = exportDiagram,
): Promise<DiagramOutcome> => {
  const format = diagramFormatOf(options.out);
  if (format === undefined) {
    throw new Error("--out は .png・.jpg・.webp のファイルにする");
  }
  const preset = await visualPresetOf(resolve(context.cwd, options.spec));
  if (preset !== undefined) return { kind: "preset", preset };
  const archify = findArchify({
    env: context.env,
    cwd: context.cwd,
    home: context.home,
  });
  if (archify === null) return { kind: "missing" };
  const dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-diagram-"));
  try {
    const html = join(dir, "diagram.html");
    const delivered = await deliver(
      archify,
      options,
      resolve(context.cwd, options.spec),
      html,
      context.env,
    );
    if (delivered.code !== 0) {
      return {
        kind: "failed",
        code: delivered.code,
        diagnostics: [delivered.stdout, delivered.stderr]
          .map((text) => text.trim())
          .filter((text) => text !== "")
          .join("\n"),
      };
    }
    const exported = await exportImage({
      html,
      out: resolve(context.cwd, options.out),
      format,
    });
    return { kind: "done", ...exported };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export type DiagramReport = {
  readonly exitCode: number;
  readonly out: readonly string[];
  readonly err: readonly string[];
};

// 大きさの警告。資料に取り込めるのは1枚 3MB まで、1MB を超えると重い
const sizeWarnings = (bytes: number): readonly string[] => {
  if (bytes > IMAGE_LIMIT_BYTES) {
    return [
      "警告: 3MB を超えたので資料に取り込めない。--out を .webp にして書き出し直すか、図を分ける",
    ];
  }
  return bytes > IMAGE_WARN_BYTES
    ? [
        "警告: 1MB を超えた。資料に載せると重くなるので、--out を .webp にして書き出し直す",
      ]
    : [];
};

// 終了コードと出す文。無い 3、見た目の型を書いた・deliver が通らない 1、書き出せた 0
export const reportDiagram = (outcome: DiagramOutcome): DiagramReport => {
  if (outcome.kind === "missing") {
    return { exitCode: 3, out: [], err: [ARCHIFY_MISSING] };
  }
  if (outcome.kind === "preset") {
    return {
      exitCode: 1,
      out: [],
      err: [
        `meta.visual_preset("${outcome.preset}")は書かない。archify の見た目の型は、使う人が名指ししたときだけ書く決まり。消して書き出し直す。画像は作っていない`,
      ],
    };
  }
  if (outcome.kind === "failed") {
    return {
      exitCode: 1,
      out: [],
      err: [
        ...(outcome.diagnostics === "" ? [] : [outcome.diagnostics]),
        `archify の deliver が通らなかった(exit ${outcome.code})。画像は作っていない。診断に従って spec を直す`,
      ],
    };
  }
  return {
    exitCode: 0,
    out: [
      `path: ${outcome.path}`,
      `size: ${outcome.width}x${outcome.height}`,
      `bytes: ${outcome.bytes}`,
    ],
    err: sizeWarnings(outcome.bytes),
  };
};
