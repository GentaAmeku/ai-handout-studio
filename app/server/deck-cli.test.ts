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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateDeck } from "../src/schema/deck";
import { checkGeneratedDeck } from "./deck-check";
import {
  applySettingsUpdates,
  createDeckForAgent,
  deckUrl,
  formatOpen,
  formatSettings,
  formatTemplates,
  parseCli,
} from "./deck-cli";
import { copyDesignWithDefaultSelection } from "./test-fixtures.ts";
import { listDecks, listOutlines, migrateOutlineDecks } from "./workspace";

const fixedNow = new Date(2026, 8, 18, 9, 0, 0);
const context = { workspaceRoot: "", designDir: "" };

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-cli-"),
  );
  // design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
  context.designDir = await copyDesignWithDefaultSelection();
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
  await rm(context.designDir, { recursive: true, force: true });
});

const create = (outlineId?: string, templateId?: string) =>
  createDeckForAgent({
    workspaceRoot: context.workspaceRoot,
    designDir: context.designDir,
    title: "勉強会の資料",
    outlineId,
    templateId,
    now: fixedNow,
  });

describe("parseCli", () => {
  it("shot は URL か手元の HTML を PNG に撮る。大きさの既定は 1440x900", () => {
    expect(parseCli(["shot", "mock.html", "--out", "a.png"])).toEqual({
      success: true,
      command: {
        name: "shot",
        target: "mock.html",
        out: "a.png",
        width: 1440,
        height: 900,
        full: false,
        wait: 500,
      },
    });
    expect(
      parseCli([
        "shot",
        "http://127.0.0.1:5190/",
        "--out",
        "b.png",
        "--width",
        "960",
        "--height",
        "600",
        "--full",
        "--wait",
        "0",
      ]),
    ).toMatchObject({
      success: true,
      command: { width: 960, height: 600, full: true, wait: 0 },
    });
    expect(parseCli(["shot", "mock.html"])).toMatchObject({ success: false });
    expect(parseCli(["shot", "mock.html", "--out", "a.jpg"])).toMatchObject({
      success: false,
    });
    expect(
      parseCli(["shot", "javascript:alert(1)", "--out", "a.png"]),
    ).toMatchObject({ success: false });
    expect(
      parseCli(["shot", "mock.html", "--out", "a.png", "--width", "10"]),
    ).toMatchObject({ success: false });
  });

  it("new / check / open を読み分ける", () => {
    expect(
      parseCli([
        "new",
        "--title",
        "題名",
        "--outline",
        "kickoff",
        "--template",
        "linen",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "new",
        title: "題名",
        outlineId: "kickoff",
        templateId: "linen",
      },
    });
    expect(parseCli(["check", "deck.json"])).toEqual({
      success: true,
      command: { name: "check", path: "deck.json" },
    });
    // --minutes を付けたときだけ登壇の検査をする
    expect(parseCli(["check", "deck.json", "--minutes", "15"])).toEqual({
      success: true,
      command: { name: "check", path: "deck.json", minutes: 15 },
    });
    expect(parseCli(["open", "deck_20260918_001"])).toEqual({
      success: true,
      command: { name: "open", id: "deck_20260918_001" },
    });
    // 質問票と HTML 資料も同じ open で開く
    expect(parseCli(["open", "sheet_20260920_001"])).toEqual({
      success: true,
      command: { name: "open", id: "sheet_20260920_001" },
    });
    expect(parseCli(["open", "doc_20260920_001"])).toEqual({
      success: true,
      command: { name: "open", id: "doc_20260920_001" },
    });
    // restart も open と同じ引数を取る
    expect(parseCli(["restart", "sheet_20260920_001"])).toEqual({
      success: true,
      command: { name: "restart", id: "sheet_20260920_001" },
    });
    expect(parseCli(["restart"])).toEqual({
      success: true,
      command: { name: "restart" },
    });
    expect(parseCli(["restart", "a", "b"]).success).toBe(false);
    expect(parseCli(["open"])).toEqual({
      success: true,
      command: { name: "open" },
    });
    expect(parseCli([])).toEqual({ success: true, command: { name: "help" } });
    expect(parseCli(["design", "build"])).toEqual({
      success: true,
      command: { name: "design-build" },
    });
    // 区分を省くと3区分とも出す
    expect(parseCli(["templates"])).toEqual({
      success: true,
      command: { name: "templates" },
    });
    expect(parseCli(["templates", "--kind", "slide"])).toEqual({
      success: true,
      command: { name: "templates", kind: "slide" },
    });
    // share は質問票・HTML 資料・スライドのどの id でも受ける
    expect(parseCli(["share", "sheet_20260920_001"])).toEqual({
      success: true,
      command: { name: "share", id: "sheet_20260920_001" },
    });
    expect(parseCli(["share", "doc_20260920_001"])).toEqual({
      success: true,
      command: { name: "share", id: "doc_20260920_001" },
    });
    expect(parseCli(["share", "deck_20260920_001"])).toEqual({
      success: true,
      command: { name: "share", id: "deck_20260920_001" },
    });
    expect(
      parseCli([
        "share",
        "doc_20260920_001",
        "--url",
        "https://claude.ai/artifact/xxxx",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "share",
        id: "doc_20260920_001",
        url: "https://claude.ai/artifact/xxxx",
      },
    });
  });

  it("open・restart は --lan と --no-lan を1回だけ上書きに使える", () => {
    expect(parseCli(["open", "--lan"])).toEqual({
      success: true,
      command: { name: "open", lan: true },
    });
    expect(parseCli(["open", "--no-lan"])).toEqual({
      success: true,
      command: { name: "open", lan: false },
    });
    expect(parseCli(["restart", "sheet_20260920_001", "--no-lan"])).toEqual({
      success: true,
      command: { name: "restart", id: "sheet_20260920_001", lan: false },
    });
    // どちらも無ければキー自体を持たない(呼び出す側が設定の既定を読む)
    expect(parseCli(["open"])).toEqual({
      success: true,
      command: { name: "open" },
    });
    expect(parseCli(["open", "--lan", "--no-lan"]).success).toBe(false);
  });

  it("settings は --set を並べて受け、キーと値を検証する", () => {
    expect(parseCli(["settings"])).toEqual({
      success: true,
      command: { name: "settings", updates: [] },
    });
    expect(
      parseCli([
        "settings",
        "--set",
        "orgName=○○株式会社",
        "--set",
        "locale=en",
        "--set",
        "features.lan=true",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "settings",
        updates: [
          { key: "orgName", value: "○○株式会社" },
          { key: "locale", value: "en" },
          { key: "features.lan", value: true },
        ],
      },
    });
    expect(parseCli(["settings", "--set", "locale=fr"]).success).toBe(false);
    expect(parseCli(["settings", "--set", "features.lan=yes"]).success).toBe(
      false,
    );
    expect(parseCli(["settings", "--set", "unknown=1"]).success).toBe(false);
    expect(parseCli(["settings", "--set", "orgName"]).success).toBe(false);
    expect(parseCli(["settings", "extra"]).success).toBe(false);
  });

  it("settings は共通指示の可否(agentInstructions)を ask か declined で受ける", () => {
    expect(
      parseCli(["settings", "--set", "agentInstructions=declined"]),
    ).toEqual({
      success: true,
      command: {
        name: "settings",
        updates: [{ key: "agentInstructions", value: "declined" }],
      },
    });
    expect(
      parseCli(["settings", "--set", "agentInstructions=yes"]).success,
    ).toBe(false);
  });

  it("題名が無い・形の違う id・知らないコマンドは失敗にする", () => {
    expect(parseCli(["new"]).success).toBe(false);
    expect(parseCli(["design"]).success).toBe(false);
    expect(parseCli(["design", "build", "x"]).success).toBe(false);
    expect(parseCli(["new", "--title", "  "]).success).toBe(false);
    expect(parseCli(["new", "--title", "a", "--color", "red"]).success).toBe(
      false,
    );
    expect(parseCli(["check"]).success).toBe(false);
    // --minutes は正の数だけ通す
    expect(parseCli(["check", "deck.json", "--minutes", "0"]).success).toBe(
      false,
    );
    expect(parseCli(["check", "deck.json", "--minutes", "abc"]).success).toBe(
      false,
    );
    expect(parseCli(["open", "../etc"]).success).toBe(false);
    expect(parseCli(["build"]).success).toBe(false);
    expect(parseCli(["templates", "--kind", "poster"]).success).toBe(false);
    expect(parseCli(["templates", "extra"]).success).toBe(false);
    expect(parseCli(["share"]).success).toBe(false);
    expect(parseCli(["share", "../etc"]).success).toBe(false);
    expect(parseCli(["share", "doc_20260920_001", "extra"]).success).toBe(
      false,
    );
    // --url は https://claude.ai/ で始まる URL だけ受ける
    expect(
      parseCli(["share", "doc_20260920_001", "--url", "https://evil.example/"])
        .success,
    ).toBe(false);
    // 似た名前の別の場所・空白や改行の入った URL も受けない
    expect(
      parseCli([
        "share",
        "doc_20260920_001",
        "--url",
        "https://claude.ai.evil.example/x",
      ]).success,
    ).toBe(false);
    expect(
      parseCli([
        "share",
        "doc_20260920_001",
        "--url",
        "https://claude.ai/artifact/abc x",
      ]).success,
    ).toBe(false);
    expect(
      parseCli([
        "share",
        "doc_20260920_001",
        "--url",
        "https://claude.ai/artifact/abc\nrm",
      ]).success,
    ).toBe(false);
  });
});

