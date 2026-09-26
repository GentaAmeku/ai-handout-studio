// @vitest-environment node
import {
  cp,
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
import type {
  DesignTemplateDetail,
  DesignTemplateSampleDetail,
  DesignTemplatesDetail,
} from "../src/api/types";
import { createApi } from "./api";
import { buildDesign } from "./design-build";
import { saveProfile } from "./profile";
import { DEFAULT_SELECTION } from "./test-fixtures.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { dir: "", workspaceRoot: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-design-api-"));
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-ws-"),
  );
  await cp(join(repoRoot, "design"), context.dir, { recursive: true });
  // design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
  await writeFile(
    join(context.dir, "selection.json"),
    `${JSON.stringify(DEFAULT_SELECTION, null, 2)}\n`,
  );
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const send = (method: string, path: string, body?: unknown) =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
    designDir: context.dir,
    designBuilder: () => buildDesign(context.dir),
  }).request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// 移動の帯の位置(navigation)を持つ古い形。読むときに捨てる
const acmeSheet = {
  label: "Acme",
  tokens: { color: { primary: "#0f766e" } },
  components: { table: { variant: "striped" } },
  layout: {
    base: "focus",
    width: 1200,
    list: { width: 260, side: "right" },
    content: 720,
    navigation: "top",
  },
};

const acmeSlide = {
  label: "Acme",
  tokens: { color: { primary: "#0f766e" }, size: { h1: 40 } },
  components: { table: { variant: "lined" } },
};

const wideDocument = {
  label: "Wide",
  components: {},
  layout: { columns: [720, 240], areas: [["main", "aside"]] },
};

const DEFAULTS = { slide: "default", sheet: "default", document: "default" };

const css = (path: string) => readFile(join(context.dir, "dist", path), "utf8");

