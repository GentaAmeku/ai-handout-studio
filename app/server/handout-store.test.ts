// @vitest-environment node
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
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
import { createDocument, updateDocument } from "./document-store";
import {
  createSheet,
  exportHandout,
  listHandouts,
  readHandout,
  renderHandout,
  saveSheetAnswers,
  setHandoutTemplate,
  updateSheetLayout,
  updateSheetQuestions,
} from "./handout-store";
import { saveProfile } from "./profile";
import { copyDesignWithDefaultSelection } from "./test-fixtures.ts";

const now = new Date(2026, 8, 20, 10, 0, 0);
const later = new Date(2026, 8, 20, 11, 0, 0);
// design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
const context = { root: "", designDir: "" };

beforeAll(async () => {
  context.designDir = await copyDesignWithDefaultSelection();
});

afterAll(async () => {
  await rm(context.designDir, { recursive: true, force: true });
});

beforeEach(async () => {
  context.root = await mkdtemp(join(tmpdir(), "ai-handout-studio-handout-"));
});

afterEach(async () => {
  await rm(context.root, { recursive: true, force: true });
});

// lang を明示し、環境の LANG に関わらずいつも同じ(ja)言語で描く
const questions = (revision = "1") => ({
  schemaVersion: 1,
  id: "demo",
  revision,
  title: "配布の進め方を決める",
  description: "合成の見本です。",
  lang: "ja" as const,
  questions: [
    {
      id: "where",
      title: "どこに置きますか",
      type: "single",
      options: [
        { id: "studio", label: "ai-handout-studio に保存する" },
        { id: "tmp", label: "一時フォルダに置く" },
      ],
      recommended: ["studio"],
    },
    {
      id: "checks",
      title: "何を確かめますか",
      type: "multiple",
      options: [
        { id: "look", label: "見た目" },
        { id: "export", label: "書き出し" },
      ],
    },
  ],
});

const body = '<div class="ds-page"><h1>保存の仕組み</h1></div>';

