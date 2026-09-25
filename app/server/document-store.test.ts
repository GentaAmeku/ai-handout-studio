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
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DocumentFile } from "../src/schema/document";
import { documentSample } from "./document-sample";
import {
  createDocument,
  listDocumentVersions,
  readDocument,
  restoreDocumentVersion,
  saveDocument,
  updateDocument,
} from "./document-store";
import { renderHandout } from "./handout-store";
import { saveProfile } from "./profile";

const designDir = fileURLToPath(new URL("../../design", import.meta.url));
// 見本の画像(assets/sample-screen.jpg)はここから取り込む
const samplesDir = join(designDir, "samples");
const id = "doc_20260920_001";
const at = (minute: number) => new Date(2026, 8, 20, 10, minute, 0);
const context = { root: "" };

beforeEach(async () => {
  context.root = await mkdtemp(join(tmpdir(), "ai-handout-studio-docstore-"));
});

afterEach(async () => {
  await rm(context.root, { recursive: true, force: true });
});

const dirOf = () => join(context.root, "documents", id);
const readSaved = async (): Promise<DocumentFile> =>
  JSON.parse(await readFile(join(dirOf(), "document.json"), "utf8"));

// lang を明示し、環境の LANG に関わらずいつも同じ(ja)言語で描く
const create = () =>
  createDocument(
    context.root,
    designDir,
    {
      document: { ...documentSample(), lang: "ja" },
      baseDir: samplesDir,
      title: "保存の仕組み",
    },
    at(0),
  );

describe("document.json の新規作成", () => {
  it("meta.json を正として title・template・id・日時を書き戻す", async () => {
    const created = await create();
    expect(created).toMatchObject({
      success: true,
      summary: { id, title: "保存の仕組み" },
    });
    const saved = await readSaved();
    expect(saved).toMatchObject({
      id,
      title: "保存の仕組み",
      meta: { createdAt: at(0).toISOString(), updatedAt: at(0).toISOString() },
    });
    expect(saved.template).toBe(created.success && created.summary.template);
  });

  it("title を渡さなければ document の title を使う", async () => {
    const created = await createDocument(
      context.root,
      designDir,
      { document: documentSample(), baseDir: samplesDir },
      at(0),
    );
    expect(created).toMatchObject({
      success: true,
      summary: { title: documentSample().title },
    });
  });

  it("形が正しくない document は 422 で、何も作らない", async () => {
    const bad = await createDocument(
      context.root,
      designDir,
      { document: { ...documentSample(), sections: "x" } },
      at(0),
    );
    expect(bad).toMatchObject({ success: false, status: 422 });
    expect(await readdir(context.root)).toEqual([]);
  });
});

describe("document.json の言語", () => {
  it("document に lang が無ければ、設定の locale を入れる", async () => {
    await saveProfile(context.root, { orgName: "", locale: "en" });
    const created = await createDocument(
      context.root,
      designDir,
      { document: documentSample(), baseDir: samplesDir, title: "見出し" },
      at(0),
    );
    expect(created.success).toBe(true);
    const saved = await readSaved();
    expect(saved.lang).toBe("en");
    const rendered = await renderHandout(
      context.root,
      designDir,
      "document",
      id,
    );
    expect(rendered.success && rendered.lang).toBe("en");
    expect(rendered.success && rendered.html).toContain('<html lang="en">');
  });

  it("document に lang があれば、設定より優先する", async () => {
    await saveProfile(context.root, { orgName: "", locale: "en" });
    await createDocument(
      context.root,
      designDir,
      {
        document: { ...documentSample(), lang: "ja" },
        baseDir: samplesDir,
        title: "見出し",
      },
      at(0),
    );
    expect((await readSaved()).lang).toBe("ja");
  });

  it("update では、直す JSON に別の lang があっても今の値を保つ", async () => {
    await create();
    await updateDocument(
      context.root,
      id,
      {
        document: { ...documentSample(), id, lang: "en" },
        baseDir: samplesDir,
      },
      {},
      at(5),
    );
    expect((await readSaved()).lang).toBe("ja");
  });
});

