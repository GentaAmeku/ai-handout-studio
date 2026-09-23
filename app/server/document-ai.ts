import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AiRequestDetail,
  DocumentAiPatchStatus,
} from "../src/api/types.ts";
import {
  applyDocumentPatch,
  checkPatchTarget,
} from "../src/editor/document-patch.ts";
import { checkDocument, type DocumentFile } from "../src/schema/document.ts";
import { checkDocumentPatch } from "../src/schema/document-patch.ts";
import { agentCommandsFor, displayPath } from "./agent-commands.ts";
import { assetsDirOf } from "./handout-assets.ts";
import { renderDocumentHtml } from "./handout-html.ts";
import {
  fail,
  readMeta,
  readOrgName,
  type StoreResult,
} from "./handout-store.ts";
import { handoutDir } from "./handouts.ts";
import {
  fileStamp,
  parseJson,
  readTextIfExists,
  writeJsonAtomic,
  writeTextAtomic,
} from "./workspace.ts";

// HTML 資料の AI の編集案の受け渡し。スライドの ai-requests.ts と同じく、
// 1回の依頼を ai/{日時}/ にまとめる。対象は1つのセクション

export const documentAiDir = (
  root: string,
  id: string,
  requestId: string,
): string => join(handoutDir(root, "document", id), "ai", requestId);

export const REQUEST_ID_PATTERN = /^\d{8}T\d{6}$/;

export type DocumentAiRequestInput = {
  sectionId: string;
  instruction: string;
  // 依頼したときの文書。未保存の下書きを含む
  target: unknown;
};

export const buildDocumentPatchRequestMarkdown = ({
  input,
  id,
  targetPath,
  patchPath,
  now,
}: {
  input: DocumentAiRequestInput;
  id: string;
  targetPath: string;
  patchPath: string;
  now: Date;
}): string =>
  [
    `# セクション ${input.sectionId} の編集案(HTML 資料)\n`,
    "ai-handout-studio の HTML 資料の編集案の依頼。`skills/ai-handout-studio/references/document.md` の「編集案(パッチ)」の手順に従い、下の書き出し先に `patch.json` を作る。\n",
    `## 指示\n\n${input.instruction}\n`,
    [
      "## 受け渡し\n",
      `- 対象の JSON: \`${targetPath}\`(資料全体の document.json。直すのは \`${input.sectionId}\` のセクションだけ)`,
      `- 書き出し先: \`${patchPath}\``,
      `- 資料の id: \`${id}\``,
      `- 依頼した日時: \`${now.toISOString()}\``,
      `- 検証: \`ai-handout-studio check ${patchPath}\``,
      "",
    ].join("\n"),
    [
      "## 決まりごと\n",
      `- 形は \`{ "sectionId": "${input.sectionId}", "blocks": [...] }\`。置き換えるのは \`${input.sectionId}\` の \`blocks\` だけ`,
      "- セクションの見出し・ほかのセクション・表紙まわり・脇の用語集は書かない",
      "- 残すブロックは元の id のまま。新しいブロックは id を書かない",
      "- 色・フォント・class・カタログ外の type は書かない",
      "",
    ].join("\n"),
  ].join("\n");

export const createDocumentAiRequest = async (
  root: string,
  repoRoot: string,
  id: string,
  input: DocumentAiRequestInput,
  now: Date,
): Promise<AiRequestDetail> => {
  const requestId = fileStamp(now);
  const dir = documentAiDir(root, id, requestId);
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(join(dir, "target.json"), input.target);

  const targetPath = displayPath(repoRoot, join(dir, "target.json"));
  const patchPath = displayPath(repoRoot, join(dir, "patch.json"));
  const requestPath = displayPath(repoRoot, join(dir, "request.md"));
  await writeTextAtomic(
    join(dir, "request.md"),
    buildDocumentPatchRequestMarkdown({
      input,
      id,
      targetPath,
      patchPath,
      now,
    }),
  );

  return {
    requestId,
    requestPath,
    patchPath,
    commands: agentCommandsFor(
      repoRoot,
      `skills/ai-handout-studio/references/document.md の編集案の手順に従い、${requestPath} の指示から patch.json を作ってください。`,
    ),
  };
};

// 検査に通ったパッチだけを画面へ渡す。target.json と突き合わせ、取り込みは画面が下書きに対して行う
export const readDocumentAiPatch = async (
  root: string,
  id: string,
  requestId: string,
): Promise<DocumentAiPatchStatus> => {
  if (!REQUEST_ID_PATTERN.test(requestId)) return { state: "none" };
  const dir = documentAiDir(root, id, requestId);
  const text = await readTextIfExists(join(dir, "patch.json"));
  if (text === undefined) return { state: "none" };
  const json = parseJson(text);
  if (!json.success) return { state: "invalid", message: json.message };
  const result = checkDocumentPatch(json.value);
  if (!result.success) return { state: "invalid", message: result.message };
  const target = await readDocumentAiTarget(root, id, requestId);
  if (target) {
    const problem = checkPatchTarget(target, result.patch);
    if (problem) return { state: "invalid", message: problem };
  }
  return { state: "ready", patch: result.patch };
};

// 依頼したときの文書。読めなければ undefined
export const readDocumentAiTarget = async (
  root: string,
  id: string,
  requestId: string,
): Promise<DocumentFile | undefined> => {
  if (!REQUEST_ID_PATTERN.test(requestId)) return undefined;
  const text = await readTextIfExists(
    join(documentAiDir(root, id, requestId), "target.json"),
  );
  if (text === undefined) return undefined;
  const json = parseJson(text);
  if (!json.success) return undefined;
  const checked = checkDocument(json.value);
  return checked.success ? checked.document : undefined;
};

// 取り込む前に見比べるための1枚。依頼したときの文書に案を当てた姿(after)と、当てる前(before)。
// 書き出しと同じ描画で、保存はしない
export const renderDocumentAiPreview = async (
  root: string,
  designDir: string,
  id: string,
  requestId: string,
  view: "before" | "after",
): Promise<StoreResult<{ html: string }>> => {
  const meta = await readMeta(root, "document", id);
  if (meta.state !== "ready") return fail(404, "HTML 資料が見つからない");
  const target = await readDocumentAiTarget(root, id, requestId);
  if (!target) return fail(404, "依頼のときの文書が見つからない");
  let doc = target;
  if (view === "after") {
    const status = await readDocumentAiPatch(root, id, requestId);
    if (status.state !== "ready") return fail(404, "検査に通った編集案が無い");
    const applied = applyDocumentPatch(target, status.patch);
    if (!applied.success) return fail(422, applied.message);
    doc = applied.document;
  }
  try {
    return {
      success: true,
      html: await renderDocumentHtml({
        designDir,
        template: meta.value.template,
        title: meta.value.title,
        doc,
        orgName: await readOrgName(root),
        assetsDir: assetsDirOf(root, "document", id),
      }),
    };
  } catch {
    return fail(422, "テンプレートを読めない");
  }
};