describe("createDeckForAgent", () => {
  it("番号を振って場所だけ確保する。deck.json を書くまで一覧には出ない", async () => {
    const result = await create();
    expect(result).toMatchObject({
      success: true,
      deckId: "deck_20260918_001",
      templated: false,
      createdAt: fixedNow.toISOString(),
    });
    if (!result.success) return;
    expect(result.deckPath).toBe(join(result.dir, "deck.json"));
    expect((await readdir(result.dir)).sort()).toEqual([
      "assets",
      "exports",
      "versions",
    ]);
    expect(await listDecks(context.workspaceRoot)).toEqual([]);

    expect(await create()).toMatchObject({ deckId: "deck_20260918_002" });
  });

  it("構成なしでも、指定のテンプレートに同梱の絵を assets/ へ写す", async () => {
    const result = await create(undefined, "lumen");
    if (!result.success) throw new Error(result.message);
    expect((await readdir(join(result.dir, "assets"))).sort()).toEqual([
      "hero.svg",
      "idea.svg",
      "path.svg",
    ]);
  });

  it("構成なしで同梱の絵を持たないテンプレートなら assets/ は空のまま", async () => {
    const result = await create();
    if (!result.success) throw new Error(result.message);
    expect(await readdir(join(result.dir, "assets"))).toEqual([]);
  });

  it("構成の指定なら deck.json の骨組みも置く。見た目は既定のテンプレート", async () => {
    const result = await create("study-session");
    expect(result).toMatchObject({
      success: true,
      templated: true,
      template: "default",
    });
    if (!result.success) return;
    const deck = validateDeck(
      JSON.parse(await readFile(result.deckPath, "utf8")),
    );
    expect(deck).toMatchObject({
      id: result.deckId,
      title: "勉強会の資料",
      template: "default",
    });
    expect(await listDecks(context.workspaceRoot)).toMatchObject([
      { state: "ready", deckId: result.deckId },
    ]);
  });

  it("構成「登壇」の骨組みは10枚で、check を通る", async () => {
    const result = await create("talk");
    expect(result).toMatchObject({ success: true, templated: true });
    if (!result.success) return;
    const check = checkGeneratedDeck(
      JSON.parse(await readFile(result.deckPath, "utf8")),
      result.deckId,
    );
    expect(check.ok).toBe(true);
    expect(check.ok && check.deck.slides.map((slide) => slide.layout)).toEqual([
      "cover",
      "content",
      "content",
      "section",
      "content",
      "content",
      "section",
      "content",
      "content",
      "closing",
    ]);
  });

  it("テンプレートも指定できる。構成が無い・テンプレートが無いときは、場所を取らずに失敗する", async () => {
    const styled = await create("kickoff", "linen");
    expect(styled).toMatchObject({ success: true, template: "linen" });
    if (!styled.success) return;
    expect(JSON.parse(await readFile(styled.deckPath, "utf8"))).toMatchObject({
      template: "linen",
    });
    await rm(styled.dir, { recursive: true });
    expect((await create("default")).success).toBe(false);
    expect((await create("kickoff", "missing")).success).toBe(false);
    expect((await create(undefined, "missing")).success).toBe(false);
    const result = await create("missing");
    expect(result.success).toBe(false);
    expect(!result.success && result.message).toContain("study-session");
    expect(await listDecks(context.workspaceRoot)).toEqual([]);
  });
});

