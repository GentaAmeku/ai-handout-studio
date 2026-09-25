import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HandoutDetail, HandoutSummary } from "../src/api/types.ts";
import type { SheetBase } from "../src/schema/design.ts";
import { type HandoutMeta, handoutMetaSchema } from "../src/schema/handout.ts";
import type { Locale } from "../src/schema/profile.ts";
import {
  type SheetAnswers,
  type SheetDocument,
  sheetAnswersSchema,
  sheetDocumentSchema,
} from "../src/schema/sheet.ts";
import { readDocumentSource } from "./document-source.ts";
import {
  assetsDirOf,
  loadImageDataUrls,
  prepareImages,
  storeImages,
} from "./handout-assets.ts";
import {
  type FontSource,
  hasTemplateCss,
  renderDocumentHtml,
  renderSheetHtml,
  sheetBaseOf,
} from "./handout-html.ts";
import {
  claimHandoutDir,
  exportDirOf,
  exportFileName,
  type HandoutKind,
  handoutDir,
  listHandoutIds,
  metaPathOf,
} from "./handouts.ts";
import { readLocale } from "./profile.ts";
import { sheetWarnings } from "./sheet-check.ts";
import { sheetImageSrcs, withSheetImageSrcs } from "./sheet-images.ts";
import {
  type JsonFile,
  readJsonFile,
  readProfile,
  resolveSurfaceTemplate,
  writeJsonAtomic,
} from "./workspace.ts";

// 質問票と HTML 資料の一覧・テンプレートの入れ替え・書き出し。
// 質問票の保存はここ、HTML 資料の保存と履歴は document-store.ts

export const questionsPathOf = (root: string, id: string): string =>
  join(handoutDir(root, "sheet", id), "questions.json");

export const answersPathOf = (root: string, id: string): string =>
  join(handoutDir(root, "sheet", id), "answers.json");

export type StoreFailure = {
  success: false;
  status: 400 | 404 | 409 | 422;
  message: string;
};

export type StoreResult<T> = ({ success: true } & T) | StoreFailure;

export const fail = (
  status: StoreFailure["status"],
  message: string,
): StoreFailure => ({
  success: false,
  status,
  message,
});

export const readMeta = (
  root: string,
  kind: HandoutKind,
  id: string,
): Promise<JsonFile<HandoutMeta>> =>
  readJsonFile(metaPathOf(root, kind, id), (input) => {
    const result = handoutMetaSchema.safeParse(input);
    return result.success
      ? { success: true as const, value: result.data }
      : { success: false as const, message: result.error.message };
  });

export const readSheetDocument = (
  root: string,
  id: string,
): Promise<JsonFile<SheetDocument>> =>
  readJsonFile(questionsPathOf(root, id), (input) => {
    const result = sheetDocumentSchema.safeParse(input);
    return result.success
      ? { success: true as const, value: result.data }
      : { success: false as const, message: result.error.message };
  });

export const readSheetAnswers = (
  root: string,
  id: string,
): Promise<JsonFile<SheetAnswers>> =>
  readJsonFile(answersPathOf(root, id), (input) => {
    const result = sheetAnswersSchema.safeParse(input);
    return result.success
      ? { success: true as const, value: result.data }
      : { success: false as const, message: result.error.message };
  });

const summarizeSheet = async (
  root: string,
  id: string,
  meta: HandoutMeta,
  templateError?: string,
): Promise<HandoutSummary> => {
  const [doc, answers] = await Promise.all([
    readSheetDocument(root, id),
    readSheetAnswers(root, id),
  ]);
  return {
    kind: "sheet",
    id,
    title: meta.title,
    template: meta.template,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    ...(doc.state === "ready"
      ? { questionCount: doc.value.questions.length }
      : {}),
    ...(doc.state === "invalid" ? { error: doc.message } : {}),
    ...(doc.state === "missing" ? { error: "questions.json が無い" } : {}),
    ...(templateError ? { error: templateError } : {}),
    hasAnswers: answers.state === "ready",
  };
};

