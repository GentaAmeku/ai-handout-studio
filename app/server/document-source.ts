import { join } from "node:path";
import type { DocumentFile } from "../src/schema/document.ts";
import { checkDocument, checkDocumentBody } from "../src/schema/document.ts";
import type { HandoutMeta } from "../src/schema/handout.ts";
import { handoutDir } from "./handouts.ts";
import { parseJson, readTextIfExists } from "./workspace.ts";

// HTML 資料の中身の置き場所と読み方。正本は document.json。
// document.json を持たない資料は、本文の断片(document.html)を html ブロック1つの文書として扱う(移行)

export const documentPathOf = (root: string, id: string): string =>
  join(handoutDir(root, "document", id), "document.json");

export const bodyPathOf = (root: string, id: string): string =>
  join(handoutDir(root, "document", id), "document.html");

export const documentVersionsDir = (root: string, id: string): string =>
  join(handoutDir(root, "document", id), "versions");

// 本文の断片を html ブロック1つの文書にする。meta.json が title・template・日時を持つ
export const documentFromBody = (
  meta: HandoutMeta,
  body: string,
): DocumentFile => ({
  id: meta.id,
  title: meta.title,
  template: meta.template,
  status: "draft",
  meta: { createdAt: meta.createdAt, updatedAt: meta.updatedAt },
  head: { title: meta.title },
  toc: "none",
  sections: [
    {
      id: "s01",
      heading: "",
      blocks: [{ id: "b01", type: "html", props: { html: body } }],
    },
  ],
});

// 保存する文書。title と template は meta.json を正として書き戻す
export const withMeta = (
  doc: DocumentFile,
  meta: HandoutMeta,
): DocumentFile => ({
  ...doc,
  id: meta.id,
  title: meta.title,
  template: meta.template,
  meta: { ...doc.meta, updatedAt: meta.updatedAt },
});

export type DocumentSource =
  | { state: "missing" }
  | { state: "invalid"; message: string }
  | { state: "ready"; doc: DocumentFile; legacy: boolean };

export const readDocumentSource = async (
  root: string,
  meta: HandoutMeta,
): Promise<DocumentSource> => {
  const json = await readTextIfExists(documentPathOf(root, meta.id));
  if (json !== undefined) {
    const parsed = parseJson(json);
    if (!parsed.success) return { state: "invalid", message: parsed.message };
    const checked = checkDocument(parsed.value);
    return checked.success
      ? { state: "ready", doc: checked.document, legacy: false }
      : { state: "invalid", message: checked.message };
  }
  const body = await readTextIfExists(bodyPathOf(root, meta.id));
  if (body === undefined) return { state: "missing" };
  const checked = checkDocumentBody(body);
  return checked.success
    ? { state: "ready", doc: documentFromBody(meta, body), legacy: true }
    : { state: "invalid", message: checked.message };
};
