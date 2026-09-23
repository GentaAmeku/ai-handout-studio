// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFile } from "../../scripts/check-file";
import { parseCli } from "./deck-cli.ts";
import {
  EXAMPLES_MARK,
  installExamples,
  installExamplesIfEmpty,
  markExamplesIfAbsent,
} from "./examples.ts";

// 同梱資料。examples/ の正本を、一時の workspace へ入れて確かめる

const repoRoot = process.cwd();
const now = new Date("2026-10-01T09:00:00.000Z");

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const workspace = async (locale?: "ja" | "en"): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "examples-"));
  dirs.push(dir);
  if (locale) {
    await writeFile(
      join(dir, "profile.json"),
      JSON.stringify({ orgName: "", locale }),
    );
  }
  return dir;
};

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

// console に出た行を黙らせて、終了コードだけを返す
const quietCheck = async (path: string): Promise<number> => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const code = await checkFile(path);
  log.mockRestore();
  error.mockRestore();
  return code;
};

describe("installExamplesIfEmpty", () => {
  it("空の workspace には、設定の言語のスライドと HTML 資料を新しい id で入れ、印を残す", async () => {
    const root = await workspace("ja");
    const result = await installExamplesIfEmpty({
      workspaceRoot: root,
      repoRoot,
      now,
    });
    expect(result).toMatchObject({ success: true, lang: "ja" });
    const installed = "installed" in result ? result.installed : [];
    expect(installed.map((example) => example.id)).toEqual([
      "deck_20261001_001",
      "doc_20261001_001",
    ]);

    const deck = await readJson(installed[0]?.path ?? "");
    expect(deck).toMatchObject({
      id: "deck_20261001_001",
      title: "AI Handout Studio の使い方",
      meta: { createdAt: now.toISOString(), updatedAt: now.toISOString() },
    });
    const deckAssets = await readdir(
      join(root, "decks", "deck_20261001_001", "assets"),
    );
    expect(deckAssets).toEqual(
      expect.arrayContaining(["hero.svg", "intake.jpg", "list.jpg"]),
    );

    const doc = await readJson(installed[1]?.path ?? "");
    expect(doc).toMatchObject({
      id: "doc_20261001_001",
      title: "セットアップと使い方",
      lang: "ja",
      meta: { createdAt: now.toISOString(), updatedAt: now.toISOString() },
    });
    expect(
      await readdir(join(root, "documents", "doc_20261001_001", "assets")),
    ).not.toHaveLength(0);

    expect(await readJson(join(root, EXAMPLES_MARK))).toEqual({
      installedAt: now.toISOString(),
      lang: "ja",
      ids: ["deck_20261001_001", "doc_20261001_001"],
    });
  });

  it("locale が en なら英語の2件を入れる", async () => {
    const root = await workspace("en");
    const result = await installExamplesIfEmpty({
      workspaceRoot: root,
      repoRoot,
      now,
    });
    expect(result).toMatchObject({ success: true, lang: "en" });
    const installed = "installed" in result ? result.installed : [];
    expect(await readJson(installed[0]?.path ?? "")).toMatchObject({
      title: "How to use AI Handout Studio",
    });
    expect(await readJson(installed[1]?.path ?? "")).toMatchObject({
      title: "Setup and usage",
      lang: "en",
    });
  });

  it("印があれば、資料が1件も無くても入れない(利用者が消したあと)", async () => {
    const root = await workspace("ja");
    await writeFile(join(root, EXAMPLES_MARK), "{}");
    const result = await installExamplesIfEmpty({
      workspaceRoot: root,
      repoRoot,
      now,
    });
    expect(result).toEqual({ success: true, skipped: "marked" });
    expect(await readdir(root)).toEqual(
      expect.not.arrayContaining(["decks", "documents"]),
    );
  });

  it.each([
    ["decks", "deck_20260901_001"],
    ["documents", "doc_20260901_001"],
  ])("%s に資料があれば入れず、印も残さない", async (dir, id) => {
    const root = await workspace("ja");
    await mkdir(join(root, dir, id), { recursive: true });
    const result = await installExamplesIfEmpty({
      workspaceRoot: root,
      repoRoot,
      now,
    });
    expect(result).toEqual({ success: true, skipped: "has-handouts" });
    expect(await readdir(root)).not.toContain(EXAMPLES_MARK);
  });

  it("質問票だけがあるときは入れる(セットアップの途中で質問票を保存したあとに初めて起きたとき)", async () => {
    const root = await workspace("ja");
    await mkdir(join(root, "sheets", "sheet_20260901_001"), {
      recursive: true,
    });
    const result = await installExamplesIfEmpty({
      workspaceRoot: root,
      repoRoot,
      now,
    });
    expect(result.success && "installed" in result).toBe(true);
    expect(await readdir(root)).toContain(EXAMPLES_MARK);
  });
});

