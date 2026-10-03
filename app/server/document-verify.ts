import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DocumentBlock, DocumentFile } from "../src/schema/document.ts";

// code ブロックの本文を、出どころ(props.verify)の実物と照合する。ai-handout-studio check --run だけが呼ぶ。
// run: ブロックの行が、コマンドの出力に同じ順で出るか。途中の行は省いてよい
// file: ブロックの行が、ファイルの連続した行と一致するか
// 行は前後の空白を落として比べる。コマンドもファイルも、check を呼んだフォルダ(cwd)から見る

type CodeBlock = Extract<DocumentBlock, { type: "code" }>;
type Verify = NonNullable<CodeBlock["props"]["verify"]>;

export type RunOutput = {
  readonly output: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
};

export type VerifyDeps = {
  readonly cwd: string;
  readonly run: (command: string, cwd: string) => Promise<RunOutput>;
  readonly read: (path: string) => Promise<string | undefined>;
  // 走らせる前に、何を走らせるかを見せる
  readonly onRun?: (command: string) => void;
};

export type VerifyResult = {
  readonly checked: number;
  readonly failures: readonly string[];
};

export const RUN_TIMEOUT_MS = 60_000;

// 出力の照合で読み飛ばす行。省略の印と、コマンドを打った行($ で始まる)
const OMISSION = new Set(["...", "…", "⋮"]);
const isPromptLine = (line: string): boolean => line.startsWith("$ ");

// 色の制御文字。NO_COLOR を守らない道具もあるので、比べる前に落とす
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

const linesOf = (text: string): readonly string[] =>
  text
    .replace(ANSI, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());

// 前後の空行を落とす
const trimBlank = (lines: readonly string[]): readonly string[] => {
  const start = lines.findIndex((line) => line !== "");
  if (start === -1) return [];
  const end = lines.findLastIndex((line) => line !== "");
  return lines.slice(start, end + 1);
};

const outputLines = (text: string): readonly string[] =>
  linesOf(text).filter(
    (line) => line !== "" && !OMISSION.has(line) && !isPromptLine(line),
  );

// expected の各行が actual に同じ順で出るか。出なかった最初の行の番号(0 から)を返す
export const firstMissingInOrder = (
  expected: readonly string[],
  actual: readonly string[],
): number | undefined => {
  const missingFrom = (index: number, from: number): number | undefined => {
    if (index >= expected.length) return undefined;
    const found = actual.indexOf(expected[index] ?? "", from);
    return found === -1 ? index : missingFrom(index + 1, found + 1);
  };
  return missingFrom(0, 0);
};

// excerpt が whole の連続した行と一致するか
export const isExcerpt = (
  excerpt: readonly string[],
  whole: readonly string[],
): boolean =>
  excerpt.length > 0 &&
  whole.some((_, start) =>
    excerpt.every((line, offset) => whole[start + offset] === line),
  );

const quote = (line: string): string =>
  line.length > 60 ? `${line.slice(0, 60)}…` : line;

const checkRun = (
  block: CodeBlock,
  command: string,
  result: RunOutput,
): readonly string[] => {
  const head = `ブロック ${block.id}: \`${command}\``;
  if (result.timedOut) {
    return [`${head} が ${RUN_TIMEOUT_MS / 1000} 秒で終わらない`];
  }
  const expected = outputLines(block.props.text);
  if (expected.length === 0) return [`ブロック ${block.id}: 照合する行が無い`];
  const missing = firstMissingInOrder(expected, linesOf(result.output));
  if (missing === undefined) return [];
  const exit =
    result.exitCode !== 0 ? `。終了コードは ${result.exitCode ?? "不明"}` : "";
  return [
    `${head} の出力に「${quote(expected[missing] ?? "")}」が無い(照合する ${missing + 1} 行目。行の順も見る${exit})`,
  ];
};

const checkFile = (
  block: CodeBlock,
  path: string,
  content: string | undefined,
): readonly string[] => {
  if (content === undefined)
    return [`ブロック ${block.id}: ${path} を読めない`];
  const excerpt = trimBlank(linesOf(block.props.text));
  if (excerpt.length === 0) return [`ブロック ${block.id}: 照合する行が無い`];
  if (isExcerpt(excerpt, linesOf(content))) return [];
  return [
    `ブロック ${block.id}: ${path} の連続した行と一致しない(抜粋は手で直さず、ファイルから写し直す)`,
  ];
};

const codeBlocks = (doc: DocumentFile): readonly CodeBlock[] =>
  doc.sections.flatMap((section) =>
    section.blocks.filter((block): block is CodeBlock => block.type === "code"),
  );

const verifiedBlocks = (
  doc: DocumentFile,
): readonly { block: CodeBlock; verify: Verify }[] =>
  codeBlocks(doc).flatMap((block) =>
    block.props.verify ? [{ block, verify: block.props.verify }] : [],
  );

export const countVerified = (doc: DocumentFile): number =>
  verifiedBlocks(doc).length;

// 同じコマンドは1回だけ、書いた順に1つずつ走らせる(並べて走らせると、互いの出力やファイルを踏む)
const runAll = (
  commands: readonly string[],
  deps: VerifyDeps,
): Promise<ReadonlyMap<string, RunOutput>> =>
  commands.reduce<Promise<ReadonlyMap<string, RunOutput>>>(
    async (previous, command) => {
      const done = await previous;
      deps.onRun?.(command);
      const result = await deps.run(command, deps.cwd);
      return new Map([...done, [command, result]]);
    },
    Promise.resolve(new Map()),
  );

export const verifyDocumentCode = async (
  doc: DocumentFile,
  deps: VerifyDeps,
): Promise<VerifyResult> => {
  const targets = verifiedBlocks(doc);
  const commands = [
    ...new Set(
      targets.flatMap(({ verify }) => ("run" in verify ? [verify.run] : [])),
    ),
  ];
  const outputs = await runAll(commands, deps);
  const failures = await Promise.all(
    targets.map(async ({ block, verify }) => {
      if ("run" in verify) {
        const result = outputs.get(verify.run);
        return result ? checkRun(block, verify.run, result) : [];
      }
      return checkFile(
        block,
        verify.file,
        await deps.read(resolve(deps.cwd, verify.file)),
      );
    }),
  );
  return { checked: targets.length, failures: failures.flat() };
};

// 本物の実行。シェルで走らせ、標準出力とエラー出力を届いた順に1本にまとめる
export const runCommand = (command: string, cwd: string): Promise<RunOutput> =>
  new Promise((done) => {
    const chunks: string[] = [];
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ output: chunks.join(""), exitCode: null, timedOut: true });
    }, RUN_TIMEOUT_MS);
    const collect = (chunk: Buffer) => {
      chunks.push(chunk.toString("utf8"));
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ output: error.message, exitCode: null, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ output: chunks.join(""), exitCode: code, timedOut: false });
    });
  });

export const readText = (path: string): Promise<string | undefined> =>
  readFile(path, "utf8").catch(() => undefined);