describe("質問票の保存", () => {
  it("質問 JSON を置いて一覧に出し、題名は questions.json から取る", async () => {
    const created = await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    expect(created).toMatchObject({
      success: true,
      summary: {
        kind: "sheet",
        id: "sheet_20260920_001",
        title: "配布の進め方を決める",
        questionCount: 2,
        hasAnswers: false,
      },
    });
    expect(
      await listHandouts(context.root, context.designDir, "sheet"),
    ).toMatchObject([{ id: "sheet_20260920_001" }]);
    expect(
      await readHandout(
        context.root,
        context.designDir,
        "sheet",
        "sheet_20260920_001",
      ),
    ).toMatchObject({ title: "配布の進め方を決める" });
  });

  it("形の違う質問 JSON は保存しない", async () => {
    const result = await createSheet(
      context.root,
      context.designDir,
      { questions: { schemaVersion: 1, id: "demo", revision: "1" } },
      now,
    );
    expect(result).toMatchObject({ success: false, status: 422 });
    expect(
      await listHandouts(context.root, context.designDir, "sheet"),
    ).toEqual([]);
  });

  it("label に (推奨) を書いた質問 JSON は、警告を返して保存する", async () => {
    const doc = questions();
    const labelled = {
      ...doc,
      questions: doc.questions.map((q) =>
        q.id === "where"
          ? {
              ...q,
              options: [
                { id: "studio", label: "ai-handout-studio に保存する(推奨)" },
                { id: "tmp", label: "一時フォルダに置く" },
              ],
            }
          : q,
      ),
    };
    const created = await createSheet(
      context.root,
      context.designDir,
      { questions: labelled },
      now,
    );
    expect(created).toMatchObject({
      success: true,
      summary: { id: "sheet_20260920_001" },
      warnings: [
        "質問 where: 選択肢 studio の label に (推奨) がある。推奨は recommended で示す。label に (推奨) を書かない",
      ],
    });
    expect(
      await updateSheetQuestions(
        context.root,
        "sheet_20260920_001",
        questions(),
        later,
      ),
    ).toMatchObject({ success: true, warnings: [] });
  });

  it("質問を差し替えると題名と更新日が変わる", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    const updated = await updateSheetQuestions(
      context.root,
      "sheet_20260920_001",
      { ...questions("2"), title: "決め直す" },
      later,
    );
    expect(updated).toMatchObject({
      success: true,
      summary: { title: "決め直す", updatedAt: later.toISOString() },
    });
  });

  it("回答は版が合っていれば置き、違えば断る", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    const answers = {
      schemaVersion: 1,
      documentId: "demo",
      revision: "1",
      answers: [
        {
          id: "where",
          selected: ["studio"],
          text: "ai-handout-studio に保存する（推奨）",
          reviewed: true,
        },
      ],
    };
    expect(
      await saveSheetAnswers(
        context.root,
        "sheet_20260920_001",
        answers,
        later,
      ),
    ).toMatchObject({ success: true, summary: { hasAnswers: true } });
    expect(
      await saveSheetAnswers(
        context.root,
        "sheet_20260920_001",
        { ...answers, revision: "9" },
        later,
      ),
    ).toMatchObject({ success: false, status: 422 });
  });

  it("レイアウトを選ばなければテンプレートの既定のまま", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    expect(
      await readHandout(
        context.root,
        context.designDir,
        "sheet",
        "sheet_20260920_001",
      ),
    ).toMatchObject({ layout: "focus" });
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    expect(rendered.success).toBe(true);
    if (!rendered.success) return;
    expect(rendered.html).toContain('data-layout="focus"');
  });

  it("質問票ごとにレイアウトを選べる", async () => {
    const created = await createSheet(
      context.root,
      context.designDir,
      { questions: questions(), layout: "all" },
      now,
    );
    expect(created).toMatchObject({ success: true });
    expect(
      await readHandout(
        context.root,
        context.designDir,
        "sheet",
        "sheet_20260920_001",
      ),
    ).toMatchObject({ layout: "all" });
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    expect(rendered.success).toBe(true);
    if (!rendered.success) return;
    expect(rendered.html).toContain('data-layout="all"');
  });

  it("sheet update でレイアウトだけ差し替えられる。質問は変わらない", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    const updated = await updateSheetLayout(
      context.root,
      "sheet_20260920_001",
      "print",
      later,
    );
    expect(updated).toMatchObject({
      success: true,
      summary: {
        title: "配布の進め方を決める",
        updatedAt: later.toISOString(),
      },
    });
    expect(
      await readHandout(
        context.root,
        context.designDir,
        "sheet",
        "sheet_20260920_001",
      ),
    ).toMatchObject({ layout: "print" });
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    expect(rendered.success).toBe(true);
    if (!rendered.success) return;
    expect(rendered.html).toContain('data-layout="print"');
  });

  it("見本は回答を映した1枚の HTML になる", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: questions() },
      now,
    );
    await saveSheetAnswers(
      context.root,
      "sheet_20260920_001",
      {
        schemaVersion: 1,
        documentId: "demo",
        revision: "1",
        answers: [
          {
            id: "where",
            selected: ["studio"],
            text: "ai-handout-studio に保存する（推奨）",
            reviewed: true,
          },
        ],
      },
      later,
    );
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    expect(rendered.success).toBe(true);
    if (!rendered.success) return;
    expect(rendered.html).toContain(
      "<title>配布の進め方を決める — 質問票</title>",
    );
    // CSS は埋め込む。外から読むのは書体だけ
    expect(rendered.html).toContain("<style>");
    // 質問を移動するスクリプトだけを埋める。外から読むのは書体だけ
    expect(rendered.html).toContain("<script>");
    expect(rendered.html).not.toContain("<script src");
    expect(rendered.html).toContain('data-move="next"');
    // 回答は Markdown にまとめてコピーする。送り先は持たない
    expect(rendered.html).toContain('data-copy=""');
    expect(rendered.html).not.toContain("fetch(");
    expect(rendered.html).toContain('data-qid="where"');
    expect(rendered.html).toContain('data-note=""');
    expect(rendered.html).toContain("✓ 入力済み");
    expect(rendered.html).toContain('value="studio" data-mutation="" checked');
    expect(rendered.html).toContain(
      "<span>ai-handout-studio に保存する（推奨）</span>",
    );
    expect(rendered.html).toContain(
      '<span data-done-count="">1</span> / 2 問 入力済み',
    );
  });
});

