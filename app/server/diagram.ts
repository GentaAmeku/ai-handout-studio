import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { IMAGE_LIMIT_BYTES, IMAGE_WARN_BYTES } from "./handout-assets.ts";

// 図を画像にする。図は依存の diagram-skill(別のリポジトリの図解スキル)の生成器で描く。
// スキルは単体でも動くように作ってあるので、このコードとはコマンドだけでつなぐ(中身を import しない)。
// 撮るのは Studio の Playwright で、利用者は何も足さなくてよい

export const DIAGRAM_TYPES = [
  "flow",
  "structure",
  "compare",
  "sequence",
  "state",
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

const GENERATOR = fileURLToPath(
  new URL(
    "../../node_modules/diagram-skill/skills/diagram/scripts/diagram.mjs",
    import.meta.url,
  ),
);

export const isDiagramType = (value: string): value is DiagramType =>
  DIAGRAM_TYPES.some((type) => type === value);

// --out の拡張子で選ぶ形式
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
  // 図の JSON。作業フォルダからの相対か絶対のパス
  readonly spec: string;
  readonly out: string;
};

// パスを解く作業フォルダ。generator はテストが、入っていないときを作るのに使う
export type DiagramContext = {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly generator?: string;
};

export type ShootRequest = {
  // 生成器が書いた SVG
  readonly svg: string;
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
  | {
      readonly kind: "failed";
      readonly code: number;
      readonly diagnostics: string;
    }
  | ({ readonly kind: "done" } & Exported);

export const GENERATOR_MISSING =
  "図の生成器(diagram-skill)が入っていない。このリポジトリで pnpm install を実行する";

// 生成器の SVG を撮る倍率。ベクターなので、2倍でもにじまない
const SHOT_SCALE = 2;

// スクリーンショットは WebP を出せないので、撮った PNG をブラウザのキャンバスに描き直す
const toWebp = async (page: Page, png: Buffer): Promise<Buffer> =>
  Buffer.from(
    await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp").split(",")[1] ?? "";
    }, png.toString("base64")),
    "base64",
  );

// 生成器の SVG をブラウザに描かせて撮る
export const shootSvg = async (request: ShootRequest): Promise<Exported> => {
  const svg = await readFile(request.svg, "utf8");
  const size = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (size === null) throw new Error("生成器の SVG に viewBox が無い");
  const [width, height] = [Number(size[1]), Number(size[2])];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: SHOT_SCALE,
      colorScheme: "light",
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${svg}</body></html>`,
    );
    const figure = page.locator("svg").first();
    const shot = await figure.screenshot({
      type: request.format === "jpeg" ? "jpeg" : "png",
    });
    const image = request.format === "webp" ? await toWebp(page, shot) : shot;
    await mkdir(dirname(request.out), { recursive: true });
    await writeFile(request.out, image);
    return {
      path: request.out,
      bytes: image.length,
      width: width * SHOT_SCALE,
      height: height * SHOT_SCALE,
    };
  } finally {
    await browser.close();
  }
};

type Ran = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

// スキルのコマンドを Node で動かす。終了コードと出力をそのまま返す
const runNode = (
  args: readonly string[],
  env: Record<string, string | undefined>,
): Promise<Ran> =>
  new Promise((done) => {
    execFile(
      process.execPath,
      args,
      {
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        env,
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

const diagnosticsOf = ({ stdout, stderr }: Ran): string =>
  [stdout, stderr]
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n");

export const makeDiagram = async (
  options: DiagramOptions,
  context: DiagramContext,
  shoot: (request: ShootRequest) => Promise<Exported> = shootSvg,
): Promise<DiagramOutcome> => {
  const format = diagramFormatOf(options.out);
  if (format === undefined) {
    throw new Error("--out は .png・.jpg・.webp のファイルにする");
  }
  const generator = context.generator ?? GENERATOR;
  if (!existsSync(generator)) return { kind: "missing" };
  // 生成器で SVG を作り、ブラウザで撮る。題と説明は載せる側の caption に書くので、図の中には描かない
  const dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-diagram-"));
  try {
    const svg = join(dir, "diagram.svg");
    const drawn = await runNode(
      [
        generator,
        resolve(context.cwd, options.spec),
        "-o",
        svg,
        "--no-heading",
      ],
      context.env,
    );
    if (drawn.code !== 0) {
      return {
        kind: "failed",
        code: drawn.code,
        diagnostics: diagnosticsOf(drawn),
      };
    }
    const shot = await shoot({
      svg,
      out: resolve(context.cwd, options.out),
      format,
    });
    return { kind: "done", ...shot };
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

// 終了コードと出す文。生成器が無い 3、検査に通らない 1、書き出せた 0
export const reportDiagram = (outcome: DiagramOutcome): DiagramReport => {
  if (outcome.kind === "missing") {
    return { exitCode: 3, out: [], err: [GENERATOR_MISSING] };
  }
  if (outcome.kind === "failed") {
    return {
      exitCode: 1,
      out: [],
      err: [
        ...(outcome.diagnostics === "" ? [] : [outcome.diagnostics]),
        `図の JSON が生成器の検査に通らなかった(exit ${outcome.code})。画像は作っていない。指摘に従って JSON を直す`,
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