export const summarizeDocument = async (
  root: string,
  id: string,
  meta: HandoutMeta,
  templateError?: string,
): Promise<HandoutSummary> => {
  const source = await readDocumentSource(root, meta);
  return {
    kind: "document",
    id,
    title: meta.title,
    template: meta.template,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    ...(source.state === "missing" ? { error: "document.json が無い" } : {}),
    ...(source.state === "invalid" ? { error: source.message } : {}),
    ...(templateError ? { error: templateError } : {}),
  };
};

// 消したテンプレートを指したままの資料。書き出せないので、一覧でも理由を出す
const missingTemplate = (template: string): string =>
  `テンプレートが見つからない: ${template}。別のテンプレートを選ぶ`;

const summarize = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
  meta: HandoutMeta,
): Promise<HandoutSummary> => {
  const templateError = (await hasTemplateCss(designDir, kind, meta.template))
    ? undefined
    : missingTemplate(meta.template);
  if (kind === "document") {
    return summarizeDocument(root, id, meta, templateError);
  }
  // 資料の1件のページに出す、いま効いているレイアウト(控えの layout か、テンプレートの既定)
  const [summary, layout] = await Promise.all([
    summarizeSheet(root, id, meta, templateError),
    sheetBaseOf(designDir, meta.template, meta.layout),
  ]);
  return { ...summary, layout };
};

// meta.json が読めない資料も一覧から消さない。並びは更新日の新しい順
export const listHandouts = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
): Promise<HandoutSummary[]> => {
  const ids = await listHandoutIds(root, kind);
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const meta = await readMeta(root, kind, id);
      return meta.state === "ready"
        ? summarize(root, designDir, kind, id, meta.value)
        : ({
            kind,
            id,
            title: id,
            template: "default",
            createdAt: "",
            updatedAt: "",
            error: meta.state === "invalid" ? meta.message : "meta.json が無い",
          } satisfies HandoutSummary);
    }),
  );
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const readHandout = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
): Promise<HandoutDetail | undefined> => {
  const meta = await readMeta(root, kind, id);
  if (meta.state !== "ready") return undefined;
  return summarize(root, designDir, kind, id, meta.value);
};

// テンプレート。指定が無ければ区分の既定を使う
export const resolveTemplateId = async (
  designDir: string,
  kind: HandoutKind,
  templateId: string | undefined,
): Promise<string | undefined> =>
  resolveSurfaceTemplate(designDir, kind, templateId);

export const writeMeta = (
  root: string,
  kind: HandoutKind,
  meta: HandoutMeta,
): Promise<void> => writeJsonAtomic(metaPathOf(root, kind, meta.id), meta);

export type CreateSheetInput = {
  questions: unknown;
  title?: string;
  templateId?: string;
  // 骨格(レイアウト)。無ければテンプレートの既定のまま
  layout?: SheetBase;
  // 質問 JSON のファイルの場所。assets/ に無い画像を、ここからの相対パスで取り込む
  baseDir?: string;
};

export const createSheet = async (
  root: string,
  designDir: string,
  input: CreateSheetInput,
  now: Date,
): Promise<StoreResult<{ summary: HandoutSummary; warnings: string[] }>> => {
  const doc = sheetDocumentSchema.safeParse(input.questions);
  if (!doc.success)
    return fail(422, `質問 JSON が正しくない\n${doc.error.message}`);
  const template = await resolveTemplateId(
    designDir,
    "sheet",
    input.templateId,
  );
  if (!template)
    return fail(404, `テンプレートが見つからない: ${input.templateId}`);
  const images = await prepareImages(sheetImageSrcs(doc.data), {
    ...(input.baseDir ? { baseDir: input.baseDir } : {}),
  });
  if (!images.success) return fail(422, images.message);
  const id = await claimHandoutDir(root, "sheet", now);
  const withImages = withSheetImageSrcs(
    doc.data,
    await storeImages(images.images, assetsDirOf(root, "sheet", id)),
  );
  // JSON に無ければ設定の言語を入れる
  const saved = {
    ...withImages,
    lang: withImages.lang ?? (await readLocale(root)),
  };
  const timestamp = now.toISOString();
  const meta: HandoutMeta = {
    id,
    title: input.title?.trim() || doc.data.title,
    template,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.layout ? { layout: input.layout } : {}),
  };
  await writeJsonAtomic(questionsPathOf(root, id), saved);
  await writeMeta(root, "sheet", meta);
  return {
    success: true,
    summary: await summarizeSheet(root, id, meta),
    warnings: [...sheetWarnings(saved), ...images.warnings],
  };
};

