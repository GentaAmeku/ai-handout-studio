import { platform } from "node:process";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type {
  ApiErrorBody,
  DocumentVersionDetail,
  HandoutExportResult,
  ShareApiResult,
} from "../src/api/types.ts";
import { isTemplateName } from "../src/schema/design.ts";
import type { Locale } from "../src/schema/profile.ts";
import {
  createDocumentAiRequest,
  readDocumentAiPatch,
  renderDocumentAiPreview,
} from "./document-ai.ts";
import { documentScriptHash } from "./document-client.ts";
import {
  createDocument,
  listDocumentVersions,
  readDocument,
  readDocumentVersion,
  restoreDocumentVersion,
  saveDocument,
  updateDocument,
} from "./document-store.ts";
import { setFavorite, withFavorites } from "./favorites.ts";
import {
  createSheet,
  exportHandout,
  listHandouts,
  readHandout,
  renderHandout,
  type StoreResult,
  saveSheetAnswers,
  setHandoutTemplate,
  updateSheetQuestions,
} from "./handout-store.ts";
import { deleteHandoutDir, type HandoutKind, isHandoutId } from "./handouts.ts";
import { openFolderCommand } from "./open-folder.ts";
import {
  buildShareBundle,
  formatShareRequest,
  readShareState,
} from "./share.ts";
import { sheetScriptHash } from "./sheet-client.ts";
import { versionSavedAt } from "./versions.ts";

// 質問票と HTML 資料の API。経路は /api/sheets/… と /api/documents/…。
// 質問票は保存・一覧・テンプレートの入れ替え・書き出しだけ。HTML 資料は document.json の保存と履歴も持つ

// 見本は同じオリジンの中身だけで描く。外への通信(画像)は止め、書体は self(design build が写したもの)だけ読む
const PREVIEW_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'";

// 質問票は質問を移動する、HTML 資料はコードブロックをコピーする小さなスクリプトを埋めている。
// 許すのはその指紋1つだけで、中身に紛れ込んだ script(HTML 資料の生の HTML を含む)は動かない。
// 質問票のスクリプトは言語ごとに中身が違うので、指紋も資料の言語で決める
const previewCsp = (kind: HandoutKind, lang: Locale): string =>
  `${PREVIEW_CSP}; script-src ${kind === "sheet" ? sheetScriptHash(lang) : documentScriptHash()}`;

const errorBody = (error: string): ApiErrorBody => ({ error });

const idPath = (base: string): string => `${base}/:id`;

// 経路は :id を必ず持ち、形は guard が確かめている
const paramId = (c: Context): string => c.req.param("id") ?? "";

const readJsonBody = async (c: Context): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

const templateId = z
  .string()
  .refine(isTemplateName, "テンプレートの id が正しくない");

const templateBody = z.strictObject({ template: templateId });

const createSheetBody = z.strictObject({
  questions: z.unknown(),
  title: z.string().trim().max(100).optional(),
  template: templateId.optional(),
});

const updateSheetBody = z.strictObject({ questions: z.unknown() });

// 中身は document(document.json)か body(移行期の本文の断片)のどちらか1つ
const createDocumentBody = z
  .strictObject({
    title: z.string().trim().max(100).optional(),
    document: z.unknown().optional(),
    body: z.string().optional(),
    template: templateId.optional(),
  })
  .refine(
    (value) => (value.document === undefined) !== (value.body === undefined),
    {
      message: "document か body のどちらか1つを渡す",
    },
  );

const updateDocumentSchema = z
  .strictObject({
    title: z.string().trim().max(100).optional(),
    document: z.unknown().optional(),
    body: z.string().optional(),
    // 画面の保存が渡す。document.json を読んだときの meta.updatedAt
    baseUpdatedAt: z.string().min(1).optional(),
  })
  .refine(
    (value) => (value.document === undefined) !== (value.body === undefined),
    {
      message: "document か body のどちらか1つを渡す",
    },
  )
  .refine(
    (value) =>
      value.document === undefined || value.baseUpdatedAt !== undefined,
    {
      message: "document を保存するときは baseUpdatedAt を渡す",
    },
  );

export type HandoutApiOptions = {
  repoRoot: string;
  workspaceRoot: string;
  designDir: string;
  now: () => Date;
};

const respond = <T extends { summary: unknown }>(
  c: Context,
  result: StoreResult<T>,
  status: 200 | 201 = 200,
) =>
  result.success
    ? c.json(result.summary, status)
    : c.json(errorBody(result.message), result.status);

