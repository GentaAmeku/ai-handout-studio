// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createDocument, updateDocument } from "./document-store.ts";
import { createSheet } from "./handout-store.ts";
import {
  buildShareBundle,
  extractImages,
  formatBytes,
  formatShareBuild,
  formatShareRequest,
  formatShareUrl,
  hasLeftoverImage,
  readShareState,
  shareDirOf,
  shareStatePathOf,
  writeShareState,
} from "./share.ts";
import { copyDesignWithDefaultSelection } from "./test-fixtures.ts";

// 質問票・HTML 資料の共有用の束

const now = new Date(2026, 8, 23, 10, 0, 0);
const context = { root: "", designDir: "" };

beforeAll(async () => {
  context.designDir = await copyDesignWithDefaultSelection();
});

afterAll(async () => {
  await rm(context.designDir, { recursive: true, force: true });
});

beforeEach(async () => {
  context.root = await mkdtemp(join(tmpdir(), "ai-handout-studio-share-"));
});

afterEach(async () => {
  await rm(context.root, { recursive: true, force: true });
});

// 適当な base64(本物の画像でなくてよい。中身のバイト列だけを確かめる)
const PNG_A =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const JPEG_B =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAA=";

const questions = () => ({
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "共有の確かめ",
  questions: [
    {
      id: "q1",
      title: "共有してよいか",
      type: "single" as const,
      options: [
        { id: "yes", label: "よい" },
        { id: "no", label: "だめ" },
      ],
    },
  ],
});

const documentWithImages = (
  bodyText = "本文です。",
  id = "doc_20260923_001",
) => ({
  id,
  title: "画面まとめ",
  status: "draft",
  meta: {
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  },
  head: { title: "画面まとめ" },
  toc: "none",
  sections: [
    {
      id: "s1",
      heading: "画面",
      blocks: [
        { id: "b1", type: "text", props: { text: bodyText } },
        {
          id: "b2",
          type: "figure",
          props: {
            html: `<svg viewBox="0 0 10 10" role="img" aria-label="a"><image href="data:image/png;base64,${PNG_A}" /></svg>`,
          },
        },
        // 同じ画像をもう一度使う。束では1つにまとまる
        {
          id: "b3",
          type: "figure",
          props: {
            html: `<svg viewBox="0 0 10 10" role="img" aria-label="a2"><image href="data:image/png;base64,${PNG_A}" /></svg>`,
          },
        },
        // <img src="data:…"> の形も HTML 資料にはある
        {
          id: "b4",
          type: "html",
          props: {
            html: `<div class="ds-figure-frame"><img src="data:image/jpeg;base64,${JPEG_B}" /></div>`,
          },
        },
      ],
    },
  ],
});

