import { existsSync } from "node:fs";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";
import type { Connect, Plugin } from "vite";
import { createAgentRunner } from "./agent-runs.ts";
import { type ApiOptions, createApi } from "./api.ts";
import { buildDesignCss } from "./design.ts";
import { buildDesignInProcess } from "./design-build-process.ts";
import { migrateToTemplates } from "./design-migrate.ts";
import { installExamplesIfEmpty } from "./examples.ts";
import { createExporter } from "./exporter.ts";
import { toLoopbackAddress } from "./loopback.ts";
import { migrateProfile, readSettings } from "./profile.ts";
import { guardLocalRequests } from "./request-guard.ts";
import { migrateOutlineDecks } from "./workspace.ts";

type ServerLike = {
  resolvedUrls: { local: string[] } | null;
  httpServer: {
    once: (event: "close", listener: () => void) => unknown;
  } | null;
};

// 開発サーバーとプレビューサーバーの両方に同じ API を載せる
export const aiHandoutStudioApi = (
  options: Omit<ApiOptions, "exporter" | "agentRunner" | "designBuilder">,
): Plugin => {
  const current: { server?: ServerLike } = {};
  // 書き出し用ページは、いま動いているこのサーバー自身から開く
  const exporter = createExporter({
    getOrigin: () => current.server?.resolvedUrls?.local[0],
  });
  const agentRunner = createAgentRunner({
    repoRoot: options.repoRoot,
    workspaceRoot: options.workspaceRoot,
    now: options.now,
  });
  const listener = getRequestListener(
    createApi({
      ...options,
      exporter,
      agentRunner,
      designBuilder: buildDesignInProcess(options.repoRoot),
    }).fetch,
  );
  const handle: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    void listener(req, res);
  };
  const attach = (
    server: ServerLike & { middlewares: Connect.Server },
  ): void => {
    current.server = server;
    // 別のサイトと LAN のほかの端末からの書き込みを、API より前に断る
    server.middlewares.use(guardLocalRequests);
    server.middlewares.use(toLoopbackAddress);
    server.middlewares.use(handle);
    // 旧いテーマと型(段 I より前)をテンプレートへ移し、
    // 旧い profile.json の色(段 B より前)とテーマ(段 G より前)を design/ へ移す。どちらも起動時に一度だけ。
    // 画面が読む dist/templates.json・slide-templates.css が無ければ(段 I の後の初回)、CSS を作り直す
    const designDir = join(options.repoRoot, "design");
    void migrateToTemplates(designDir).then(async (templates) => {
      if ("error" in templates) {
        console.error(`[ai-handout-studio] ${templates.error}`);
      }
      if (templates.migrated) {
        console.log(
          `[ai-handout-studio] テーマと型をテンプレートへ移した: ${templates.templates.join(", ")}`,
        );
      }
      const moved = await migrateOutlineDecks(options.workspaceRoot, designDir);
      if (moved.length > 0) {
        console.log(
          `[ai-handout-studio] 構成の名前を template に持っていた資料を既定のテンプレートへ直した: ${moved.join(", ")}`,
        );
      }
      const profile = await migrateProfile(options.workspaceRoot, designDir);
      if ("error" in profile)
        console.error(`[ai-handout-studio] ${profile.error}`);
      if (profile.migrated) {
        console.log(
          "[ai-handout-studio] プロフィールの色とテーマを design/ へ移した",
        );
      }
      const missing = ["templates.json", "slide-templates.css"].some(
        (file) => !existsSync(join(designDir, "dist", file)),
      );
      if (templates.migrated || missing) {
        const built = await buildDesignCss(designDir);
        if (!built.success)
          console.error(`[ai-handout-studio] ${built.message}`);
      }
      // 初めて起きたとき(資料が1件も無く、印も無い)だけ、同梱資料を設定の言語で入れる
      const examples = await installExamplesIfEmpty({
        workspaceRoot: options.workspaceRoot,
        repoRoot: options.repoRoot,
        now: options.now?.() ?? new Date(),
      });
      if (!examples.success) {
        console.error(`[ai-handout-studio] ${examples.message}`);
      } else if ("installed" in examples) {
        console.log(
          `[ai-handout-studio] 同梱資料を入れた: ${examples.installed.map((example) => example.id).join(", ")}`,
        );
      }
    });
    server.httpServer?.once("close", () => {
      void exporter.close();
      agentRunner.close();
    });
  };
  return {
    name: "ai-handout-studio-api",
    configureServer: attach,
    configurePreviewServer: attach,
    // 画面の言語は設定の locale で決める(149)。開発サーバーはリクエストごとに
    // <html lang> へ入れ直すので、開き直すだけで切り替わる(サーバーの起こし直しは要らない)。
    // ビルド済みを配るとき(ctx.server が無い)は、画面が起動後に /api/profile の locale で直す
    async transformIndexHtml(html, ctx) {
      if (!ctx.server) return html;
      const { locale } = await readSettings(options.workspaceRoot);
      return html.replace(/(<html[^>]*\blang=")[a-z-]*(")/, `$1${locale}$2`);
    },
  };
};
