import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFile } from "../../scripts/check-file";
import { proposalDeck } from "./test-fixtures.ts";

// console.log と console.error に出た行を順に集める
const captureOutput = async (run: () => Promise<number>) => {
  const lines: string[] = [];
  const log = vi
    .spyOn(console, "log")
    .mockImplementation((line) => lines.push(String(line)));
  const error = vi
    .spyOn(console, "error")
    .mockImplementation((line) => lines.push(String(line)));
  const code = await run();
  log.mockRestore();
  error.mockRestore();
  return { code, lines };
};

describe("checkFile の --minutes", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  const writeDeck = async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-file-"));
    dirs.push(dir);
    const path = join(dir, "deck.json");
    await writeFile(path, JSON.stringify(proposalDeck()));
    return path;
  };

  it("付けないときは合格の行と今までの警告だけを出し、尺の行を出さない", async () => {
    const path = await writeDeck();
    const { code, lines } = await captureOutput(() => checkFile(path));
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/^合格: /);
    expect(lines.some((line) => line.startsWith("尺: "))).toBe(false);
  });

  it("付けたときは、付けないときの出力のあとに尺の行と登壇の警告を足す(exit code は同じ)", async () => {
    const path = await writeDeck();
    const plain = await captureOutput(() => checkFile(path));
    const talk = await captureOutput(() => checkFile(path, 15));
    expect(talk.code).toBe(plain.code);
    expect(talk.lines.slice(0, plain.lines.length)).toEqual(plain.lines);
    expect(talk.lines[plain.lines.length]).toMatch(
      /^尺: 約[\d.]+分 \/ 持ち時間 15分/,
    );
  });
});

describe("checkFile の質問 JSON", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("label に (推奨) を書いた質問 JSON は、合格にして警告を出す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "check-file-"));
    dirs.push(dir);
    const path = join(dir, "questions.json");
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        id: "demo",
        revision: "1",
        title: "推奨の出し方",
        questions: [
          {
            id: "aura",
            title: "オーラの出し方",
            type: "single",
            options: [
              { id: "keep", label: "瞳は変えない(推奨)" },
              { id: "change", label: "瞳も光らせる" },
            ],
            recommended: ["keep"],
          },
        ],
      }),
    );
    const { code, lines } = await captureOutput(() => checkFile(path));
    expect(code).toBe(0);
    expect(lines).toEqual([
      `合格: ${path}(1問の質問票)`,
      "警告: 質問 aura: 選択肢 keep の label に (推奨) がある。推奨は recommended で示す。label に (推奨) を書かない",
    ]);
  });
});

describe("checkFile の --run(code ブロックの照合)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  const AT = "2026-10-04T00:00:00.000Z";

  // file は絶対パスにしておく(照合は check を呼んだフォルダから見るので、試験の cwd に依らない)
  const writeDocument = async (codeText: string) => {
    const dir = await mkdtemp(join(tmpdir(), "check-file-"));
    dirs.push(dir);
    const source = join(dir, "source.txt");
    await writeFile(source, "first\nsecond\n");
    const path = join(dir, "document.json");
    await writeFile(
      path,
      JSON.stringify({
        id: "doc_20261004_001",
        title: "題",
        status: "draft",
        meta: { createdAt: AT, updatedAt: AT },
        head: { title: "題" },
        toc: "auto",
        sections: [
          {
            id: "s01",
            heading: "見出し",
            blocks: [
              {
                id: "b01",
                type: "code",
                props: { text: codeText, verify: { file: source } },
              },
            ],
          },
        ],
      }),
    );
    return path;
  };

  it("付けないときは照合せず、verify があることを警告で知らせる", async () => {
    const path = await writeDocument("合わない行");
    const { code, lines } = await captureOutput(() => checkFile(path));
    expect(code).toBe(0);
    expect(lines).toEqual([
      `合格: ${path}(1節の資料)`,
      "警告: verify を持つ code ブロックが 1 個ある。実物と照合するには check --run を付ける",
    ]);
  });

  it("付けると照合し、合えば照合の行を出して合格にする", async () => {
    const path = await writeDocument("first\nsecond");
    const { code, lines } = await captureOutput(() =>
      checkFile(path, undefined, true),
    );
    expect(code).toBe(0);
    expect(lines).toEqual([
      "照合: 1 個の code ブロックが出どころと一致",
      `合格: ${path}(1節の資料)`,
    ]);
  });

  it("合わなければ、どのブロックが合わないかを出して不合格にする", async () => {
    const path = await writeDocument("合わない行");
    const { code, lines } = await captureOutput(() =>
      checkFile(path, undefined, true),
    );
    expect(code).toBe(1);
    expect(lines[0]).toContain("不合格: 本文が出どころと合わない");
    expect(lines[0]).toContain("ブロック b01");
  });
});
