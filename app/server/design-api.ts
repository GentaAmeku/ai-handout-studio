import { access, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hono, MiddlewareHandler } from "hono";
import { z } from "zod";
import type {
  ApiErrorBody,
  DesignTemplateDetail,
  DesignTemplateSampleDetail,
  DesignTemplatesDetail,
} from "../src/api/types.ts";
import { resolveTemplate } from "../src/design/theme.ts";
import {
  isTemplateName,
  type Surface,
  selectionSchema,
  surfaceName,
  surfaceNames,
  type Template,
  templateSchemas,
  withTextScale,
} from "../src/schema/design.ts";
import {
  type BuildResult,
  missingInSelection,
  readDesignBase,
  readSelection,
  readSlideSample,
  readTemplate,
  readTemplates,
  samplePath,
  selectionPath,
  templateAssetNames,
  templateAssetsDir,
  templateDir,
  templatePath,
  templateStylePath,
} from "./design.ts";
import { sampleWithOrgName } from "./sample-org.ts";
import { readAssetFrom, writeJsonAtomic } from "./workspace.ts";

// デザインページの API。テンプレートの一覧・取得・保存、区分ごとの既定、部品の変種の追加、build、見本の配信

const saveTemplateBody = z.strictObject({
  template: z.unknown(),
  create: z.boolean().optional(),
  // 複製の元。新しく作るときだけ、元の中身の見本(スライドの sample.json)を写す
  source: z.string().optional(),
});

// 見本の iframe が読むのは samples/ と dist/ の HTML・CSS・書体だけ
const DESIGN_FILE_TYPES: ReadonlyMap<string, string> = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);
const SERVED_DIRS = ["samples", "dist"] as const;

// 見本は同じオリジンの CSS だけで描く。外への通信(フォント・画像)を止める
const SAMPLE_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";

const errorBody = (error: string): ApiErrorBody => ({ error });

// 見本の HTML の区分。samples/slide.html・document.html・sheet.<骨格>.html
const sampleSurface = (file: string): Surface | undefined =>
  surfaceNames.find(
    (surface) => file === `${surface}.html` || file.startsWith(`${surface}.`),
  );

// 見本を別のテンプレートで描く(?template=<名前>)。既定の写し(tokens.css)をそのテンプレートの CSS に替え、
// スライドは専用の CSS の閉じ込め(data-template)もその名前にする
export const sampleForTemplate = (
  html: string,
  surface: Surface,
  name: string,
): string => {
  const linked = html.replaceAll(
    `../dist/${surface}/tokens.css`,
    `../dist/${surface}/${name}.css`,
  );
  return surface === "slide"
    ? linked.replace(/data-template="[^"]*"/g, `data-template="${name}"`)
    : linked;
};

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

export type DesignBuilder = () => Promise<BuildResult>;