describe("extractImages", () => {
  it("<image href> と <img src> の両方を拾い、番号のファイル名に置き換える", () => {
    const html = [
      `<image href="data:image/png;base64,${PNG_A}" />`,
      `<img src="data:image/jpeg;base64,${JPEG_B}" />`,
    ].join("");
    const result = extractImages(html);
    expect(result.html).toBe(
      '<image href="img-1.png" /><img src="img-2.jpg" />',
    );
    expect(result.images).toEqual([
      { name: "img-1.png", bytes: Buffer.from(PNG_A, "base64") },
      { name: "img-2.jpg", bytes: Buffer.from(JPEG_B, "base64") },
    ]);
  });

  it("同じ画像(同じ base64)は1つのファイルにまとめる", () => {
    const html = [
      `<image href="data:image/png;base64,${PNG_A}" />`,
      `<image href="data:image/png;base64,${PNG_A}" />`,
    ].join("");
    const result = extractImages(html);
    expect(result.html).toBe(
      '<image href="img-1.png" /><image href="img-1.png" />',
    );
    expect(result.images.length).toBe(1);
  });

  it("手で書いた揺れ(' の引用符・= の前後の空白・大文字の種類・;charset・改行入りの base64・xlink:href)も拾う", () => {
    const wrapped = `${PNG_A.slice(0, 20)}\n  ${PNG_A.slice(20)}`;
    const html = [
      `<img src='data:image/PNG;base64,${PNG_A}' />`,
      `<img src = "data:image/jpeg;charset=utf-8;base64,${JPEG_B}" />`,
      `<image xlink:href="data:image/png;base64,${wrapped}" />`,
    ].join("");
    const result = extractImages(html);
    // 1つ目と3つ目は同じ画像(改行を除けば同じ base64)なので img-1.png にまとまる
    expect(result.html).toBe(
      `<img src='img-1.png' /><img src = "img-2.jpg" /><image xlink:href="img-1.png" />`,
    );
    expect(result.images.map((image) => image.name)).toEqual([
      "img-1.png",
      "img-2.jpg",
    ]);
    expect(result.images[0]?.bytes).toEqual(Buffer.from(PNG_A, "base64"));
  });

  it("ファイルに出せない data: の画像(srcset・url()・base64 でない SVG)は残り、hasLeftoverImage が見つける", () => {
    expect(
      hasLeftoverImage(`<img srcset="data:image/png;base64,${PNG_A}" />`),
    ).toBe(true);
    expect(
      hasLeftoverImage(
        `<div style="background:url('data:image/png;base64,${PNG_A}')"></div>`,
      ),
    ).toBe(true);
    expect(
      hasLeftoverImage(`<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />`),
    ).toBe(true);
    // 本文の文章に data: と書いてあるだけなら残りではない
    expect(hasLeftoverImage("<p>HTML 資料では data: で埋め込む</p>")).toBe(
      false,
    );
    expect(
      hasLeftoverImage(
        extractImages(`<img src="data:image/png;base64,${PNG_A}" />`).html,
      ),
    ).toBe(false);
  });

  it("画像が無ければそのまま", () => {
    expect(extractImages("<p>ただの文章</p>")).toEqual({
      html: "<p>ただの文章</p>",
      images: [],
    });
  });
});

describe("formatBytes", () => {
  it("1024 未満は B、以上は KB に丸める", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(1500)).toBe("1KB");
  });
});

describe("buildShareBundle(質問票)", () => {
  it("index.html だけを置き、data-share の印を付ける。ファイルで保存は出さない印になる", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    const id = "sheet_20260923_001";
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "sheet",
      id,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.bundleDir).toBe(shareDirOf(context.root, "sheet", id));
    expect(result.files).toEqual([
      { name: "index.html", bytes: expect.any(Number) },
    ]);
    expect(await readdir(result.bundleDir)).toEqual(["index.html"]);
    const html = await readFile(join(result.bundleDir, "index.html"), "utf8");
    expect(html).toContain('data-share=""');
    expect(result.warning).toBeUndefined();
  });

  it("資料が無ければ 404", async () => {
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260923_099",
    );
    expect(result).toMatchObject({ success: false, status: 404 });
  });
});