describe("デザインの API", () => {
  it("tokens・components・区分ごとのテンプレートの一覧を返す", async () => {
    const response = await send("GET", "/api/design/templates");
    expect(response.status).toBe(200);
    const body = (await response.json()) as DesignTemplatesDetail;
    expect(body.templates.slide.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["default", "linen", "lumen"]),
    );
    expect(body.templates.sheet.map((entry) => entry.name)).toEqual([
      "cobalt",
      "default",
      "paper",
    ]);
    expect(
      body.templates.document.find((entry) => entry.name === "default"),
    ).toMatchObject({
      name: "default",
      label: "Default",
    });
    expect(body.tokens.color.primary).toMatch(/^#/);
    expect(Object.keys(body.components)).toContain("table");
    expect(body.selection).toEqual(DEFAULTS);
  });

  it("中身の見本を持つテンプレートは見本を返し、持たないものは null を返す", async () => {
    const own = await send("GET", "/api/design/templates/slide/crayon/sample");
    expect(own.status).toBe(200);
    const body = (await own.json()) as DesignTemplateSampleDetail;
    expect(body.name).toBe("crayon");
    expect(body.sample?.slides[0]?.layout).toBe("cover");
    const none = await send(
      "GET",
      "/api/design/templates/slide/default/sample",
    );
    expect(((await none.json()) as DesignTemplateSampleDetail).sample).toBe(
      null,
    );
    // 見本を持つのはスライドだけ。ほかの区分は名前が合っていても null
    const sheet = await send(
      "GET",
      "/api/design/templates/sheet/cobalt/sample",
    );
    expect(((await sheet.json()) as DesignTemplateSampleDetail).sample).toBe(
      null,
    );
    expect(
      (await send("GET", "/api/design/templates/slide/Zine/sample")).status,
    ).toBe(400);
  });

  it("設定の言語が英語なら英語の見本(sample.en.json)を返し、無ければ日本語に落ちる", async () => {
    await saveProfile(context.workspaceRoot, { orgName: "", locale: "en" });
    const english = (await (
      await send("GET", "/api/design/templates/slide/crayon/sample")
    ).json()) as DesignTemplateSampleDetail;
    expect(JSON.stringify(english.sample)).not.toMatch(/[\u3040-\u30ff]/);
    await rm(
      join(context.dir, "templates", "slide", "crayon", "sample.en.json"),
    );
    const fallback = (await (
      await send("GET", "/api/design/templates/slide/crayon/sample")
    ).json()) as DesignTemplateSampleDetail;
    expect(fallback.sample).toEqual(
      JSON.parse(
        await readFile(
          join(context.dir, "templates", "slide", "crayon", "sample.json"),
          "utf8",
        ),
      ),
    );
  });

  it("区分ごとの既定を保存し、build でその区分の tokens.css だけが替わる", async () => {
    await send("POST", "/api/design/build");
    const slideBefore = await css("slide/tokens.css");
    const created = await send("PUT", "/api/design/templates/sheet/acme", {
      template: acmeSheet,
      create: true,
    });
    expect(created.status).toBe(201);
    const selection = { ...DEFAULTS, sheet: "acme" };
    const response = await send("PUT", "/api/design/selection", selection);
    expect(response.status).toBe(200);
    expect(
      JSON.parse(await readFile(join(context.dir, "selection.json"), "utf8")),
    ).toEqual(selection);
    await send("POST", "/api/design/build");
    expect(await css("sheet/tokens.css")).toBe(await css("sheet/acme.css"));
    expect(await css("sheet/tokens.css")).toContain("--board-width: 1200px;");
    // 帯は下に固定した。前の形の navigation は捨て、書くファイルにも CSS にも残さない
    expect(await css("sheet/tokens.css")).not.toContain("--board-nav");
    expect(
      JSON.parse(
        await readFile(
          join(context.dir, "templates", "sheet", "acme", "template.json"),
          "utf8",
        ),
      ).layout,
    ).not.toHaveProperty("navigation");
    expect(await css("slide/tokens.css")).toBe(slideBefore);
    expect(
      JSON.parse(await css("sheet/templates.json")) as unknown,
    ).toMatchObject({
      default: "acme",
      templates: { acme: { label: "Acme", base: "focus" } },
    });
  });

  it("移動の帯の位置(navigation)を持つ前の形の template.json も読め、build が通る", async () => {
    await mkdir(join(context.dir, "templates", "sheet", "old"), {
      recursive: true,
    });
    await writeFile(
      join(context.dir, "templates", "sheet", "old", "template.json"),
      JSON.stringify({ ...acmeSheet, label: "Legacy" }),
    );
    const response = await send("GET", "/api/design/templates/sheet/old");
    expect(response.status).toBe(200);
    const body = (await response.json()) as DesignTemplateDetail;
    expect("layout" in body.template && body.template.layout).toEqual({
      base: "focus",
      width: 1200,
      list: { width: 260, side: "right" },
      content: 720,
    });
    expect((await send("POST", "/api/design/build")).status).toBe(200);
    expect(await css("sheet/old.css")).not.toContain("--board-nav");
  });

  it("ほかの区分にしか無いテンプレートや形の違う選択は 400 で、ファイルを書かない", async () => {
    const before = await readFile(join(context.dir, "selection.json"), "utf8");
    const results = await Promise.all(
      [
        { ...DEFAULTS, slide: "nothing" },
        // linen はスライドにしか無い
        { ...DEFAULTS, sheet: "linen" },
        { slide: "default" },
        { ...DEFAULTS, layouts: { document: "standard", sheet: "focus" } },
      ].map(
        async (body) =>
          (await send("PUT", "/api/design/selection", body)).status,
      ),
    );
    expect(results).toEqual([400, 400, 400, 400]);
    expect(await readFile(join(context.dir, "selection.json"), "utf8")).toBe(
      before,
    );
  });

  it("テンプレートを1つ返す。無い名前・区分は 404、形の違う名前と tokens は 400", async () => {
    const response = await send(
      "GET",
      "/api/design/templates/document/default",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DesignTemplateDetail;
    expect(body).toMatchObject({ surface: "document", name: "default" });
    expect("layout" in body.template && body.template.layout).toBeTruthy();
    const statuses = await Promise.all(
      [
        "/api/design/templates/sheet/nothing",
        "/api/design/templates/sheet/linen",
        "/api/design/templates/deck/default",
        "/api/design/templates/sheet/Bad_Name",
        "/api/design/templates/sheet/tokens",
      ].map(async (path) => (await send("GET", path)).status),
    );
    expect(statuses).toEqual([404, 404, 404, 400, 400]);
  });

  it("新規作成は 201、同じ名前をもう一度作ると 409、上書きは既にあるものだけ", async () => {
    const created = await send("PUT", "/api/design/templates/slide/acme", {
      template: acmeSlide,
      create: true,
    });
    expect(created.status).toBe(201);
    expect(
      JSON.parse(
        await readFile(
          join(context.dir, "templates", "slide", "acme", "template.json"),
          "utf8",
        ),
      ),
    ).toEqual(acmeSlide);
    const again = await send("PUT", "/api/design/templates/slide/acme", {
      template: acmeSlide,
      create: true,
    });
    expect(again.status).toBe(409);
    const missing = await send("PUT", "/api/design/templates/sheet/acme", {
      template: acmeSheet,
    });
    expect(missing.status).toBe(404);
  });

  it("複製で作ると、元の中身の見本(sample.json と sample.en.json)も写す", async () => {
    const dir = join(context.dir, "templates", "slide");
    await writeFile(
      join(dir, "default", "sample.json"),
      JSON.stringify({ slides: [] }),
    );
    await writeFile(
      join(dir, "default", "sample.en.json"),
      JSON.stringify({ label: "Copied", slides: [] }),
    );
    const created = await send("PUT", "/api/design/templates/slide/copied", {
      template: acmeSlide,
      create: true,
      source: "default",
    });
    expect(created.status).toBe(201);
    expect(await readFile(join(dir, "copied", "sample.json"), "utf8")).toBe(
      JSON.stringify({ slides: [] }),
    );
    expect(await readFile(join(dir, "copied", "sample.en.json"), "utf8")).toBe(
      JSON.stringify({ label: "Copied", slides: [] }),
    );
    const bad = await send("PUT", "/api/design/templates/slide/other", {
      template: acmeSlide,
      create: true,
      source: "../default",
    });
    expect(bad.status).toBe(400);
  });

  it("複製で作ると、元の専用の CSS(template.css)も写す。持たないテンプレートはそのまま", async () => {
    const dir = join(context.dir, "templates", "document");
    const sourceCss = await readFile(
      join(dir, "cobalt", "template.css"),
      "utf8",
    );
    const cobaltTemplate = JSON.parse(
      await readFile(join(dir, "cobalt", "template.json"), "utf8"),
    );
    const created = await send(
      "PUT",
      "/api/design/templates/document/cobalt-2",
      { template: cobaltTemplate, create: true, source: "cobalt" },
    );
    expect(created.status).toBe(201);
    expect(await readFile(join(dir, "cobalt-2", "template.css"), "utf8")).toBe(
      sourceCss,
    );
    // 元がそもそも専用の CSS を持たないなら、複製先にも作らない
    const defaultTemplate = JSON.parse(
      await readFile(
        join(context.dir, "templates", "document", "default", "template.json"),
        "utf8",
      ),
    );
    const plain = await send(
      "PUT",
      "/api/design/templates/document/default-2",
      { template: defaultTemplate, create: true, source: "default" },
    );
    expect(plain.status).toBe(201);
    await expect(
      readFile(join(dir, "default-2", "template.css"), "utf8"),
    ).rejects.toThrow();
  });

  it("区分の形に合わないテンプレートと知らない変種は 400 で、ファイルを書かない", async () => {
    const path = join(context.dir, "templates", "sheet", "default");
    const before = await readFile(join(path, "template.json"), "utf8");
    const bodies = [
      // 質問票のテンプレートは骨格を持つ
      { ...acmeSheet, layout: undefined },
      // 文書の骨格は質問票に置けない
      { ...acmeSheet, layout: wideDocument.layout },
      { ...acmeSheet, components: { table: { variant: "nothing" } } },
      // 区分をまたぐ共通の値(surfaces)は持たない
      { ...acmeSheet, surfaces: {} },
    ];
    const statuses = await Promise.all(
      bodies.map(
        async (template) =>
          (
            await send("PUT", "/api/design/templates/sheet/default", {
              template,
            })
          ).status,
      ),
    );
    expect(statuses).toEqual([400, 400, 400, 400]);
    expect(
      (
        await send("PUT", "/api/design/templates/slide/default", {
          template: { ...acmeSlide, layout: wideDocument.layout },
        })
      ).status,
    ).toBe(400);
    expect(await readFile(join(path, "template.json"), "utf8")).toBe(before);
    // 一時ファイルを残さない
    expect(
      (await readdir(path)).filter((file) => file.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("build は区分ごと・テンプレートごとの CSS と見本を作り、消えたテンプレートの CSS を残さない", async () => {
    await send("PUT", "/api/design/templates/slide/acme", {
      template: acmeSlide,
      create: true,
    });
    await send("PUT", "/api/design/templates/document/wide", {
      template: wideDocument,
      create: true,
    });
    const response = await send("POST", "/api/design/build");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { files: string[] };
    expect(body.files).toEqual(
      expect.arrayContaining([
        "dist/slide/acme.css",
        "dist/slide/linen.css",
        "dist/document/wide.css",
        "dist/templates.json",
        "samples/slide.html",
      ]),
    );
    expect(body.files).not.toContain("dist/sheet/acme.css");
    expect(await css("slide/acme.css")).toContain("--fs-h1: 40px;");
    expect(await css("slide/default.css")).not.toContain("--fs-h1: 40px;");
    expect(await css("document/wide.css")).toContain("--doc-measure: 720px;");
    expect(await css("document/wide.css")).toContain(
      '--doc-areas: "main aside";',
    );
    expect(await css("document/default.css")).toContain(
      "--doc-measure: 640px;",
    );
    const registry = JSON.parse(await css("templates.json"));
    expect(registry.slide.acme.label).toBe("Acme");
    expect(registry.slide.acme.variables["--fs-h1"]).toBe("40px");
    await rm(join(context.dir, "templates", "slide", "acme"), {
      recursive: true,
    });
    await send("POST", "/api/design/build");
    expect(await readdir(join(context.dir, "dist", "slide"))).not.toContain(
      "acme.css",
    );
  });

  it("文字の大きさの倍率は範囲の中だけ保存し、1 のときは書かない。build の CSS と templates.json は掛けた値になる", async () => {
    const path = join(
      context.dir,
      "templates",
      "slide",
      "acme",
      "template.json",
    );
    const saved = async () => JSON.parse(await readFile(path, "utf8"));
    const put = (template: unknown, create = false) =>
      send("PUT", "/api/design/templates/slide/acme", { template, create });

    expect((await put({ ...acmeSlide, textScale: 1.2 }, true)).status).toBe(
      201,
    );
    expect((await saved()).textScale).toBe(1.2);
    expect((await send("POST", "/api/design/build")).status).toBe(200);
    // h1 40px の 120% は 48px。本文は tokens.json の 16px の 120%
    expect(await css("slide/acme.css")).toContain("--fs-h1: 48px;");
    expect(await css("slide/acme.css")).toContain("--fs-body: 19.2px;");
    expect(await css("slide/acme.css")).toContain("--text-scale: 1.2;");
    const registry = JSON.parse(await css("templates.json"));
    expect(registry.slide.acme.variables["--fs-h1"]).toBe("48px");

    expect((await put({ ...acmeSlide, textScale: 1 })).status).toBe(200);
    expect(await saved()).toEqual(acmeSlide);

    const before = await readFile(path, "utf8");
    const statuses = await Promise.all(
      [0.75, 1.35, 1.12].map(
        async (textScale) => (await put({ ...acmeSlide, textScale })).status,
      ),
    );
    expect(statuses).toEqual([400, 400, 400]);
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("見本の HTML と CSS を外へ通信しない CSP 付きで返す", async () => {
    const html = await send("GET", "/api/design/files/samples/slide.html");
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(html.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    const css = await send("GET", "/api/design/files/dist/slide.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  it("?template= で見本をそのテンプレートの CSS で返し、無いテンプレートは 404", async () => {
    const slide = await (
      await send("GET", "/api/design/files/samples/slide.html?template=lumen")
    ).text();
    expect(slide).toContain('href="../dist/slide/lumen.css"');
    expect(slide).not.toContain("slide/tokens.css");
    expect(slide).toContain('data-template="lumen"');
    expect(slide).not.toMatch(/data-template="(?!lumen")/);
    const sheet = await (
      await send(
        "GET",
        "/api/design/files/samples/sheet.all.html?template=paper",
      )
    ).text();
    expect(sheet).toContain('href="../dist/sheet/paper.css"');
    const statuses = await Promise.all(
      [
        "/api/design/files/samples/slide.html?template=nothing",
        "/api/design/files/samples/document.html?template=..%2Fslide%2Fband",
        "/api/design/files/dist/slide.css?template=lumen",
      ].map(async (path) => (await send("GET", path)).status),
    );
    expect(statuses).toEqual([404, 404, 404]);
  });

  it("英語の見本(samples/en/)も同じ名前で、そのテンプレートの CSS と設定の組織名で返す", async () => {
    await saveProfile(context.workspaceRoot, { orgName: "Acme" });
    const document = await send(
      "GET",
      "/api/design/files/samples/en/document.html?template=report",
    );
    expect(document.status).toBe(200);
    const html = await document.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="../../dist/document/report.css"');
    expect(html).toContain("<span>Acme</span>");
    const slide = await (
      await send(
        "GET",
        "/api/design/files/samples/en/slide.lumen.html?template=lumen",
      )
    ).text();
    expect(slide).toContain('href="../../dist/slide/lumen.css"');
    expect(slide).toContain('src="../slide.lumen/assets/');
  });

  it("samples/ と dist/ の外、知らない拡張子は返さない", async () => {
    const paths = [
      "/api/design/files/tokens.json",
      "/api/design/files/templates/slide/default/template.json",
      "/api/design/files/dist/templates.json",
      "/api/design/files/samples/..%2Ftokens.json",
      "/api/design/files/samples/",
    ];
    const statuses = await Promise.all(
      paths.map(async (path) => (await send("GET", path)).status),
    );
    expect(statuses).toEqual(paths.map(() => 404));
  });
});