// CLI の new --outline が選べる中身の構成の一覧(旧 GET /api/outlines。119 でアプリの口は外した)
describe("listOutlines", () => {
  it("テンプレートを枚数と表紙つきで返す", async () => {
    const outlines = await listOutlines(context.designDir);
    expect(outlines).toContainEqual(
      expect.objectContaining({ outlineId: "proposal", slideCount: 13 }),
    );
    expect(outlines).toContainEqual(
      expect.objectContaining({
        outlineId: "talk",
        title: "登壇",
        slideCount: 10,
      }),
    );
  });

  // 見た目の名前が構成として並ぶと紛らわしい。見た目の見本は一覧のカードと編集画面が見せる
  it("テンプレート(template.json)を持つフォルダは構成に出さない", async () => {
    const outlines = await listOutlines(context.designDir);
    expect(outlines.map((outline) => outline.outlineId)).not.toContain(
      "crayon",
    );
  });
});

describe("migrateOutlineDecks", () => {
  it("構成の名前を template に持つ資料だけを既定のテンプレートへ直し、何度回しても同じにする", async () => {
    const write = async (deckId: string, deck: object) => {
      const dir = join(context.workspaceRoot, "decks", deckId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "deck.json"), JSON.stringify(deck), "utf8");
    };
    await write("deck_20260918_001", { id: "a", template: "kickoff" });
    await write("deck_20260918_002", { id: "b", theme: "proposal" });
    await write("deck_20260918_003", { id: "c", template: "linen" });
    const designDir = context.designDir;
    expect(await migrateOutlineDecks(context.workspaceRoot, designDir)).toEqual(
      ["deck_20260918_001", "deck_20260918_002"],
    );
    const read = async (deckId: string) =>
      JSON.parse(
        await readFile(
          join(context.workspaceRoot, "decks", deckId, "deck.json"),
          "utf8",
        ),
      );
    expect(await read("deck_20260918_001")).toEqual({
      id: "a",
      template: "default",
    });
    expect(await read("deck_20260918_002")).toEqual({
      id: "b",
      template: "default",
    });
    expect(await read("deck_20260918_003")).toEqual({
      id: "c",
      template: "linen",
    });
    expect(await migrateOutlineDecks(context.workspaceRoot, designDir)).toEqual(
      [],
    );
  });
});

