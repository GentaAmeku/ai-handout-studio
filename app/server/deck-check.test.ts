import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGeneratedDeck,
  deckIdFromPath,
  findMissingAssets,
  talkCheck,
} from "./deck-check";
import { proposalDeck } from "./test-fixtures.ts";

const template = proposalDeck();

const withBlocks = (blocks: unknown[]) => ({
  ...template,
  slides: [{ id: "s01", layout: "content", blocks }],
});

const block = (
  type: string,
  props: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  id: "b01",
  type,
  x: 64,
  y: 64,
  w: 400,
  h: 200,
  props,
  ...overrides,
});

// talkCheck 用。checkGeneratedDeck を通して型の合う Deck を作る
const talkDeck = (slides: unknown[]) => {
  const report = checkGeneratedDeck({ ...template, slides });
  if (!report.ok) throw new Error(report.errors);
  return report.deck;
};

// ブロック id はデッキ全体で重複できないので、スライド id から作る
const heading = (text: string, blockId: string) =>
  block("heading", { text, level: 1 }, { id: blockId });

const contentSlide = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  layout: "content",
  blocks: [
    heading("見出し", `${id}-heading`),
    block("text", { text: "本文" }, { id: `${id}-body` }),
  ],
  ...overrides,
});

describe("checkGeneratedDeck", () => {
  it("テンプレートを合格にし、[[要確認]] の残りを警告する", () => {
    const report = checkGeneratedDeck(template);
    expect(report.ok).toBe(true);
    expect(report.ok && report.warnings).toEqual([
      expect.stringMatching(/\[\[要確認\]\] が \d+ か所に残っている/),
    ]);
  });

  it("カタログ外の type と、使えないアイコン名を不合格にする", () => {
    expect(
      checkGeneratedDeck(withBlocks([block("timeline", { items: [] })])).ok,
    ).toBe(false);
    const report = checkGeneratedDeck(
      withBlocks([
        block("card-grid", {
          columns: 2,
          items: [{ title: "a", body: "b", icon: "rainbow" }],
        }),
      ]),
    );
    expect(report.ok ? "" : report.errors).toMatch(/icon/);
  });

  it("フォルダ名と違う id、スライド0枚、空の title を不合格にする", () => {
    const deck = { ...template, id: "deck_20260916_001" };
    expect(checkGeneratedDeck(deck, "deck_20260916_002")).toEqual({
      ok: false,
      errors: expect.stringContaining("deck_20260916_002"),
    });
    expect(checkGeneratedDeck({ ...template, slides: [] }).ok).toBe(false);
    expect(checkGeneratedDeck({ ...template, title: " " }).ok).toBe(false);
  });

  it("箇条書きが7項目を超えたら警告する", () => {
    const items = Array.from({ length: 8 }, (_, index) => `項目${index + 1}`);
    const report = checkGeneratedDeck(
      withBlocks([block("bullets", { items })]),
    );
    expect(report.ok && report.warnings).toEqual([
      "s01 / b01: 箇条書きが8項目ある(7項目以下にする)",
    ]);
  });
});