describe("画像の取り込みと埋め込み", () => {
  // 見本の画像は、画面の写真1枚と設計図2枚
  const SAMPLE_FILES = ["img-1.jpg", "img-2.webp", "img-3.webp"];
  const SAMPLE_SRCS = SAMPLE_FILES.map((file) => `assets/${file}`);
  const imageSrcs = (doc: DocumentFile): string[] =>
    doc.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.type === "image" ? [block.props.src] : [],
      ),
    );

  it("手元の画像を assets/ へ写して参照を書き換え、描くときに data: で埋め込む", async () => {
    await create();
    const saved = await readSaved();
    expect(imageSrcs(saved)).toEqual(SAMPLE_SRCS);
    expect(await readdir(join(dirOf(), "assets"))).toEqual(SAMPLE_FILES);
    const rendered = await renderHandout(
      context.root,
      designDir,
      "document",
      id,
    );
    expect(rendered.success && rendered.html).toContain(
      '<img src="data:image/jpeg;base64,',
    );
    expect(rendered.success && rendered.html).not.toContain(
      "画像が見つからない",
    );
  });

  it("同じ画像を指し直して update しても、assets/ は増えない", async () => {
    await create();
    const updated = await updateDocument(
      context.root,
      id,
      { document: { ...documentSample(), id }, baseDir: samplesDir },
      {},
      at(5),
    );
    expect(updated).toMatchObject({ success: true });
    expect(imageSrcs(await readSaved())).toEqual(SAMPLE_SRCS);
    expect(await readdir(join(dirOf(), "assets"))).toEqual(SAMPLE_FILES);
  });

  it("画像が無ければ保存せず、資料の場所も確保しない", async () => {
    const created = await createDocument(
      context.root,
      designDir,
      { document: documentSample(), baseDir: context.root, title: "欠け" },
      at(0),
    );
    expect(created).toMatchObject({ success: false, status: 422 });
    expect(await readdir(context.root)).toEqual([]);
  });

  it("assets/ の画像が消えていたら、描くときに「見つからない」と出す", async () => {
    await create();
    await rm(join(dirOf(), "assets"), { recursive: true });
    const rendered = await renderHandout(
      context.root,
      designDir,
      "document",
      id,
    );
    expect(rendered.success && rendered.html).toContain(
      "画像が見つからない: assets/img-1.jpg",
    );
  });
});