describe("deckUrl", () => {
  it("id があれば資料の画面、無ければ一覧を指す", () => {
    expect(deckUrl("http://127.0.0.1:5190", "deck_20260918_001")).toBe(
      "http://127.0.0.1:5190/decks/deck_20260918_001",
    );
    expect(deckUrl("http://127.0.0.1:5190")).toBe("http://127.0.0.1:5190/");
  });

  it("open の出力は URL と、資料か資料フォルダの場所", () => {
    expect(
      formatOpen("/ws", "http://127.0.0.1:5190", "deck_20260918_001"),
    ).toBe(
      "url: http://127.0.0.1:5190/decks/deck_20260918_001\npath: /ws/decks/deck_20260918_001/deck.json",
    );
    expect(formatOpen("/ws", "http://127.0.0.1:5190")).toBe(
      "url: http://127.0.0.1:5190/\ndecks: /ws/decks",
    );
  });
});

describe("formatTemplates", () => {
  const origin = "http://127.0.0.1:5190";

  it("区分を指定すると、識別子の順に既定の印と説明を並べる", async () => {
    const result = await formatTemplates(context.designDir, origin, "slide");
    if (!result.success) throw new Error(result.message);
    const lines = result.text.split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "kind: slide",
      "default: default",
      `url: ${origin}/slides/templates`,
    ]);
    // 見た目のテンプレートの一覧の画面と同じ並び(識別子の順)。default が既定
    expect(lines.slice(3)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("- default: Default(既定)"),
        expect.stringContaining("- lumen: Lumen —"),
      ]),
    );
    // 説明を持たないテンプレートは — を付けない
    expect(lines).toContain("- default: Default(既定)");
    // 既定でないテンプレートには(既定)を付けない
    expect(lines.some((line) => line.startsWith("- lumen: Lumen(既定)"))).toBe(
      false,
    );
  });

  it("区分を省くと3区分とも、空行で区切って出す", async () => {
    const result = await formatTemplates(context.designDir, origin);
    if (!result.success) throw new Error(result.message);
    const blocks = result.text.split("\n\n");
    expect(blocks.map((block) => block.split("\n")[0])).toEqual([
      "kind: slide",
      "kind: sheet",
      "kind: document",
    ]);
  });

  it("既定のテンプレートが替われば、その名前に(既定)を付ける", async () => {
    await writeFile(
      join(context.designDir, "selection.json"),
      JSON.stringify({
        slide: "cobalt",
        sheet: "default",
        document: "default",
      }),
    );
    const result = await formatTemplates(context.designDir, origin, "slide");
    if (!result.success) throw new Error(result.message);
    expect(result.text).toContain("default: cobalt");
    expect(result.text).toContain("(既定)");
    expect(
      result.text.split("\n").find((line) => line.startsWith("- cobalt:")),
    ).toContain("(既定)");
    expect(
      result.text.split("\n").find((line) => line.startsWith("- default:")),
    ).not.toContain("(既定)");
  });
});