export const registerDesignRoutes = (
  app: Hono,
  designDir: string,
  build: DesignBuilder | undefined,
  // 見本に出す設定の組織名。渡さなければ見本から組織名を外す
  readOrgName: () => Promise<string | undefined> = async () => undefined,
): void => {
  // 区分と名前はパスの組み立てに使うので、形の違うものはここで止める
  const checkTarget: MiddlewareHandler = async (c, next) => {
    if (!surfaceName.safeParse(c.req.param("surface")).success) {
      return c.json(errorBody("区分は slide・sheet・document"), 404);
    }
    if (!isTemplateName(c.req.param("name") ?? "")) {
      return c.json(
        errorBody(
          "テンプレートの名前は英小文字・数字・ハイフンにする(tokens は使えない)",
        ),
        400,
      );
    }
    await next();
  };
  app.use("/design/templates/:surface/:name", checkTarget);
  app.use("/design/templates/:surface/:name/*", checkTarget);

  app.get("/design/templates", async (c) => {
    const base = await readDesignBase(designDir);
    if (!base.success) return c.json(errorBody(base.message), 500);
    const selection = await readSelection(designDir);
    if (!selection.success) return c.json(errorBody(selection.message), 500);
    const templates = await readTemplates(designDir);
    if (!templates.success) return c.json(errorBody(templates.message), 500);
    const detail: DesignTemplatesDetail = {
      ...base.base,
      templates: Object.fromEntries(
        surfaceNames.map((surface) => [
          surface,
          Object.entries(templates.value[surface] as Record<string, Template>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, template]) => ({
              name,
              label: template.label,
              ...(template.description
                ? { description: template.description }
                : {}),
            })),
        ]),
      ) as DesignTemplatesDetail["templates"],
      selection: selection.value,
    };
    return c.json(detail);
  });

  // 区分ごとの既定のテンプレート。どれも templates/<区分>/ にあるものを指す
  app.put("/design/selection", async (c) => {
    const selection = selectionSchema.safeParse(await readJsonBody(c.req.raw));
    if (!selection.success) {
      return c.json(errorBody(z.prettifyError(selection.error)), 400);
    }
    const templates = await readTemplates(designDir);
    if (!templates.success) return c.json(errorBody(templates.message), 500);
    const missing = missingInSelection(selection.data, templates.value);
    if (missing) return c.json(errorBody(missing), 400);
    await writeJsonAtomic(selectionPath(designDir), selection.data);
    return c.json(selection.data);
  });

  app.get("/design/templates/:surface/:name", async (c) => {
    const surface = surfaceName.parse(c.req.param("surface"));
    const name = c.req.param("name");
    if (!(await exists(templatePath(designDir, surface, name)))) {
      return c.json(errorBody("テンプレートが見つからない"), 404);
    }
    const template = await readTemplate(designDir, surface, name);
    if (!template.success) return c.json(errorBody(template.message), 500);
    const detail = {
      surface,
      name,
      template: template.value,
    } as DesignTemplateDetail;
    return c.json(detail);
  });

  // テンプレートが持つ中身の見本(sample.json)。一覧のカードと編集画面がこれを描く。
  // 持たないテンプレートは sample を null で返し、画面は共通の見本に落とす
  app.get("/design/templates/:surface/:name/sample", async (c) => {
    const surface = surfaceName.parse(c.req.param("surface"));
    const name = c.req.param("name");
    const sample =
      surface === "slide" ? await readSlideSample(designDir, name) : undefined;
    const detail: DesignTemplateSampleDetail = {
      surface,
      name,
      sample: sample ?? null,
    };
    return c.json(detail);
  });

  // テンプレートを足す・直す。値は区分のスキーマと components.json で確かめる
  app.put("/design/templates/:surface/:name", async (c) => {
    const surface = surfaceName.parse(c.req.param("surface"));
    const name = c.req.param("name");
    const body = saveTemplateBody.safeParse(await readJsonBody(c.req.raw));
    if (!body.success) {
      return c.json(errorBody(z.prettifyError(body.error)), 400);
    }
    const template = templateSchemas[surface].safeParse(body.data.template);
    if (!template.success) {
      return c.json(errorBody(z.prettifyError(template.error)), 400);
    }
    const base = await readDesignBase(designDir);
    if (!base.success) return c.json(errorBody(base.message), 500);
    const resolved = resolveTemplate(
      surface,
      name,
      template.data,
      base.base.tokens,
      base.base.components,
    );
    if (!resolved.success) return c.json(errorBody(resolved.message), 400);
    const path = templatePath(designDir, surface, name);
    const present = await exists(path);
    if (body.data.create && present) {
      return c.json(errorBody("同じ名前のテンプレートが既にある"), 409);
    }
    if (!body.data.create && !present) {
      return c.json(errorBody("テンプレートが見つからない"), 404);
    }
    const source = body.data.create ? body.data.source : undefined;
    if (source !== undefined && !isTemplateName(source)) {
      return c.json(errorBody("複製の元の名前が正しくない"), 400);
    }
    await mkdir(templateDir(designDir, surface, name), { recursive: true });
    // 字の大きさの倍率は 1 のとき書かない
    await writeJsonAtomic(
      path,
      withTextScale(template.data, template.data.textScale),
    );
    // 中身の見本は画面で直さないので、ファイルのまま写す。元に無ければ写さない。
    // 見本が読む同梱の絵(スライドの assets/)と、専用の CSS(template.css)も一緒に写す
    if (source !== undefined) {
      const from = samplePath(designDir, surface, source);
      if (await exists(from)) {
        await copyFile(from, samplePath(designDir, surface, name));
      }
      const ownCssFrom = templateStylePath(designDir, surface, source);
      if (await exists(ownCssFrom)) {
        await copyFile(ownCssFrom, templateStylePath(designDir, surface, name));
      }
      const assets =
        surface === "slide" ? await templateAssetNames(designDir, source) : [];
      if (assets.length > 0) {
        await mkdir(templateAssetsDir(designDir, name), { recursive: true });
        await Promise.all(
          assets.map((file) =>
            copyFile(
              join(templateAssetsDir(designDir, source), file),
              join(templateAssetsDir(designDir, name), file),
            ),
          ),
        );
      }
    }
    const detail = {
      surface,
      name,
      template: template.data,
    } as DesignTemplateDetail;
    return c.json(detail, body.data.create ? 201 : 200);
  });

  app.post("/design/build", async (c) => {
    if (!build) {
      return c.json(errorBody("このサーバーでは design build を回せない"), 503);
    }
    const result = await build();
    if (!result.success) return c.json(errorBody(result.message), 422);
    return c.json({ files: result.files });
  });

  app.get("/design/files/*", async (c) => {
    const prefix = "/api/design/files/";
    const path = decodeURIComponent(c.req.path.slice(prefix.length));
    const [dir, ...rest] = path.split("/");
    const served = SERVED_DIRS.find((name) => name === dir);
    if (!served || rest.length === 0) {
      return c.json(errorBody("ファイルが見つからない"), 404);
    }
    const file = await readAssetFrom(
      join(designDir, served),
      rest.join("/"),
      DESIGN_FILE_TYPES,
    );
    if (!file) return c.json(errorBody("ファイルが見つからない"), 404);
    const template = c.req.query("template");
    const surface =
      served === "samples" ? sampleSurface(rest.join("/")) : undefined;
    const html = surface
      ? sampleWithOrgName(
          new TextDecoder().decode(file.body),
          await readOrgName(),
        )
      : undefined;
    const body =
      template === undefined
        ? (html ?? file.body)
        : surface &&
            html !== undefined &&
            isTemplateName(template) &&
            (await exists(join(designDir, "dist", surface, `${template}.css`)))
          ? sampleForTemplate(html, surface, template)
          : undefined;
    if (body === undefined)
      return c.json(errorBody("テンプレートが見つからない"), 404);
    return c.body(body, 200, {
      "content-type": file.contentType,
      "x-content-type-options": "nosniff",
      "content-security-policy": SAMPLE_CSP,
      "cache-control": "no-store",
    });
  });
};
