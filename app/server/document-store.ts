import { join } from "node:path";
import type { HandoutSummary, VersionSummary } from "../src/api/types.ts";
import {
  checkDocument,
  checkDocumentBody,
  type DocumentFile,
} from "../src/schema/document.ts";
import type { HandoutMeta } from "../src/schema/handout.ts";
import { documentImageSrcs, withImageSrcs } from "./document-images.ts";
import {
  documentFromBody,
  documentPathOf,
  documentVersionsDir,
  readDocumentSource,
  withMeta,
} from "./document-source.ts";
import {
  assetsDirOf,
  type PreparedImage,
  prepareImages,
  storeImages,
} from "./handout-assets.ts";
import {
  fail,
  readMeta,
  resolveTemplateId,
  type StoreResult,
  summarizeDocument,
  writeMeta,
} from "./handout-store.ts";
import { claimHandoutDir } from "./handouts.ts";
import { readLocale } from "./profile.ts";
import {
  archiveFileTo,
  isVersionId,
  listVersionIdsIn,
  pruneVersionsIn,
} from "./save.ts";
import { versionSavedAt, versionSource } from "./versions.ts";
import { readJsonFile, writeJsonAtomic } from "./workspace.ts";

// HTML 資料の保存と履歴。正本は document.json で、保存のたびに現行を versions/ へ積む。
// title と template は meta.json を正とし、document.json へ書き戻す

type Saved = StoreResult<{
  summary: HandoutSummary;
  document: DocumentFile;
  // 保存は止めない知らせ(大きな画像など)
  warnings?: readonly string[];
}>;

export type DocumentContent =
  // baseDir は JSON のファイルの場所。assets/ に無い画像を、ここからの相対パスで取り込む。
  // 手元のファイルを読むので、渡すのはローカルの CLI だけ。HTTP の API の受け口(strictObject)には無い
  | { document: unknown; baseDir?: string }
  // 移行期の受け口。本文の断片は html ブロック1つの文書にして保存する
  | { body: string };

// 入力の中身を、検査を通った文書にする。body は meta を使って包む
const resolveContent = (
  content: DocumentContent,
  meta: HandoutMeta,
): StoreResult<{ doc: DocumentFile }> => {
  if ("body" in content) {
    const checked = checkDocumentBody(content.body);
    return checked.success
      ? { success: true, doc: documentFromBody(meta, content.body) }
      : fail(422, checked.message);
  }
  const checked = checkDocument(content.document);
  return checked.success
    ? { success: true, doc: checked.document }
    : fail(422, checked.message);
};

// 画像の取り込み。先に読んで確かめ(prepare)、資料の場所が決まってから assets/ へ写す(store)
type PreparedDocument = StoreResult<{
  doc: DocumentFile;
  images: readonly PreparedImage[];
  warnings: readonly string[];
}>;

const prepareDocumentImages = async (
  doc: DocumentFile,
  content: DocumentContent,
  assetsDir: string | undefined,
): Promise<PreparedDocument> => {
  const prepared = await prepareImages(documentImageSrcs(doc), {
    ...(assetsDir ? { assetsDir } : {}),
    ...("baseDir" in content && content.baseDir
      ? { baseDir: content.baseDir }
      : {}),
  });
  return prepared.success
    ? {
        success: true,
        doc,
        images: prepared.images,
        warnings: prepared.warnings,
      }
    : fail(422, prepared.message);
};

const importDocumentImages = async (
  prepared: { doc: DocumentFile; images: readonly PreparedImage[] },
  assetsDir: string,
): Promise<DocumentFile> =>
  withImageSrcs(prepared.doc, await storeImages(prepared.images, assetsDir));

const nextTitle = (
  requested: string | undefined,
  doc: DocumentFile,
  fallback: string,
): string => requested?.trim() || doc.title.trim() || fallback;