describe("installExamples(ai-handout-studio examples)", () => {
  it("印があっても、入れたあとでも、新しい id で足す", async () => {
    const root = await workspace("ja");
    await installExamplesIfEmpty({ workspaceRoot: root, repoRoot, now });
    const again = await installExamples({
      workspaceRoot: root,
      repoRoot,
      lang: "en",
      now,
    });
    expect(again).toMatchObject({ success: true, lang: "en" });
    expect(
      again.success ? again.installed.map((example) => example.id) : [],
    ).toEqual(["deck_20261001_002", "doc_20261001_002"]);
    expect(await readJson(join(root, EXAMPLES_MARK))).toMatchObject({
      ids: ["deck_20261001_001", "doc_20261001_001"],
    });
  });

  it.each(["ja", "en"] as const)(
    "写した %s の資料は check に通る",
    async (lang) => {
      const root = await workspace();
      const result = await installExamples({
        workspaceRoot: root,
        repoRoot,
        lang,
        now,
      });
      const paths = result.success
        ? result.installed.map((example) => example.path)
        : [];
      expect(paths).toHaveLength(2);
      const codes = await Promise.all(paths.map(quietCheck));
      expect(codes).toEqual([0, 0]);
    },
  );

  it.each(["ja", "en"] as const)(
    "examples/%s の正本も check に通り、PDF がある",
    async (lang) => {
      const base = join(repoRoot, "examples", lang);
      const codes = await Promise.all(
        [
          join(base, "usage", "deck.json"),
          join(base, "setup", "document.json"),
        ].map(quietCheck),
      );
      expect(codes).toEqual([0, 0]);
      expect(await readdir(base)).toContain("usage.pdf");
    },
  );
});

describe("markExamplesIfAbsent(examples コマンドのあと)", () => {
  it("印が無ければ残し、あれば初めの記録を変えない", async () => {
    const root = await workspace("ja");
    const installed = [{ id: "deck_20261001_001", path: "deck.json" }];
    await markExamplesIfAbsent(root, { lang: "ja", installed }, now);
    const first = await readJson(join(root, EXAMPLES_MARK));
    expect(first).toMatchObject({ lang: "ja", ids: ["deck_20261001_001"] });
    await markExamplesIfAbsent(
      root,
      { lang: "en", installed: [{ id: "deck_20261001_002", path: "x" }] },
      now,
    );
    expect(await readJson(join(root, EXAMPLES_MARK))).toEqual(first);
  });
});

describe("parseCli の examples", () => {
  it("--lang を省くと設定に従い、ja か en だけを受ける", () => {
    expect(parseCli(["examples"])).toEqual({
      success: true,
      command: { name: "examples" },
    });
    expect(parseCli(["examples", "--lang", "en"])).toEqual({
      success: true,
      command: { name: "examples", lang: "en" },
    });
    expect(parseCli(["examples", "--lang", "fr"])).toMatchObject({
      success: false,
    });
    expect(parseCli(["examples", "extra"])).toMatchObject({ success: false });
  });
});
