import { basename, join } from "node:path";
import { platform } from "node:process";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type {
  ApiErrorBody,
  DeckDetail,
  ExportResult,
  FavoriteResult,
  VersionDetail,
} from "../src/api/types.ts";
import { isTemplateName } from "../src/schema/design.ts";
import { type AgentRunner, isAgentId } from "./agent-runs.ts";
import { createAiRequest, readAiPatch } from "./ai-requests.ts";
import { type DesignBuilder, registerDesignRoutes } from "./design-api.ts";
import type { Exporter } from "./exporter.ts";
import { setFavorite, setFavoriteOf, withFavorites } from "./favorites.ts";
import { registerHandoutRoutes } from "./handout-api.ts";
import { openFolderCommand } from "./open-folder.ts";
import { readSettings, resolveSettings, saveProfile } from "./profile.ts";
import { saveDeck } from "./save.ts";
import {
  listVersions,
  readVersionDeck,
  restoreVersion,
  versionSavedAt,
} from "./versions.ts";
import {
  createDeckFromOutline,
  deckDir,
  deleteDeckDir,
  fileStamp,
  isDeckId,
  listDecks,
  readAsset,
  readDeckFile,
  readProfile,
} from "./workspace.ts";

export type ApiOptions = {
  // 依頼ファイルのパス表示とエージェントのコマンドの基点
  repoRoot: string;
  workspaceRoot: string;
  // 既定は repoRoot/design。テストは写しを渡す
  designDir?: string;
  // 無ければ design build は 503 を返す
  designBuilder?: DesignBuilder;
  now?: () => Date;
  // 無ければ書き出しは 503 を返す(API 単体のテスト用)
  exporter?: Exporter;
  // 無ければエージェントの起動は 503 を返す(API 単体のテスト用)
  agentRunner?: AgentRunner;
};

const createDeckBody = z.strictObject({
  outlineId: z.string().refine(isTemplateName, "構成の id が正しくない"),
  templateId: z
    .string()
    .refine(isTemplateName, "テンプレートの id が正しくない")
    .optional(),
  title: z
    .string()
    .trim()
    .min(1, "タイトルを入れる")
    .max(100, "タイトルは100文字以内にする"),
});

const exportBody = z.strictObject({
  format: z.enum(["pdf", "png", "html", "pptx"]),
});

const saveBody = z.strictObject({
  deck: z.unknown(),
  baseUpdatedAt: z.string().min(1),
});

const favoriteBody = z.strictObject({ favorite: z.boolean() });

const aiRequestBody = z.strictObject({
  scope: z.enum(["slide", "deck"]),
  slideId: z.string().min(1).optional(),
  instruction: z.string().trim().min(1, "指示を入れる").max(500),
  // 依頼したときの対象 JSON。未保存の下書きを含む
  target: z.unknown(),
});

const agentRunBody = z.strictObject({
  agent: z.enum(["claude", "codex", "grok"]),
});

const errorBody = (error: string): ApiErrorBody => ({ error });

const readJsonBody = async (c: Context): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
};