describe("formatSettings / applySettingsUpdates", () => {
  it("既定値で埋めた設定を1行ずつ出す", () => {
    const settings = {
      orgName: "",
      locale: "ja" as const,
      features: { lan: false, imageGeneration: false, share: false },
      agentInstructions: "ask" as const,
    };
    expect(formatSettings(settings)).toBe(
      [
        "orgName: ",
        "locale: ja",
        "features.lan: false",
        "features.imageGeneration: false",
        "features.share: false",
        "agentInstructions: ask",
      ].join("\n"),
    );
  });

  it("--set の更新を profile.json の値に順に重ね、触っていない項目は残す", () => {
    const next = applySettingsUpdates(
      { orgName: "", locale: "ja", features: { share: true } },
      [
        { key: "orgName", value: "○○株式会社" },
        { key: "features.lan", value: true },
      ],
    );
    expect(next).toEqual({
      orgName: "○○株式会社",
      locale: "ja",
      features: { share: true, lan: true },
    });
  });

  it("決めていない項目は既定値で埋めずに書く(doctor が残りを見分ける)", () => {
    expect(
      applySettingsUpdates(undefined, [{ key: "locale", value: "en" }]),
    ).toEqual({ orgName: "", locale: "en" });
    expect(
      applySettingsUpdates(undefined, [
        { key: "agentInstructions", value: "declined" },
      ]),
    ).toEqual({ orgName: "", agentInstructions: "declined" });
  });
});