// 版を積んで document.json を置き、meta.json を合わせる。document.json が無い資料は、
// 読み替えた文書を先に書いてから写す(移行前の本文も版に残る)
const persist = async (
  root: string,
  meta: HandoutMeta,
  legacyDoc: DocumentFile | undefined,
  doc: DocumentFile,
  title: string,
  now: Date,
): Promise<{ meta: HandoutMeta; document: DocumentFile }> => {
  const path = documentPathOf(root, meta.id);
  const next: HandoutMeta = { ...meta, title, updatedAt: now.toISOString() };
  const saved = withMeta(doc, next);
  if (legacyDoc) await writeJsonAtomic(path, legacyDoc);
  await archiveFileTo(documentVersionsDir(root, meta.id), path, now);
  await writeJsonAtomic(path, saved);
  await pruneVersionsIn(documentVersionsDir(root, meta.id));
  await writeMeta(root, "document", next);
  return { meta: next, document: saved };
};

export const createDocument = async (
  root: string,
  designDir: string,
  input: DocumentContent & { title?: string; templateId?: string },
  now: Date,
): Promise<Saved> => {
  const template = await resolveTemplateId(
    designDir,
    "document",
    input.templateId,
  );
  if (!template)
    return fail(404, `テンプレートが見つからない: ${input.templateId}`);
  const timestamp = now.toISOString();
  const draft: HandoutMeta = {
    id: "",
    title: input.title?.trim() ?? "",
    template,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const content = resolveContent(input, draft);
  if (!content.success) return content;
  const title = nextTitle(input.title, content.doc, "");
  if (!title) return fail(400, "資料名を入れる");
  const prepared = await prepareDocumentImages(content.doc, input, undefined);
  if (!prepared.success) return prepared;
  const id = await claimHandoutDir(root, "document", now);
  const meta: HandoutMeta = { ...draft, id, title };
  const imported = await importDocumentImages(
    prepared,
    assetsDirOf(root, "document", id),
  );
  // JSON に無ければ設定の言語を入れる
  const document = withMeta(
    {
      ...imported,
      meta: { ...imported.meta, createdAt: timestamp },
      lang: imported.lang ?? (await readLocale(root)),
    },
    meta,
  );
  await writeJsonAtomic(documentPathOf(root, id), document);
  await writeMeta(root, "document", meta);
  return {
    success: true,
    summary: await summarizeDocument(root, id, meta),
    document,
    warnings: prepared.warnings,
  };
};

// 現行の中身を読んで版を積み、差し替える。外で書き換わっていないかの確認は base が決める
const replaceDocument = async (
  root: string,
  id: string,
  content: DocumentContent,
  options: { title?: string; baseUpdatedAt?: string },
  now: Date,
): Promise<Saved> => {
  const meta = await readMeta(root, "document", id);
  if (meta.state !== "ready") return fail(404, "HTML 資料が見つからない");
  const checked = resolveContent(content, meta.value);
  if (!checked.success) return checked;
  if ("document" in content && checked.doc.id !== id) {
    return fail(
      422,
      `document の id "${checked.doc.id}" が資料の id "${id}" と違う`,
    );
  }
  const source = await readDocumentSource(root, meta.value);
  if (source.state === "missing") return fail(404, "資料の中身が見つからない");
  if (options.baseUpdatedAt !== undefined) {
    // 読み込んだあとにファイルが外で書き換えられていたら上書きしない
    if (
      source.state === "invalid" ||
      source.doc.meta.updatedAt !== options.baseUpdatedAt
    ) {
      return fail(
        409,
        "document.json が画面で読み込んだあとに書き換えられている。読み直してから保存する",
      );
    }
  }
  const assetsDir = assetsDirOf(root, "document", id);
  const prepared = await prepareDocumentImages(checked.doc, content, assetsDir);
  if (!prepared.success) return prepared;
  const legacyDoc =
    source.state === "ready" && source.legacy ? source.doc : undefined;
  // 言語は作成のときに決まった値を保つ。直す JSON に lang があっても無視する
  const lang = source.state === "ready" ? source.doc.lang : undefined;
  const imported = {
    ...(await importDocumentImages(prepared, assetsDir)),
    lang,
  };
  const result = await persist(
    root,
    meta.value,
    legacyDoc,
    imported,
    nextTitle(options.title, checked.doc, meta.value.title),
    now,
  );
  return {
    success: true,
    summary: await summarizeDocument(root, id, result.meta),
    document: result.document,
    warnings: prepared.warnings,
  };
};

// 画面の保存。baseUpdatedAt が今の document.json と違えば 409
export const saveDocument = (
  root: string,
  id: string,
  input: { document: unknown; baseUpdatedAt: string },
  now: Date,
): Promise<Saved> =>
  replaceDocument(
    root,
    id,
    { document: input.document },
    { baseUpdatedAt: input.baseUpdatedAt },
    now,
  );

// CLI の差し替え。書き換えの確認は持たず、上書きされた版は versions/ に残る
export const updateDocument = (
  root: string,
  id: string,
  content: DocumentContent,
  options: { title?: string },
  now: Date,
): Promise<Saved> => replaceDocument(root, id, content, options, now);

// 画面が読む文書。document.json が無い資料は html ブロック1つの文書として返す
export const readDocument = async (
  root: string,
  id: string,
): Promise<StoreResult<{ document: DocumentFile }>> => {
  const meta = await readMeta(root, "document", id);
  if (meta.state !== "ready") return fail(404, "HTML 資料が見つからない");
  const source = await readDocumentSource(root, meta.value);
  if (source.state === "missing") return fail(404, "資料の中身が見つからない");
  if (source.state === "invalid") return fail(422, source.message);
  return { success: true, document: source.doc };
};

// ---------- 履歴 ----------

const versionPath = (root: string, id: string, versionId: string): string =>
  join(documentVersionsDir(root, id), `${versionId}.json`);

type VersionFile =
  | { state: "missing" }
  | { state: "ready"; document: DocumentFile }
  | { state: "invalid"; message: string };

const readVersion = async (
  root: string,
  id: string,
  versionId: string,
): Promise<VersionFile> => {
  if (!isVersionId(versionId)) return { state: "missing" };
  const file = await readJsonFile(versionPath(root, id, versionId), (input) => {
    const checked = checkDocument(input);
    return checked.success
      ? { success: true as const, value: checked.document }
      : { success: false as const, message: checked.message };
  });
  return file.state === "ready"
    ? { state: "ready", document: file.value }
    : file;
};

// 読めない版も一覧から消さず、理由を添える
export const listDocumentVersions = async (
  root: string,
  id: string,
): Promise<VersionSummary[]> =>
  Promise.all(
    (await listVersionIdsIn(documentVersionsDir(root, id))).map(
      async (versionId) => {
        const file = await readVersion(root, id, versionId);
        const base = {
          versionId,
          savedAt: versionSavedAt(versionId),
          source: versionSource(versionId),
        };
        return file.state === "ready"
          ? {
              ...base,
              title: file.document.title,
              sectionCount: file.document.sections.length,
            }
          : {
              ...base,
              error:
                file.state === "invalid" ? file.message : "版が見つからない",
            };
      },
    ),
  );

export const readDocumentVersion = async (
  root: string,
  id: string,
  versionId: string,
): Promise<StoreResult<{ document: DocumentFile }>> => {
  const file = await readVersion(root, id, versionId);
  if (file.state === "missing") return fail(404, "版が見つからない");
  if (file.state === "invalid") return fail(422, file.message);
  return { success: true, document: file.document };
};

// 復元も新しい版として残す(現行を versions/ へ写してから書く)
export const restoreDocumentVersion = async (
  root: string,
  id: string,
  versionId: string,
  now: Date,
): Promise<Saved> => {
  const version = await readDocumentVersion(root, id, versionId);
  if (!version.success) return version;
  return replaceDocument(root, id, { document: version.document }, {}, now);
};