describe("保存と版", () => {
  it("保存のたびに現行を versions/ へ積み、updatedAt と title を合わせる", async () => {
    await create();
    const document = { ...(await readSaved()), title: "直した題" };
    const saved = await saveDocument(
      context.root,
      id,
      { document, baseUpdatedAt: at(0).toISOString() },
      at(5),
    );
    expect(saved).toMatchObject({
      success: true,
      summary: { title: "直した題", updatedAt: at(5).toISOString() },
    });
    expect(await readSaved()).toMatchObject({
      title: "直した題",
      meta: { updatedAt: at(5).toISOString() },
    });
    const versions = await listDocumentVersions(context.root, id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      source: "save",
      title: "保存の仕組み",
      sectionCount: documentSample().sections.length,
    });
  });

  it("外で書き換わっていたら 409 で上書きしない", async () => {
    await create();
    const document = await readSaved();
    await saveDocument(
      context.root,
      id,
      { document, baseUpdatedAt: at(0).toISOString() },
      at(5),
    );
    const stale = await saveDocument(
      context.root,
      id,
      {
        document: { ...document, title: "古い画面から" },
        baseUpdatedAt: at(0).toISOString(),
      },
      at(9),
    );
    expect(stale).toMatchObject({ success: false, status: 409 });
    expect((await readSaved()).title).toBe("保存の仕組み");
  });

  it("id が違う document は 422、無い資料は 404", async () => {
    await create();
    const document = await readSaved();
    expect(
      await saveDocument(
        context.root,
        id,
        {
          document: { ...document, id: "doc_20260920_999" },
          baseUpdatedAt: at(0).toISOString(),
        },
        at(5),
      ),
    ).toMatchObject({ success: false, status: 422 });
    expect(
      await saveDocument(
        context.root,
        "doc_20260920_777",
        { document, baseUpdatedAt: at(0).toISOString() },
        at(5),
      ),
    ).toMatchObject({ success: false, status: 404 });
  });

  it("版は30まで残し、古いものから消す", async () => {
    await create();
    // 1秒ずつずらして32回。逐次で回す
    await Array.from({ length: 32 }, (_, i) => i).reduce(
      async (previous, i) => {
        await previous;
        await updateDocument(
          context.root,
          id,
          { document: await readSaved() },
          {},
          new Date(2026, 8, 20, 11, 0, i + 1),
        );
      },
      Promise.resolve(),
    );
    expect(await listDocumentVersions(context.root, id)).toHaveLength(30);
  });

  it("復元も新しい版として残す", async () => {
    await create();
    await updateDocument(
      context.root,
      id,
      { document: await readSaved() },
      { title: "二版目" },
      at(5),
    );
    const [first] = await listDocumentVersions(context.root, id);
    const restored = await restoreDocumentVersion(
      context.root,
      id,
      first?.versionId ?? "",
      at(9),
    );
    expect(restored).toMatchObject({
      success: true,
      summary: { title: "保存の仕組み" },
    });
    expect(await listDocumentVersions(context.root, id)).toHaveLength(2);
    expect(
      await restoreDocumentVersion(context.root, id, "20200101T000000", at(9)),
    ).toMatchObject({ success: false, status: 404 });
  });

  it("読めない版も一覧に残し、理由を添える", async () => {
    await create();
    await mkdir(join(dirOf(), "versions"), { recursive: true });
    await writeFile(join(dirOf(), "versions", "20260920T100000.json"), "{");
    expect(await listDocumentVersions(context.root, id)).toMatchObject([
      { versionId: "20260920T100000", error: expect.stringContaining("JSON") },
    ]);
  });
});

describe("移行期の本文(document.html)", () => {
  const body = '<div class="ds-page"><h1>昔の資料</h1></div>';
  const legacy = async () => {
    await create();
    await rm(join(dirOf(), "document.json"));
    await writeFile(join(dirOf(), "document.html"), body);
  };

  it("document.json が無い資料は html ブロック1つの文書として読め、描画も変わらない", async () => {
    await legacy();
    const read = await readDocument(context.root, id);
    expect(read).toMatchObject({
      success: true,
      document: { sections: [{ heading: "", blocks: [{ type: "html" }] }] },
    });
    const rendered = await renderHandout(
      context.root,
      designDir,
      "document",
      id,
    );
    expect(rendered.success && rendered.html).toContain(body);
  });

  it("初めての保存で document.json を書き、移行前の内容も版に残す", async () => {
    await legacy();
    const read = await readDocument(context.root, id);
    if (!read.success) throw new Error("読めない");
    const saved = await saveDocument(
      context.root,
      id,
      {
        document: { ...read.document, title: "書き直し" },
        baseUpdatedAt: read.document.meta.updatedAt,
      },
      at(5),
    );
    expect(saved.success).toBe(true);
    expect((await readSaved()).title).toBe("書き直し");
    const [version] = await listDocumentVersions(context.root, id);
    expect(version).toMatchObject({ title: "保存の仕組み", sectionCount: 1 });
  });

  it("本文の差し替えは html ブロック1つの文書にして版を積む", async () => {
    await create();
    const updated = await updateDocument(context.root, id, { body }, {}, at(5));
    expect(updated).toMatchObject({ success: true });
    expect(await readSaved()).toMatchObject({
      sections: [{ blocks: [{ type: "html", props: { html: body } }] }],
    });
    expect(await listDocumentVersions(context.root, id)).toHaveLength(1);
  });
});