describe("buildShareBundle(HTML 資料)", () => {
  it("data: の画像をファイルに出し、参照を置き換える。同じ画像は1つにまとめる", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { document: documentWithImages() },
      now,
    );
    const id = "doc_20260923_001";
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "document",
      id,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const names = result.files.map((file) => file.name).sort();
    // b2・b3 は同じ画像なので img-1.png は1つだけ、b4 の jpeg が img-2.jpg
    expect(names).toEqual(["img-1.png", "img-2.jpg", "index.html"]);
    const html = await readFile(join(result.bundleDir, "index.html"), "utf8");
    expect(html).not.toContain("data:image");
    expect(html).toContain('href="img-1.png"');
    expect(html).toContain('src="img-2.jpg"');
    const png = await readFile(join(result.bundleDir, "img-1.png"));
    expect(png).toEqual(Buffer.from(PNG_A, "base64"));
  });

  it("束を作り直すと、前の画像を残さない", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { document: documentWithImages() },
      now,
    );
    const id = "doc_20260923_001";
    await buildShareBundle(context.root, context.designDir, "document", id);
    // 同じ資料の中身を、画像の無いものに差し替える
    await updateDocument(
      context.root,
      id,
      {
        document: {
          ...documentWithImages(),
          sections: [
            {
              id: "s1",
              heading: "画面",
              blocks: [{ id: "b1", type: "text", props: { text: "本文だけ" } }],
            },
          ],
        },
      },
      {},
      now,
    );
    const rebuilt = await buildShareBundle(
      context.root,
      context.designDir,
      "document",
      id,
    );
    expect(rebuilt.success).toBe(true);
    if (!rebuilt.success) return;
    expect(await readdir(rebuilt.bundleDir)).toEqual(["index.html"]);
  });

  it("文字のファイルが目安(100KB)を超えたら警告を出す。止めない", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { document: documentWithImages("あ".repeat(60_000)) },
      now,
    );
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "document",
      "doc_20260923_001",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.textBytes).toBeGreaterThan(100_000);
    expect(result.warning).toContain("文字のファイルが");
  });

  it("[[要確認]] が残っていたら警告を出す。止めない", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { document: documentWithImages("値は [[要確認]] のまま") },
      now,
    );
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "document",
      "doc_20260923_001",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warning).toContain("[[要確認]] が 1 か所残っている");
  });
});

describe("buildShareBundle の警告", () => {
  it("[[要確認]] は正本で数える。質問の題名が目次や data-qtitle に写っても1か所", async () => {
    const base = questions();
    await createSheet(
      context.root,
      context.designDir,
      {
        questions: {
          ...base,
          questions: [{ ...base.questions[0], title: "締め切り [[要確認]]" }],
        },
      },
      now,
    );
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260923_001",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const html = await readFile(join(result.bundleDir, "index.html"), "utf8");
    expect(html.split("[[要確認]]").length - 1).toBeGreaterThan(1);
    expect(result.warning).toContain("[[要確認]] が 1 か所残っている");
  });

  it("HTML 資料にファイルに出せない data: の画像が残ったら警告を出す。止めない", async () => {
    const doc = documentWithImages();
    await createDocument(
      context.root,
      context.designDir,
      {
        document: {
          ...doc,
          sections: [
            {
              ...doc.sections[0],
              blocks: [
                {
                  id: "b9",
                  type: "html",
                  props: {
                    html: '<div class="ds-figure-frame"><img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" /></div>',
                  },
                },
              ],
            },
          ],
        },
      },
      now,
    );
    const result = await buildShareBundle(
      context.root,
      context.designDir,
      "document",
      "doc_20260923_001",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.warning).toContain("data: の画像が index.html に残っている");
  });
});

describe("share.json", () => {
  it("--url の内容を書き、読み直せる。束の外(share/ の隣)に置く", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    const id = "sheet_20260923_001";
    await writeShareState(
      context.root,
      "sheet",
      id,
      "https://claude.ai/artifact/xxxx",
      now,
    );
    expect(await readShareState(context.root, "sheet", id)).toEqual({
      target: "claude-artifact",
      url: "https://claude.ai/artifact/xxxx",
      sharedAt: now.toISOString(),
    });
    // share/ とは別のファイル
    expect(shareStatePathOf(context.root, "sheet", id)).not.toBe(
      join(shareDirOf(context.root, "sheet", id), "share.json"),
    );
  });

  it("https://claude.ai/ で始まらない URL は読めない(壊れた値として扱う)", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    await writeShareState(
      context.root,
      "sheet",
      "sheet_20260923_001",
      "https://evil.example/",
      now,
    );
    expect(
      await readShareState(context.root, "sheet", "sheet_20260923_001"),
    ).toBeUndefined();
  });

  it("無ければ undefined", async () => {
    expect(
      await readShareState(context.root, "sheet", "sheet_20260923_001"),
    ).toBeUndefined();
  });
});

