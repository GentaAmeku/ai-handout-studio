// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDocumentAiRequest,
  documentAiDir,
  readDocumentAiPatch,
} from "./document-ai";
import { documentSample } from "./document-sample";

const now = new Date(2026, 8, 20, 10, 15, 0);
const context = { workspaceRoot: "" };
const id = "doc_20260920_001";
const requestId = "20260920T101500";

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(join(tmpdir(), "ai-handout-doc-ai-"));
  await mkdir(join(context.workspaceRoot, "documents", id), {
    recursive: true,
  });
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const sample = () => ({ ...documentSample(), id });

const create = () =>
  createDocumentAiRequest(
    context.workspaceRoot,
    "/repo",
    id,
    {
      sectionId: sample().sections[0]?.id ?? "",
      instruction: "表にする",
      target: sample(),
    },
    now,
  );

const writePatch = (value: unknown) =>
  writeFile(
    join(documentAiDir(context.workspaceRoot, id, requestId), "patch.json"),
    JSON.stringify(value),
  );

describe("createDocumentAiRequest", () => {
  it("依頼と対象を ai/{日時}/ に置き、セクションと書き出し先を request.md に書く", async () => {
    const detail = await create();
    const dir = documentAiDir(context.workspaceRoot, id, requestId);
    expect(detail.requestId).toBe(requestId);
    expect(
      JSON.parse(await readFile(join(dir, "target.json"), "utf8")).id,
    ).toBe(id);
    const markdown = await readFile(join(dir, "request.md"), "utf8");
    expect(markdown).toContain("表にする");
    expect(markdown).toContain("blocks");
    expect(detail.commands.claude).toContain("request.md");
  });
});

describe("readDocumentAiPatch", () => {
  it("書かれるまでは none、壊れていれば invalid、通れば ready", async () => {
    await create();
    const sectionId = sample().sections[0]?.id ?? "";
    expect(
      await readDocumentAiPatch(context.workspaceRoot, id, requestId),
    ).toEqual({ state: "none" });

    await writePatch({ sectionId, blocks: [{ type: "nope", props: {} }] });
    expect(
      (await readDocumentAiPatch(context.workspaceRoot, id, requestId)).state,
    ).toBe("invalid");

    await writePatch({
      sectionId,
      blocks: [{ type: "text", props: { text: "直した" } }],
    });
    expect(
      (await readDocumentAiPatch(context.workspaceRoot, id, requestId)).state,
    ).toBe("ready");
  });

  it("対象に無いセクションは invalid", async () => {
    await create();
    await writePatch({ sectionId: "s99", blocks: [] });
    const status = await readDocumentAiPatch(
      context.workspaceRoot,
      id,
      requestId,
    );
    expect(status.state).toBe("invalid");
  });
});