export const updateSheetQuestions = async (
  root: string,
  id: string,
  questions: unknown,
  now: Date,
  // 質問 JSON のファイルの場所。画像の取り込みに使う
  baseDir?: string,
): Promise<StoreResult<{ summary: HandoutSummary; warnings: string[] }>> => {
  const meta = await readMeta(root, "sheet", id);
  if (meta.state !== "ready") return fail(404, "質問票が見つからない");
  const parsed = sheetDocumentSchema.safeParse(questions);
  if (!parsed.success)
    return fail(422, `質問 JSON が正しくない\n${parsed.error.message}`);
  // 言語は作成のときに決まった値を保つ。直す JSON に lang があっても無視する
  const current = await readSheetDocument(root, id);
  const lang = current.state === "ready" ? current.value.lang : undefined;
  const assetsDir = assetsDirOf(root, "sheet", id);
  const images = await prepareImages(sheetImageSrcs(parsed.data), {
    assetsDir,
    ...(baseDir ? { baseDir } : {}),
  });
  if (!images.success) return fail(422, images.message);
  const doc = {
    data: {
      ...withSheetImageSrcs(
        parsed.data,
        await storeImages(images.images, assetsDir),
      ),
      lang,
    },
  };
  const next: HandoutMeta = {
    ...meta.value,
    title: doc.data.title,
    updatedAt: now.toISOString(),
  };
  await writeJsonAtomic(questionsPathOf(root, id), doc.data);
  await writeMeta(root, "sheet", next);
  return {
    success: true,
    summary: await summarizeSheet(root, id, next),
    warnings: [...sheetWarnings(doc.data), ...images.warnings],
  };
};

// レイアウト(骨格)だけを差し替える。質問は変えない(88。`sheet update <id> --layout …` は
// --questions なしでも回る)
export const updateSheetLayout = async (
  root: string,
  id: string,
  layout: SheetBase,
  now: Date,
): Promise<StoreResult<{ summary: HandoutSummary }>> => {
  const meta = await readMeta(root, "sheet", id);
  if (meta.state !== "ready") return fail(404, "質問票が見つからない");
  const next: HandoutMeta = {
    ...meta.value,
    layout,
    updatedAt: now.toISOString(),
  };
  await writeMeta(root, "sheet", next);
  return { success: true, summary: await summarizeSheet(root, id, next) };
};

export const saveSheetAnswers = async (
  root: string,
  id: string,
  answers: unknown,
  now: Date,
): Promise<StoreResult<{ summary: HandoutSummary }>> => {
  const meta = await readMeta(root, "sheet", id);
  if (meta.state !== "ready") return fail(404, "質問票が見つからない");
  const parsed = sheetAnswersSchema.safeParse(answers);
  if (!parsed.success) {
    return fail(422, `回答 JSON が正しくない\n${parsed.error.message}`);
  }
  const doc = await readSheetDocument(root, id);
  if (doc.state === "ready" && doc.value.revision !== parsed.data.revision) {
    return fail(
      422,
      `回答の版 "${parsed.data.revision}" が質問の版 "${doc.value.revision}" と違う`,
    );
  }
  const next: HandoutMeta = { ...meta.value, updatedAt: now.toISOString() };
  await writeJsonAtomic(answersPathOf(root, id), parsed.data);
  await writeMeta(root, "sheet", next);
  return { success: true, summary: await summarizeSheet(root, id, next) };
};