describe("formatShareRequest / formatShareBuild / formatShareUrl", () => {
  const files = [
    { name: "index.html", bytes: 44_000 },
    { name: "img-1.jpg", bytes: 120_000 },
  ];

  it("初めての共有は「公開してください」、束の場所・files・share --url・Share の4項目を含む", () => {
    const text = formatShareRequest({
      id: "doc_20260922_001",
      bundleDir: "/tmp/share",
      files,
    });
    expect(text).toContain(
      "次の束を Claude の Artifact として公開してください。",
    );
    expect(text).toContain("束の場所: /tmp/share/index.html");
    expect(text).toContain(
      "中身を変えずにそのまま公開する。デザインは直さない",
    );
    expect(text).toContain("画像は files で相対パスのまま渡す(img-1.jpg)");
    expect(text).toContain(
      "ai-handout-studio share doc_20260922_001 --url <公開した URL>",
    );
    expect(text).toContain("本人が Artifact の画面の Share から選ぶ");
    expect(text).toContain("公開リンクにすると誰でも読める");
  });

  it("前の URL があれば「更新してください」になり、同じ URL を share --url に渡す", () => {
    const text = formatShareRequest({
      id: "doc_20260922_001",
      bundleDir: "/tmp/share",
      files,
      previousUrl: "https://claude.ai/artifact/xxxx",
    });
    expect(text).toContain(
      "https://claude.ai/artifact/xxxx の Artifact を、次の束で更新してください。",
    );
    expect(text).toContain(
      "ai-handout-studio share doc_20260922_001 --url https://claude.ai/artifact/xxxx",
    );
  });

  it("画像が無ければ files の行を出さない(質問票)", () => {
    const text = formatShareRequest({
      id: "sheet_20260923_001",
      bundleDir: "/tmp/share",
      files: [{ name: "index.html", bytes: 40_000 }],
    });
    expect(text).not.toContain("files で相対パスのまま渡す");
  });

  it("warning を渡すと(画面のボタン。128)依頼文の最後に警告の行が入り、渡さなければ入らない", () => {
    const base = {
      id: "doc_20260922_001",
      bundleDir: "/tmp/share",
      files,
    };
    expect(
      formatShareRequest({ ...base, warning: "[[要確認]] が 2 か所残っている" })
        .split("\n")
        .at(-1),
    ).toBe(
      "- 束の警告: [[要確認]] が 2 か所残っている。公開したら本人に伝える",
    );
    expect(formatShareRequest(base)).not.toContain("束の警告");
  });

  it("formatShareBuild は kind・id・bundle・files・textBytes の行のあとに依頼文を続ける", () => {
    const text = formatShareBuild({
      kind: "document",
      id: "doc_20260922_001",
      bundleDir: "/tmp/share",
      files,
      textBytes: 44_000,
      warning: "文字のファイルが多い",
      previousUrl: "https://claude.ai/artifact/xxxx",
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("kind: document");
    expect(lines[1]).toBe("id: doc_20260922_001");
    expect(lines[2]).toBe("bundle: /tmp/share");
    expect(lines[3]).toBe("files: index.html (43KB), img-1.jpg (117KB)");
    expect(lines[4]).toBe("textBytes: 44000");
    expect(lines[5]).toBe("url: https://claude.ai/artifact/xxxx");
    expect(lines[6]).toBe("warning: 文字のファイルが多い");
    expect(lines[7]).toBe("");
    expect(text).toContain("を、次の束で更新してください。");
  });

  it("url も warning も無ければその行を出さない", () => {
    const text = formatShareBuild({
      kind: "sheet",
      id: "sheet_20260923_001",
      bundleDir: "/tmp/share",
      files: [{ name: "index.html", bytes: 40_000 }],
      textBytes: 40_000,
    });
    expect(text).not.toContain("url:");
    expect(text).not.toContain("warning:");
  });

  it("formatShareUrl は kind・id・url の3行", () => {
    expect(
      formatShareUrl({
        kind: "sheet",
        id: "sheet_20260923_001",
        url: "https://claude.ai/artifact/xxxx",
      }),
    ).toBe(
      "kind: sheet\nid: sheet_20260923_001\nurl: https://claude.ai/artifact/xxxx",
    );
  });
});
