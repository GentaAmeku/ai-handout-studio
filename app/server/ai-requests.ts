import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AiPatchStatus, AiRequestDetail } from "../src/api/types.ts";
import { checkPatch } from "../src/schema/patch.ts";
import { agentCommandsFor, displayPath } from "./agent-commands.ts";
import {
  deckDir,
  fileStamp,
  parseJson,
  readTextIfExists,
  writeJsonAtomic,
  writeTextAtomic,
} from "./workspace.ts";

// AI の編集案の受け渡し。1回の依頼を ai/{日時}/ にまとめる

export const aiDir = (
  root: string,
  deckId: string,
  requestId: string,
): string => join(deckDir(root, deckId), "ai", requestId);

export const REQUEST_ID_PATTERN = /^\d{8}T\d{6}$/;

export type AiRequestInput = {
  // このスライドか、デッキ全体か
  scope: "slide" | "deck";
  slideId?: string;
  instruction: string;
  // 依頼したときの対象 JSON。未保存の下書きを含む
  target: unknown;
};

export const buildPatchRequestMarkdown = ({
  input,
  deckId,
  targetPath,
  patchPath,
  now,
}: {
  input: AiRequestInput;
  deckId: string;
  targetPath: string;
  patchPath: string;
  now: Date;
}): string =>
  [
    `# ${input.scope === "slide" ? `スライド ${input.slideId} の編集案` : "デッキ全体の編集案"}\n`,
    "ai-handout-studio の編集案の依頼。`skills/ai-handout-studio/SKILL.md` の「編集案(パッチ)」の手順に従い、下の書き出し先に `patch.json` を作る。\n",
    `## 指示\n\n${input.instruction}\n`,
    [
      "## 受け渡し\n",
      `- 対象の JSON: \`${targetPath}\``,
      `- 書き出し先: \`${patchPath}\``,
      `- 資料の id: \`${deckId}\``,
      `- 依頼した日時: \`${now.toISOString()}\``,
      `- 検証: \`pnpm deck:check ${patchPath}\``,
      "",
    ].join("\n"),
    [
      "## 決まりごと\n",
      input.scope === "slide"
        ? `- 置き換えるのは \`${input.slideId}\` の \`blocks\` だけ。ほかのスライドは書かない`
        : "- スライドごとのパッチの集まり(`patches`)にする。スライドの増減と並べ替えはしない",
      "- 残すブロックは元の id のまま。新しいブロックは id を書かない",
      "- layout とメモ(notes)は変えない",
      "- 色・フォント・カタログ外の type は書かない",
      "",
    ].join("\n"),
  ].join("\n");

export const createAiRequest = async (
  root: string,
  repoRoot: string,
  deckId: string,
  input: AiRequestInput,
  now: Date,
): Promise<AiRequestDetail> => {
  const requestId = fileStamp(now);
  const dir = aiDir(root, deckId, requestId);
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(join(dir, "target.json"), input.target);

  const targetPath = displayPath(repoRoot, join(dir, "target.json"));
  const patchPath = displayPath(repoRoot, join(dir, "patch.json"));
  const requestPath = displayPath(repoRoot, join(dir, "request.md"));
  await writeTextAtomic(
    join(dir, "request.md"),
    buildPatchRequestMarkdown({ input, deckId, targetPath, patchPath, now }),
  );

  return {
    requestId,
    requestPath,
    patchPath,
    commands: agentCommandsFor(
      repoRoot,
      `skills/ai-handout-studio/SKILL.md の編集案の手順に従い、${requestPath} の指示から patch.json を作ってください。`,
    ),
  };
};

// 検証に通ったパッチだけを画面へ渡す。反映は画面が下書きに対して行う
export const readAiPatch = async (
  root: string,
  deckId: string,
  requestId: string,
): Promise<AiPatchStatus> => {
  if (!REQUEST_ID_PATTERN.test(requestId)) return { state: "none" };
  const text = await readTextIfExists(
    join(aiDir(root, deckId, requestId), "patch.json"),
  );
  if (text === undefined) return { state: "none" };
  const json = parseJson(text);
  if (!json.success) return { state: "invalid", message: json.message };
  const result = checkPatch(json.value);
  return result.success
    ? { state: "ready", patches: result.patches }
    : { state: "invalid", message: result.message };
};