export const createApi = ({
  repoRoot,
  workspaceRoot,
  designDir = join(repoRoot, "design"),
  designBuilder,
  now = () => new Date(),
  exporter,
  agentRunner,
}: ApiOptions) => {
  const app = new Hono().basePath("/api");

  app.onError((error, c) => c.json(errorBody(error.message), 500));

  // パスの組み立てに使うので、形の違う deckId はここで止める
  app.use("/decks/:deckId/*", async (c, next) => {
    if (!isDeckId(c.req.param("deckId"))) {
      return c.json(errorBody("資料の id の形が正しくない"), 400);
    }
    await next();
  });

  app.get("/decks", async (c) =>
    c.json(
      await withFavorites(
        workspaceRoot,
        await listDecks(workspaceRoot),
        (summary) => summary.deckId,
      ),
    ),
  );

  // お気に入りの付け外し。スライド・質問票・HTML 資料のどの id も受ける
  app.put("/favorites/:id", async (c) => {
    const id = c.req.param("id");
    const body = favoriteBody.safeParse(await readJsonBody(c));
    if (!body.success)
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    const result = await setFavoriteOf(workspaceRoot, id, body.data.favorite);
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const saved: FavoriteResult = { id, favorite: body.data.favorite };
    return c.json(saved);
  });

  app.post("/decks", async (c) => {
    const body = createDeckBody.safeParse(await readJsonBody(c));
    if (!body.success)
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    const result = await createDeckFromOutline(
      workspaceRoot,
      designDir,
      { ...body.data, lang: (await readSettings(workspaceRoot)).locale },
      now(),
    );
    if (!result.success) {
      return c.json(
        errorBody(
          result.reason === "outline-not-found"
            ? "構成が見つからない"
            : "テンプレートが見つからない",
        ),
        404,
      );
    }
    const detail: DeckDetail = {
      state: "ready",
      deckId: result.deck.id,
      deck: result.deck,
    };
    return c.json(detail, 201);
  });

  app.get("/decks/:deckId", async (c) => {
    const deckId = c.req.param("deckId");
    if (!isDeckId(deckId)) {
      return c.json(errorBody("資料の id の形が正しくない"), 400);
    }
    const file = await readDeckFile(workspaceRoot, deckId);
    if (file.state === "missing") {
      return c.json(errorBody("資料が見つからない"), 404);
    }
    const detail: DeckDetail =
      file.state === "ready"
        ? { state: "ready", deckId, deck: file.value }
        : { state: "invalid", deckId, message: file.message };
    return c.json(detail);
  });

  // 削除: 資料フォルダを丸ごと消す。取り消せないので画面で確かめてから送る
  app.delete("/decks/:deckId", async (c) => {
    const deckId = c.req.param("deckId");
    if (!isDeckId(deckId)) {
      return c.json(errorBody("資料の id の形が正しくない"), 400);
    }
    if (!(await deleteDeckDir(workspaceRoot, deckId))) {
      return c.json(errorBody("資料が見つからない"), 404);
    }
    // 消した資料はお気に入りからも外す
    await setFavorite(workspaceRoot, deckId, false);
    return c.json({ deckId });
  });

  // 保存: 読み込み時の updatedAt と今のファイルが違えば 409
  app.put("/decks/:deckId", async (c) => {
    const deckId = c.req.param("deckId");
    if (!isDeckId(deckId)) {
      return c.json(errorBody("資料の id の形が正しくない"), 400);
    }
    const body = saveBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    const result = await saveDeck(workspaceRoot, deckId, body.data, now());
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const detail: DeckDetail = { state: "ready", deckId, deck: result.deck };
    return c.json(detail);
  });

  app.get("/decks/:deckId/assets/*", async (c) => {
    const deckId = c.req.param("deckId");
    const prefix = `/api/decks/${deckId}/assets/`;
    const assetPath = decodeURIComponent(c.req.path.slice(prefix.length));
    const asset = await readAsset(workspaceRoot, deckId, assetPath);
    if (!asset) return c.json(errorBody("画像が見つからない"), 404);
    return c.body(asset.body, 200, {
      "content-type": asset.contentType,
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    });
  });

  // 書き出し前に検証する。はみ出しは結果に警告として返すだけ
  app.post("/decks/:deckId/exports", async (c) => {
    if (!exporter) {
      return c.json(errorBody("このサーバーでは書き出しを使えない"), 503);
    }
    const body = exportBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    const deckId = c.req.param("deckId");
    const file = await readDeckFile(workspaceRoot, deckId);
    if (file.state === "missing") {
      return c.json(errorBody("資料が見つからない"), 404);
    }
    if (file.state === "invalid") return c.json(errorBody(file.message), 422);
    if (file.value.slides.length === 0) {
      return c.json(errorBody("スライドが0枚の資料は書き出せない"), 422);
    }
    const directory = join(
      deckDir(workspaceRoot, deckId),
      "exports",
      fileStamp(now()),
    );
    const output = await exporter.exportDeck({
      deckId,
      format: body.data.format,
      outDir: directory,
      title: file.value.title,
    });
    // PNG は1枚ずつ別のファイルになる。1つならそのファイル、いくつもあればフォルダを指す
    const [first] = output.files;
    const result: ExportResult = {
      format: body.data.format,
      directory,
      files: output.files.map((path) => basename(path)),
      path: output.files.length === 1 && first ? first : directory,
      // フォルダを開いて、最初のファイルを選んだ状態にする
      openCommand: openFolderCommand(first ?? directory, platform),
      overflow: output.overflow,
    };
    return c.json(result);
  });

  // AI の編集案: 依頼を作り、エージェントが書いたパッチを検証して返す
  app.post("/decks/:deckId/ai-requests", async (c) => {
    const body = aiRequestBody.safeParse(await readJsonBody(c));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    if (body.data.scope === "slide" && !body.data.slideId) {
      return c.json(errorBody("対象のスライドを指定する"), 400);
    }
    const deckId = c.req.param("deckId");
    const file = await readDeckFile(workspaceRoot, deckId);
    if (file.state === "missing") {
      return c.json(errorBody("資料が見つからない"), 404);
    }
    const detail = await createAiRequest(
      workspaceRoot,
      repoRoot,
      deckId,
      body.data,
      now(),
    );
    return c.json(detail, 201);
  });

  app.get("/decks/:deckId/ai-requests/:requestId", async (c) =>
    c.json(
      await readAiPatch(
        workspaceRoot,
        c.req.param("deckId"),
        c.req.param("requestId"),
      ),
    ),
  );

  // エージェントの起動(試作)。同時実行はサーバー全体で 1 件だけ
  app.post("/decks/:deckId/ai-requests/:requestId/runs", async (c) => {
    if (!agentRunner) {
      return c.json(errorBody("このサーバーではエージェントを使えない"), 503);
    }
    const body = agentRunBody.safeParse(await readJsonBody(c));
    if (!body.success || !isAgentId(body.data.agent)) {
      return c.json(errorBody("エージェントの指定が正しくない"), 400);
    }
    const result = await agentRunner.startRun(
      c.req.param("deckId"),
      c.req.param("requestId"),
      body.data.agent,
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    return c.json(result.run, 201);
  });

  app.get("/decks/:deckId/ai-requests/:requestId/runs/:runId", async (c) => {
    if (!agentRunner) {
      return c.json(errorBody("このサーバーではエージェントを使えない"), 503);
    }
    const run = agentRunner.getRun(c.req.param("runId"));
    if (!run) return c.json(errorBody("実行が見つからない"), 404);
    return c.json(run);
  });

  app.post(
    "/decks/:deckId/ai-requests/:requestId/runs/:runId/cancel",
    async (c) => {
      if (!agentRunner) {
        return c.json(errorBody("このサーバーではエージェントを使えない"), 503);
      }
      const run = agentRunner.cancelRun(c.req.param("runId"));
      if (!run) return c.json(errorBody("実行が見つからない"), 404);
      return c.json(run);
    },
  );

  // 履歴: 一覧・取り出し・復元。復元も新しい版として残す
  app.get("/decks/:deckId/versions", async (c) =>
    c.json(await listVersions(workspaceRoot, c.req.param("deckId"))),
  );

  app.get("/decks/:deckId/versions/:versionId", async (c) => {
    const versionId = c.req.param("versionId");
    const result = await readVersionDeck(
      workspaceRoot,
      c.req.param("deckId"),
      versionId,
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const detail: VersionDetail = {
      versionId,
      savedAt: versionSavedAt(versionId),
      deck: result.value,
    };
    return c.json(detail);
  });

  app.post("/decks/:deckId/versions/:versionId/restore", async (c) => {
    const deckId = c.req.param("deckId");
    const result = await restoreVersion(
      workspaceRoot,
      deckId,
      c.req.param("versionId"),
      now(),
    );
    if (!result.success) {
      return c.json(errorBody(result.message), result.status);
    }
    const detail: DeckDetail = { state: "ready", deckId, deck: result.value };
    return c.json(detail);
  });

  // プロフィール: 表示名・組織名。locale は画面の言語(149)が読む。既定値で埋めた形(LANG のフォールバック込み)
  app.get("/profile", async (c) => {
    const [profile, settings] = await Promise.all([
      readProfile(workspaceRoot),
      readSettings(workspaceRoot),
    ]);
    return c.json({ profile: profile ?? null, locale: settings.locale });
  });

  app.put("/profile", async (c) => {
    const result = await saveProfile(workspaceRoot, await readJsonBody(c));
    if (!result.success) return c.json(errorBody(result.message), 400);
    return c.json({
      profile: result.profile,
      locale: resolveSettings(result.profile).locale,
    });
  });

  registerDesignRoutes(
    app,
    designDir,
    designBuilder,
    async () => (await readProfile(workspaceRoot))?.orgName || undefined,
    async () => (await readSettings(workspaceRoot)).locale,
  );
  registerHandoutRoutes(app, { repoRoot, workspaceRoot, designDir, now });

  return app;
};