describe("質問票の言語", () => {
  // questions() は lang: "ja" を明示している(他のテストを環境の LANG から独立させるため)。
  // ここでは「JSON に lang が無い」場合を確かめたいので、それだけ外す
  const questionsWithoutLang = () => {
    const { lang: _lang, ...rest } = questions();
    return rest;
  };

  it("questions.json に lang が無ければ、設定の locale を入れる", async () => {
    await saveProfile(context.root, { orgName: "", locale: "en" });
    const created = await createSheet(
      context.root,
      context.designDir,
      { questions: questionsWithoutLang() },
      now,
    );
    expect(created.success).toBe(true);
    const saved = JSON.parse(
      await readFile(
        join(context.root, "sheets", "sheet_20260920_001", "questions.json"),
        "utf8",
      ),
    );
    expect(saved.lang).toBe("en");
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    expect(rendered.success && rendered.lang).toBe("en");
    expect(rendered.success && rendered.html).toContain('<html lang="en">');
    expect(rendered.success && rendered.html).toContain("Copy answers");
  });

  it("questions.json に lang があれば、設定より優先する", async () => {
    await saveProfile(context.root, { orgName: "", locale: "en" });
    await createSheet(
      context.root,
      context.designDir,
      { questions: { ...questions(), lang: "ja" } },
      now,
    );
    const saved = JSON.parse(
      await readFile(
        join(context.root, "sheets", "sheet_20260920_001", "questions.json"),
        "utf8",
      ),
    );
    expect(saved.lang).toBe("ja");
  });

  it("update では、直す JSON に別の lang があっても今の値を保つ", async () => {
    await createSheet(
      context.root,
      context.designDir,
      { questions: { ...questions(), lang: "ja" } },
      now,
    );
    await updateSheetQuestions(
      context.root,
      "sheet_20260920_001",
      { ...questions("2"), lang: "en" },
      later,
    );
    const saved = JSON.parse(
      await readFile(
        join(context.root, "sheets", "sheet_20260920_001", "questions.json"),
        "utf8",
      ),
    );
    expect(saved.lang).toBe("ja");
  });
});

describe("質問票のイメージ画像", () => {
  // 見本の画像(design/samples/assets/)を、質問 JSON の場所からの相対パスで指す
  const samplesDir = new URL("../../design/samples", import.meta.url).pathname;
  const withImages = (src = "assets/sample-screen.jpg") => {
    const doc = questions();
    return {
      ...doc,
      questions: [
        ...doc.questions,
        {
          id: "look",
          title: "カードの見た目はどちらにしますか",
          type: "single",
          options: [
            { id: "a", label: "案A" },
            { id: "b", label: "案B" },
          ],
          visual: {
            type: "images",
            caption: "イメージ",
            items: [
              { src, label: "案A", alt: "案Aの画面" },
              { src: "assets/sample-templates.jpg", label: "案B", alt: "" },
            ],
          },
        },
      ],
    };
  };

  it("画像を assets/ へ写して参照を書き換え、描くときに data: で並べる", async () => {
    const created = await createSheet(
      context.root,
      context.designDir,
      { questions: withImages(), baseDir: samplesDir },
      now,
    );
    expect(created).toMatchObject({ success: true, warnings: [] });
    const saved = JSON.parse(
      await readFile(
        join(context.root, "sheets", "sheet_20260920_001", "questions.json"),
        "utf8",
      ),
    );
    expect(
      saved.questions[2].visual.items.map((item: { src: string }) => item.src),
    ).toEqual(["assets/img-1.jpg", "assets/img-2.jpg"]);
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "sheet",
      "sheet_20260920_001",
    );
    const html = rendered.success ? rendered.html : "";
    expect(html).toContain('class="ds-images-grid"');
    expect(html.match(/<img src="data:image\/jpeg;base64,/g)).toHaveLength(2);
  });

  it("画像が無い・URL を指す質問 JSON は保存しない", async () => {
    expect(
      await createSheet(
        context.root,
        context.designDir,
        { questions: withImages("none.png"), baseDir: samplesDir },
        now,
      ),
    ).toMatchObject({ success: false, status: 422 });
    expect(
      await createSheet(
        context.root,
        context.designDir,
        {
          questions: withImages("https://example.com/a.png"),
          baseDir: samplesDir,
        },
        now,
      ),
    ).toMatchObject({ success: false, status: 422 });
  });

  it("見た目に関わる質問に画像が無ければ警告する(保存は止めない)", async () => {
    const doc = withImages();
    const created = await createSheet(
      context.root,
      context.designDir,
      {
        questions: {
          ...doc,
          questions: doc.questions.map((question) =>
            question.id === "look"
              ? {
                  ...question,
                  visual: undefined,
                  visualRationale: "比べない",
                }
              : question,
          ),
        },
      },
      now,
    );
    expect(created).toMatchObject({
      success: true,
      warnings: [expect.stringContaining("質問 look: 見た目に関わる質問")],
    });
  });
});

describe("HTML 資料の保存", () => {
  it("本文を置いて一覧に出す", async () => {
    const created = await createDocument(
      context.root,
      context.designDir,
      { title: "保存の仕組み", body },
      now,
    );
    expect(created).toMatchObject({
      success: true,
      summary: {
        kind: "document",
        id: "doc_20260920_001",
        title: "保存の仕組み",
      },
    });
    // 本文の断片は html ブロック1つの document.json として置く
    const saved = JSON.parse(
      await readFile(
        join(context.root, "documents", "doc_20260920_001", "document.json"),
        "utf8",
      ),
    );
    expect(saved).toMatchObject({
      id: "doc_20260920_001",
      title: "保存の仕組み",
      sections: [{ blocks: [{ type: "html", props: { html: body } }] }],
    });
  });

  it("スクリプトや部品の外の class を持つ本文は保存しない", async () => {
    expect(
      await createDocument(
        context.root,
        context.designDir,
        { title: "だめな本文", body: "<script>alert(1)</script>" },
        now,
      ),
    ).toMatchObject({ success: false, status: 422 });
    expect(
      await listHandouts(context.root, context.designDir, "document"),
    ).toEqual([]);
  });

  it("本文を差し替えられる。題名は渡したときだけ変わる", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { title: "保存の仕組み", body },
      now,
    );
    const updated = await updateDocument(
      context.root,
      "doc_20260920_001",
      { body: '<div class="ds-page"><h1>直した</h1></div>' },
      {},
      later,
    );
    expect(updated).toMatchObject({
      success: true,
      summary: { title: "保存の仕組み", updatedAt: later.toISOString() },
    });
  });
});