// 区分で変わらない経路。一覧・取得・削除・テンプレートの入れ替え・見本・書き出し
const registerShared = (
  app: Hono,
  kind: HandoutKind,
  base: string,
  { workspaceRoot, designDir, now }: HandoutApiOptions,
): void => {
  const guard = async (c: Context, next: () => Promise<void>) => {
    if (!isHandoutId(kind, paramId(c))) {
      return c.json(errorBody("資料の id の形が正しくない"), 400);
    }
    await next();
  };
  app.use(`${base}/:id`, guard);
  app.use(`${base}/:id/*`, guard);

  app.get(base, async (c) =>
    c.json(
      await withFavorites(
        workspaceRoot,
        await listHandouts(workspaceRoot, designDir, kind),
        (summary) => summary.id,
      ),
    ),
  );

  app.get(`${base}/:id`, async (c) => {
    const id = paramId(c);
    const detail = await readHandout(workspaceRoot, designDir, kind, id);
    if (!detail) return c.json(errorBody("資料が見つからない"), 404);
    // 公開した URL(share.json)を1件の詳細にだけ足す。一覧では読まない
    const share = await readShareState(workspaceRoot, kind, id);
    return c.json({ ...detail, shareUrl: share?.url ?? null });
  });

  // 消した資料はお気に入りからも外す
  app.delete(`${base}/:id`, async (c) => {
    const id = paramId(c);
    if (!(await deleteHandoutDir(workspaceRoot, kind, id))) {
      return c.json(errorBody("資料が見つからない"), 404);
    }
    await setFavorite(workspaceRoot, id, false);
    return c.json({ id });
  });

  // テンプレートの入れ替え。中身はそのままで見た目だけが替わる
  app.put(`${base}/:id/template`, async (c) => {
    const body = templateBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    return respond(
      c,
      await setHandoutTemplate(
        workspaceRoot,
        designDir,
        kind,
        paramId(c),
        body.data.template,
        now(),
      ),
    );
  });

  // 画面の見本。書き出すものと同じ1枚の HTML を、外への通信を止めて返す
  app.get(`${base}/:id/preview`, async (c) => {
    const result = await renderHandout(
      workspaceRoot,
      designDir,
      kind,
      paramId(c),
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    return c.body(result.html, 200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-security-policy": previewCsp(kind, result.lang),
      "cache-control": "no-store",
    });
  });

  app.post(`${base}/:id/exports`, async (c) => {
    const id = paramId(c);
    const result = await exportHandout(
      workspaceRoot,
      designDir,
      kind,
      id,
      now(),
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const body: HandoutExportResult = {
      kind,
      id,
      path: result.path,
      // 書き出したファイルの入ったフォルダを開くコマンド。ファイルはサーバーの PC に
      // あるので、画面ではなくサーバーの OS に合わせて作る
      openCommand: openFolderCommand(result.path, platform),
    };
    return c.json(body);
  });

  // 画面の「共有の依頼をコピー」。127 の関数で束を作り直し、Claude Code へ渡す依頼文を返す
  app.post(`${base}/:id/share`, async (c) => {
    const id = paramId(c);
    const result = await buildShareBundle(workspaceRoot, designDir, kind, id);
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const previous = await readShareState(workspaceRoot, kind, id);
    const body: ShareApiResult = {
      bundle: result.bundleDir,
      files: result.files,
      textBytes: result.textBytes,
      ...(result.warning ? { warning: result.warning } : {}),
      url: previous?.url ?? null,
      prompt: formatShareRequest({
        id,
        bundleDir: result.bundleDir,
        files: result.files,
        ...(previous?.url ? { previousUrl: previous.url } : {}),
        ...(result.warning ? { warning: result.warning } : {}),
      }),
    };
    return c.json(body);
  });
};

const registerSheetRoutes = (
  app: Hono,
  base: string,
  { workspaceRoot, designDir, now }: HandoutApiOptions,
): void => {
  app.post(base, async (c) => {
    const body = createSheetBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    return respond(
      c,
      await createSheet(
        workspaceRoot,
        designDir,
        {
          questions: body.data.questions,
          ...(body.data.title ? { title: body.data.title } : {}),
          ...(body.data.template ? { templateId: body.data.template } : {}),
        },
        now(),
      ),
      201,
    );
  });

  // 中身の差し替え。スキルが直した質問 JSON をそのまま置く
  app.put(idPath(base), async (c) => {
    const body = updateSheetBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    return respond(
      c,
      await updateSheetQuestions(
        workspaceRoot,
        paramId(c),
        body.data.questions,
        now(),
      ),
    );
  });

  // 回答の受け取り。質問票スキルが集めた answers.json をそのまま置く
  app.put(`${idPath(base)}/answers`, async (c) =>
    respond(
      c,
      await saveSheetAnswers(
        workspaceRoot,
        paramId(c),
        await readJsonBody(c),
        now(),
      ),
    ),
  );
};

const documentAiBody = z.strictObject({
  sectionId: z.string().min(1),
  instruction: z.string().trim().min(1).max(500),
  target: z.unknown(),
});

const contentOf = (body: {
  document?: unknown;
  body?: string | undefined;
}): { document: unknown } | { body: string } =>
  body.body === undefined ? { document: body.document } : { body: body.body };

const registerDocumentRoutes = (
  app: Hono,
  base: string,
  { repoRoot, workspaceRoot, designDir, now }: HandoutApiOptions,
): void => {
  const respondDocument = (
    c: Context,
    result: Awaited<ReturnType<typeof saveDocument>>,
    status: 200 | 201 = 200,
  ) =>
    result.success
      ? c.json(result.summary, status)
      : c.json(errorBody(result.message), result.status);

  app.post(base, async (c) => {
    const body = createDocumentBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    return respondDocument(
      c,
      await createDocument(
        workspaceRoot,
        designDir,
        {
          ...contentOf(body.data),
          ...(body.data.title ? { title: body.data.title } : {}),
          ...(body.data.template ? { templateId: body.data.template } : {}),
        },
        now(),
      ),
      201,
    );
  });

  // 本文の差し替え。document は baseUpdatedAt つきの画面の保存(外で書き換わっていたら 409)、
  // body は移行期のスキルの差し替え
  app.put(idPath(base), async (c) => {
    const body = updateDocumentSchema.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    const { baseUpdatedAt, title } = body.data;
    return respondDocument(
      c,
      baseUpdatedAt !== undefined && body.data.body === undefined
        ? await saveDocument(
            workspaceRoot,
            paramId(c),
            { document: body.data.document, baseUpdatedAt },
            now(),
          )
        : await updateDocument(
            workspaceRoot,
            paramId(c),
            contentOf(body.data),
            title ? { title } : {},
            now(),
          ),
    );
  });

  // 画面が読む document.json。document.json が無い資料は html ブロック1つで返す
  app.get(`${idPath(base)}/document`, async (c) => {
    const result = await readDocument(workspaceRoot, paramId(c));
    return result.success
      ? c.json(result.document)
      : c.json(errorBody(result.message), result.status);
  });

  // AI の編集案: セクションを指した依頼を作り、エージェントが書いたパッチを検査して返す
  app.post(`${idPath(base)}/ai-requests`, async (c) => {
    const body = documentAiBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    const current = await readDocument(workspaceRoot, paramId(c));
    if (!current.success) {
      return c.json(errorBody(current.message), current.status);
    }
    if (!current.document.sections.some((s) => s.id === body.data.sectionId)) {
      return c.json(errorBody("対象のセクションが見つからない"), 404);
    }
    return c.json(
      await createDocumentAiRequest(
        workspaceRoot,
        repoRoot,
        paramId(c),
        body.data,
        now(),
      ),
      201,
    );
  });

  app.get(`${idPath(base)}/ai-requests/:requestId`, async (c) =>
    c.json(
      await readDocumentAiPatch(
        workspaceRoot,
        paramId(c),
        c.req.param("requestId"),
      ),
    ),
  );

  // 取り込む前の見比べ用。before は依頼したときの姿、after は案を当てた姿
  app.get(`${idPath(base)}/ai-requests/:requestId/preview`, async (c) => {
    const result = await renderDocumentAiPreview(
      workspaceRoot,
      designDir,
      paramId(c),
      c.req.param("requestId"),
      c.req.query("view") === "after" ? "after" : "before",
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    return c.body(result.html, 200, {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-security-policy": PREVIEW_CSP,
      "cache-control": "no-store",
    });
  });

  // 履歴: 一覧・取り出し・復元。復元も新しい版として残す
  app.get(`${idPath(base)}/versions`, async (c) =>
    c.json(await listDocumentVersions(workspaceRoot, paramId(c))),
  );

  app.get(`${idPath(base)}/versions/:versionId`, async (c) => {
    const versionId = c.req.param("versionId");
    const result = await readDocumentVersion(
      workspaceRoot,
      paramId(c),
      versionId,
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const detail: DocumentVersionDetail = {
      versionId,
      savedAt: versionSavedAt(versionId),
      document: result.document,
    };
    return c.json(detail);
  });

  app.post(`${idPath(base)}/versions/:versionId/restore`, async (c) => {
    const result = await restoreDocumentVersion(
      workspaceRoot,
      paramId(c),
      c.req.param("versionId"),
      now(),
    );
    return result.success
      ? c.json(result.document)
      : c.json(errorBody(result.message), result.status);
  });
};

export const registerHandoutRoutes = (
  app: Hono,
  options: HandoutApiOptions,
): void => {
  registerShared(app, "sheet", "/sheets", options);
  registerSheetRoutes(app, "/sheets", options);
  registerShared(app, "document", "/documents", options);
  registerDocumentRoutes(app, "/documents", options);
};