describe("talkCheck", () => {
  it("ノートの無いスライドは本文30秒・表紙中扉締めは8秒で見積もる", () => {
    const deck = talkDeck([
      contentSlide("s01"),
      contentSlide("s02"),
      {
        id: "s03",
        layout: "section",
        blocks: [heading("問い?", "s03-heading")],
      },
    ]);
    const { estimateLine } = talkCheck(deck, 15);
    // (30+30+8)秒 = 1.133...分
    expect(estimateLine).toBe(
      "尺: 約1.1分 / 持ち時間 15分(本文 2枚・表紙と中扉と締め 1枚・ノート 0字)",
    );
  });

  it("ノートがあるスライドは、ノートの字数(空白・改行を除く)÷300×60秒で見積もる", () => {
    const notes = `${"あ".repeat(150)} \n${"い".repeat(150)}`; // 300字 + 空白と改行
    const deck = talkDeck([contentSlide("s01", { notes })]);
    const { estimateLine } = talkCheck(deck, 15);
    // 300字 ÷ 300 × 60秒 = 60秒 = 1.0分
    expect(estimateLine).toBe(
      "尺: 約1.0分 / 持ち時間 15分(本文 1枚・表紙と中扉と締め 0枚・ノート 300字)",
    );
  });

  it("見積りが持ち時間の9割を超えたら警告する", () => {
    const deck = talkDeck([contentSlide("s01"), contentSlide("s02")]);
    // 60秒 = 1分。持ち時間1分の9割(0.9分)を超える
    const { warnings } = talkCheck(deck, 1);
    expect(
      warnings.some((warning) =>
        warning.includes("尺の見積りが持ち時間の90%を超えている"),
      ),
    ).toBe(true);
  });

  it("見積りが9割以内なら警告しない", () => {
    const deck = talkDeck([contentSlide("s01")]);
    expect(
      talkCheck(deck, 15).warnings.some((warning) =>
        warning.includes("尺の見積りが持ち時間"),
      ),
    ).toBe(false);
  });

  it("見出し・フッター・ノートを除いた本文が120字を超えたら警告する", () => {
    const deck = talkDeck([
      {
        id: "s01",
        layout: "content",
        notes: "台本",
        blocks: [
          heading("見出し", "s01-heading"),
          block("text", { text: "あ".repeat(121) }, { id: "body" }),
          block("footer", { showPage: true }, { id: "footer" }),
        ],
      },
    ]);
    expect(talkCheck(deck, 15).warnings).toEqual([
      expect.stringContaining("s01: 本文が多い"),
    ]);
  });

  it("箇条書きが5項目以上でも本文が多いを警告する(字数は超えなくても)", () => {
    const items = Array.from({ length: 5 }, (_, index) => `項目${index}`);
    const deck = talkDeck([
      {
        id: "s01",
        layout: "content",
        notes: "台本",
        blocks: [
          heading("見出し", "s01-heading"),
          block("bullets", { items }, { id: "b" }),
        ],
      },
    ]);
    expect(talkCheck(deck, 15).warnings).toEqual([
      expect.stringContaining("s01: 本文が多い"),
    ]);
  });

  it("1枚に image が2つ以上あると警告する", () => {
    const deck = talkDeck([
      {
        id: "s01",
        layout: "content",
        notes: "台本",
        blocks: [
          heading("見出し", "s01-heading"),
          block("image", { src: "assets/a.png" }, { id: "img1" }),
          block("image", { src: "assets/b.png" }, { id: "img2" }),
        ],
      },
    ]);
    expect(talkCheck(deck, 15).warnings).toEqual(["s01: 画像が2つ以上ある"]);
  });

  it("全角の「！」「？」を混ぜた見出しは単調としない", () => {
    const slides = Array.from({ length: 10 }, (_, index) =>
      contentSlide(`s${index}`, {
        blocks: [
          heading(
            index === 3 ? "何を用意するの？" : `見出し${index}`,
            `s${index}-heading`,
          ),
          block("text", { text: "本文" }, { id: `s${index}-body` }),
        ],
      }),
    );
    expect(
      talkCheck(talkDeck(slides), 60).warnings.some((warning) =>
        warning.includes("見出しが単調"),
      ),
    ).toBe(false);
  });

  it("「！」があっても全部の見出しが15字以上なら単調で警告する", () => {
    const slides = Array.from({ length: 10 }, (_, index) =>
      contentSlide(`s${index}`, {
        blocks: [
          heading(
            `登壇の資料はこの手順で作れば迷わない${index}！`,
            `s${index}-heading`,
          ),
          block("text", { text: "本文" }, { id: `s${index}-body` }),
        ],
      }),
    );
    expect(
      talkCheck(talkDeck(slides), 60).warnings.some((warning) =>
        warning.includes("見出しが単調"),
      ),
    ).toBe(true);
  });

  it("見出しが1つも無いデッキは単調の判定をしない", () => {
    const slides = Array.from({ length: 10 }, (_, index) =>
      contentSlide(`s${index}`, {
        blocks: [block("text", { text: "本文" }, { id: `s${index}-body` })],
      }),
    );
    expect(
      talkCheck(talkDeck(slides), 60).warnings.some((warning) =>
        warning.includes("見出しが単調"),
      ),
    ).toBe(false);
  });

  it("口語の語尾は末尾の記号を外して見る。「育てる」のような動詞は拾わない", () => {
    const deck = talkDeck([
      contentSlide("s01", {
        blocks: [
          heading("もう動いてるんです！", "s01-heading"),
          block("text", { text: "本文" }, { id: "s01-body" }),
        ],
      }),
      contentSlide("s02", {
        blocks: [
          heading("チームで育てる", "s02-heading"),
          block("text", { text: "本文" }, { id: "s02-body" }),
        ],
      }),
      contentSlide("s03", {
        blocks: [
          heading("計画を立てる。", "s03-heading"),
          block("text", { text: "本文" }, { id: "s03-body" }),
        ],
      }),
    ]);
    const warnings = talkCheck(deck, 15).warnings;
    expect(warnings).toContain(
      "s01: 見出しの語尾が口語で砕けている(もう動いてるんです！)",
    );
    const colloquial = warnings.filter((warning) => warning.includes("口語"));
    expect(colloquial).toHaveLength(1);
  });

  it("10枚以上で「!」も「?」も無いと見出しが単調で警告する", () => {
    const slides = Array.from({ length: 10 }, (_, index) =>
      contentSlide(`s${index}`, {
        blocks: [
          heading(`見出し${index}`, `s${index}-heading`),
          block("text", { text: "本文" }, { id: `s${index}-body` }),
        ],
      }),
    );
    const deck = talkDeck(slides);
    expect(
      talkCheck(deck, 60).warnings.some((warning) =>
        warning.includes("見出しが単調"),
      ),
    ).toBe(true);
  });

  it("9枚以下なら見出しが単調でも警告しない", () => {
    const slides = Array.from({ length: 9 }, (_, index) =>
      contentSlide(`s${index}`, {
        blocks: [
          heading(`見出し${index}`, `s${index}-heading`),
          block("text", { text: "本文" }, { id: `s${index}-body` }),
        ],
      }),
    );
    const deck = talkDeck(slides);
    expect(
      talkCheck(deck, 60).warnings.some((warning) =>
        warning.includes("見出しが単調"),
      ),
    ).toBe(false);
  });

  it("口語の砕けた語尾(〜てる・〜ばいい・〜んです)の見出しを警告する", () => {
    const deck = talkDeck([
      contentSlide("s01", {
        blocks: [
          heading("できてる", "s01-heading"),
          block("text", { text: "本文" }, { id: "s01-body" }),
        ],
      }),
      contentSlide("s02", {
        blocks: [
          heading("やればいい", "s02-heading"),
          block("text", { text: "本文" }, { id: "s02-body" }),
        ],
      }),
      contentSlide("s03", {
        blocks: [
          heading("そうなんです", "s03-heading"),
          block("text", { text: "本文" }, { id: "s03-body" }),
        ],
      }),
      contentSlide("s04"),
    ]);
    const warnings = talkCheck(deck, 15).warnings;
    expect(warnings).toContain("s01: 見出しの語尾が口語で砕けている(できてる)");
    expect(warnings).toContain(
      "s02: 見出しの語尾が口語で砕けている(やればいい)",
    );
    expect(warnings).toContain(
      "s03: 見出しの語尾が口語で砕けている(そうなんです)",
    );
  });

  it("ノートが空の本文スライドを警告する", () => {
    const deck = talkDeck([
      contentSlide("s01"),
      contentSlide("s02", { notes: "話す内容" }),
    ]);
    expect(talkCheck(deck, 15).warnings).toEqual(["s01: ノートが空"]);
  });
});

describe("deckIdFromPath", () => {
  it("資料フォルダの中のパスから id を読む", () => {
    expect(
      deckIdFromPath("workspace/decks/deck_20260916_003/generated.json"),
    ).toBe("deck_20260916_003");
    expect(deckIdFromPath("tmp/generated.json")).toBeUndefined();
  });
});

describe("findMissingAssets", () => {
  it("assets/ に無い画像のパスを返す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-check-"));
    try {
      await mkdir(join(dir, "assets"));
      await writeFile(join(dir, "assets", "a.png"), "");
      const report = checkGeneratedDeck(
        withBlocks([
          block("image", { src: "assets/a.png" }),
          { ...block("image", { src: "assets/b.png" }), id: "b02" },
        ]),
      );
      if (!report.ok) throw new Error(report.errors);
      expect(await findMissingAssets(report.deck, dir)).toEqual([
        "assets/b.png",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
