// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentBlock, DocumentFile } from "../src/schema/document";
import { documentFileSchema } from "../src/schema/document";
import {
  countVerified,
  firstMissingInOrder,
  isExcerpt,
  type RunOutput,
  readText,
  runCommand,
  type VerifyDeps,
  verifyDocumentCode,
} from "./document-verify";

const AT = "2026-10-04T00:00:00.000Z";

const doc = (blocks: DocumentBlock[]): DocumentFile => ({
  id: "doc_test",
  title: "題",
  status: "draft",
  meta: { createdAt: AT, updatedAt: AT },
  head: { title: "題" },
  toc: "auto",
  sections: [{ id: "s01", heading: "見出し", blocks }],
});

const code = (
  id: string,
  text: string,
  verify?: { run: string } | { file: string },
): DocumentBlock => ({
  id,
  type: "code",
  props: { text, ...(verify ? { verify } : {}) },
});

const ok = (output: string): RunOutput => ({
  output,
  exitCode: 0,
  timedOut: false,
});

// 走らせたコマンドを記録し、決めた出力を返す
const fakeDeps = (
  outputs: Record<string, RunOutput>,
  files: Record<string, string> = {},
) => {
  const ran: string[] = [];
  const deps: VerifyDeps = {
    cwd: "/repo",
    run: async (command) => {
      ran.push(command);
      return outputs[command] ?? ok("");
    },
    read: async (path) => files[path],
  };
  return { deps, ran };
};

describe("firstMissingInOrder と isExcerpt", () => {
  it("期待する行が同じ順に出れば、途中の行を省いても通る", () => {
    expect(firstMissingInOrder(["a", "c"], ["a", "b", "c"])).toBeUndefined();
    // 順が逆なら、後の行が見つからない
    expect(firstMissingInOrder(["c", "a"], ["a", "b", "c"])).toBe(1);
    expect(firstMissingInOrder(["x"], ["a"])).toBe(0);
  });

  it("抜粋は連続した行でないと通らない", () => {
    expect(isExcerpt(["b", "c"], ["a", "b", "c", "d"])).toBe(true);
    expect(isExcerpt(["a", "c"], ["a", "b", "c"])).toBe(false);
    expect(isExcerpt([], ["a"])).toBe(false);
  });
});

describe("verifyDocumentCode", () => {
  it("run は出力と照合し、コマンドの行・省略の印・色の制御文字・行頭の空白は見ない", async () => {
    const block = code("b01", "$ pnpm test\n  ✓ 12 passed\n…\nDone", {
      run: "pnpm test",
    });
    const { deps, ran } = fakeDeps({
      "pnpm test": ok("\u001b[32m✓ 12 passed\u001b[0m\nDuration 1.2s\nDone\n"),
    });
    expect(await verifyDocumentCode(doc([block]), deps)).toEqual({
      checked: 1,
      failures: [],
    });
    expect(ran).toEqual(["pnpm test"]);
  });

  it("出力に無い行があれば、ブロック・コマンド・行を名指しして落とす", async () => {
    const block = code("b02", "✓ 13 passed", { run: "pnpm test" });
    const { deps } = fakeDeps({
      "pnpm test": { output: "✓ 12 passed", exitCode: 1, timedOut: false },
    });
    const result = await verifyDocumentCode(doc([block]), deps);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("ブロック b02");
    expect(result.failures[0]).toContain("`pnpm test`");
    expect(result.failures[0]).toContain("✓ 13 passed");
    expect(result.failures[0]).toContain("終了コードは 1");
  });

  it("同じコマンドは1回だけ走らせる。verify の無いブロックは見ない", async () => {
    const { deps, ran } = fakeDeps({ "git log": ok("a\nb") });
    const result = await verifyDocumentCode(
      doc([
        code("b01", "a", { run: "git log" }),
        code("b02", "b", { run: "git log" }),
        code("b03", "照合しない"),
      ]),
      deps,
    );
    expect(result).toEqual({ checked: 2, failures: [] });
    expect(ran).toEqual(["git log"]);
  });

  it("終わらないコマンドは時間切れとして落とす", async () => {
    const { deps } = fakeDeps({
      sleep: { output: "", exitCode: null, timedOut: true },
    });
    const result = await verifyDocumentCode(
      doc([code("b01", "x", { run: "sleep" })]),
      deps,
    );
    expect(result.failures[0]).toContain("秒で終わらない");
  });

  it("file は cwd から読み、連続した行と照合する。読めなければ落とす", async () => {
    const files = {
      "/repo/src/a.ts": "const a = 1;\n  const b = 2;\nexport { a, b };\n",
    };
    const { deps } = fakeDeps({}, files);
    const passed = await verifyDocumentCode(
      doc([code("b01", "const a = 1;\nconst b = 2;\n", { file: "src/a.ts" })]),
      deps,
    );
    expect(passed.failures).toEqual([]);
    const gap = await verifyDocumentCode(
      doc([
        code("b01", "const a = 1;\nexport { a, b };", { file: "src/a.ts" }),
      ]),
      deps,
    );
    expect(gap.failures[0]).toContain("連続した行と一致しない");
    const missing = await verifyDocumentCode(
      doc([code("b01", "x", { file: "src/none.ts" })]),
      deps,
    );
    expect(missing.failures[0]).toContain("src/none.ts を読めない");
  });

  it("countVerified は verify を持つ code ブロックを数える", () => {
    expect(
      countVerified(doc([code("b01", "a", { run: "x" }), code("b02", "b")])),
    ).toBe(1);
  });
});

describe("verify のスキーマ", () => {
  it("run か file のどちらか1つだけを受ける", () => {
    const parse = (verify: unknown) =>
      documentFileSchema.safeParse({
        ...doc([]),
        sections: [
          {
            id: "s01",
            heading: "見出し",
            blocks: [{ id: "b01", type: "code", props: { text: "a", verify } }],
          },
        ],
      }).success;
    expect(parse({ run: "pnpm test" })).toBe(true);
    expect(parse({ file: "a.ts" })).toBe(true);
    expect(parse({ run: "" })).toBe(false);
    expect(parse({ run: "a", file: "b" })).toBe(false);
    expect(parse({ url: "https://example.com" })).toBe(false);
  });
});

describe("runCommand と readText(本物)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("標準出力とエラー出力を1本にまとめ、終了コードを返す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-"));
    dirs.push(dir);
    const result = await runCommand("echo out; echo err 1>&2; exit 3", dir);
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
  });

  it("cwd で走らせ、ファイルが無ければ readText は undefined", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-"));
    dirs.push(dir);
    await writeFile(join(dir, "a.txt"), "hello\n");
    expect((await runCommand("cat a.txt", dir)).output).toBe("hello\n");
    expect(await readText(join(dir, "a.txt"))).toBe("hello\n");
    expect(await readText(join(dir, "none.txt"))).toBeUndefined();
  });
});