// テンプレートの入れ替え。中身はそのままで、meta.json の template だけを書く
export const setHandoutTemplate = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
  templateId: string,
  now: Date,
): Promise<StoreResult<{ summary: HandoutSummary }>> => {
  const meta = await readMeta(root, kind, id);
  if (meta.state !== "ready") return fail(404, "資料が見つからない");
  const template = await resolveTemplateId(designDir, kind, templateId);
  if (!template) return fail(404, `テンプレートが見つからない: ${templateId}`);
  const next: HandoutMeta = {
    ...meta.value,
    template,
    updatedAt: now.toISOString(),
  };
  await writeMeta(root, kind, next);
  return {
    success: true,
    summary: await summarize(root, designDir, kind, id, next),
  };
};

// 設定の組織名。空なら出さない
export const readOrgName = async (root: string): Promise<string | undefined> =>
  (await readProfile(root))?.orgName || undefined;

// テンプレートを当てた1枚の HTML。画面の見本も書き出しも中身は同じ。書体の読み方だけ渡し分ける。
// share は共有用の束。質問票だけ、「ファイルで保存」を出さない印を付ける。
// lang は資料が持つ画面の文言の言語。プレビューの CSP(質問票のスクリプトの指紋)がこれを読む
export const renderHandout = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
  fonts: FontSource = "hosted",
  share = false,
  // 編集画面のプレビュー。章ごとに読む資料でも全章を流す
  editing = false,
): Promise<StoreResult<{ html: string; title: string; lang: Locale }>> => {
  const meta = await readMeta(root, kind, id);
  if (meta.state !== "ready") return fail(404, "資料が見つからない");
  if (!(await hasTemplateCss(designDir, kind, meta.value.template))) {
    return fail(422, missingTemplate(meta.value.template));
  }
  const orgName = await readOrgName(root);
  if (kind === "document") {
    const source = await readDocumentSource(root, meta.value);
    if (source.state === "missing") return fail(422, "document.json が無い");
    if (source.state === "invalid") return fail(422, source.message);
    return {
      success: true,
      title: meta.value.title,
      lang: source.doc.lang ?? "ja",
      html: await renderDocumentHtml({
        designDir,
        template: meta.value.template,
        title: meta.value.title,
        doc: source.doc,
        orgName,
        fonts,
        assetsDir: assetsDirOf(root, "document", id),
        paging: !editing,
      }),
    };
  }
  const doc = await readSheetDocument(root, id);
  if (doc.state === "missing") return fail(422, "questions.json が無い");
  if (doc.state === "invalid") return fail(422, doc.message);
  const answers = await readSheetAnswers(root, id);
  return {
    success: true,
    title: meta.value.title,
    lang: doc.value.lang ?? "ja",
    html: await renderSheetHtml({
      designDir,
      template: meta.value.template,
      // 画像は assets/ から読んで data: で埋め込む
      doc: withSheetImageSrcs(
        doc.value,
        await loadImageDataUrls(
          sheetImageSrcs(doc.value),
          assetsDirOf(root, "sheet", id),
        ),
      ),
      ...(meta.value.layout ? { layout: meta.value.layout } : {}),
      ...(answers.state === "ready" ? { answers: answers.value } : {}),
      orgName,
      fonts,
      share,
    }),
  };
};

// 書き出し。out を渡せばその場所へ、渡さなければ exports/<日時>/ へ置く。
// 1ファイルで持ち運ぶので、画面と違って書体は Google Fonts の link のまま
export const exportHandout = async (
  root: string,
  designDir: string,
  kind: HandoutKind,
  id: string,
  now: Date,
  out?: string,
): Promise<StoreResult<{ path: string }>> => {
  const rendered = await renderHandout(root, designDir, kind, id, "external");
  if (!rendered.success) return rendered;
  const path =
    out ?? join(exportDirOf(root, kind, id, now), exportFileName(id, now));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rendered.html, "utf8");
  return { success: true, path };
};