describe("テンプレートの入れ替えと書き出し", () => {
  it("テンプレートを替えると見本の CSS が替わる", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { title: "保存の仕組み", body },
      now,
    );
    const swapped = await setHandoutTemplate(
      context.root,
      context.designDir,
      "document",
      "doc_20260920_001",
      "report",
      later,
    );
    expect(swapped).toMatchObject({
      success: true,
      summary: { template: "report", updatedAt: later.toISOString() },
    });
    const rendered = await renderHandout(
      context.root,
      context.designDir,
      "document",
      "doc_20260920_001",
    );
    expect(rendered.success && rendered.html).toContain("区分: document");
    expect(rendered.success && rendered.html).toContain("テンプレート: report");
    expect(
      await setHandoutTemplate(
        context.root,
        context.designDir,
        "document",
        "doc_20260920_001",
        "missing",
        later,
      ),
    ).toMatchObject({ success: false, status: 404 });
  });

  it("テンプレートを消したあとの資料は、一覧でも書き出しでも理由を出す", async () => {
    await createDocument(
      context.root,
      context.designDir,
      // design/selection.json の既定(利用者が選んだテンプレート)に依らず、default で確かめる
      { title: "保存の仕組み", body, templateId: "default" },
      now,
    );
    // design/ の写しからテンプレートの CSS だけを消す(テンプレートを消したときと同じ形)
    const copy = await mkdtemp(join(tmpdir(), "ai-handout-studio-design-"));
    await cp(context.designDir, copy, { recursive: true });
    await rm(join(copy, "dist", "document", "default.css"));
    expect(await listHandouts(context.root, copy, "document")).toMatchObject([
      { error: expect.stringContaining("テンプレートが見つからない") },
    ]);
    expect(
      await renderHandout(context.root, copy, "document", "doc_20260920_001"),
    ).toMatchObject({ success: false, status: 422 });
    await rm(copy, { recursive: true, force: true });
  });

  it("書き出しは exports/<日時>/ に1枚の HTML を置く", async () => {
    await createDocument(
      context.root,
      context.designDir,
      { title: "保存の仕組み", body },
      now,
    );
    const result = await exportHandout(
      context.root,
      context.designDir,
      "document",
      "doc_20260920_001",
      later,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.path).toContain(
      join("documents", "doc_20260920_001", "exports", "20260920T110000"),
    );
    expect(await readFile(result.path, "utf8")).toContain("保存の仕組み");
  });
});
