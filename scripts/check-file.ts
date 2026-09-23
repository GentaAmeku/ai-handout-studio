import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  checkGeneratedDeck,
  checkPatchFile,
  deckIdFromPath,
  findMissingAssets,
  isPatchInput,
  talkCheck,
} from "../app/server/deck-check.ts";
import {
  checkDocumentFile,
  checkDocumentPatchFile,
  isDocumentInput,
  isDocumentPatchInput,
} from "../app/server/document-check.ts";
import { documentImageSrcs } from "../app/server/document-images.ts";
import { prepareImages } from "../app/server/handout-assets.ts";
import { checkSheetFile, isSheetInput } from "../app/server/sheet-check.ts";
import { sheetImageSrcs } from "../app/server/sheet-images.ts";

// deck.json / patch.json / document.json / 質問 JSON の検証。pnpm deck:check と ai-handout-studio check が共有する

const parseJson = (
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const readJson = async (path: string): Promise<unknown> => {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  const json = parseJson(text);
  return json.ok ? json.value : undefined;
};

const report = (warnings: readonly string[]) => {
  warnings.forEach((warning) => {
    console.log(`警告: ${warning}`);
  });
};

// 編集案は、同じフォルダの target.json と突き合わせる
const checkPatch = async (path: string, value: unknown): Promise<number> => {
  const target = await readJson(join(dirname(path), "target.json"));
  const result = checkPatchFile(value, target);
  if (!result.ok) {
    console.error(`不合格: ${path}\n${result.errors}`);
    return 1;
  }
  console.log(`合格: ${path}(${result.patches.length}スライド分の編集案)`);
  report(result.warnings);
  return 0;
};

const checkDocumentPatchJson = async (
  path: string,
  value: unknown,
): Promise<number> => {
  const target = await readJson(join(dirname(path), "target.json"));
  const result = checkDocumentPatchFile(value, target);
  if (!result.ok) {
    console.error(`不合格: ${path}\n${result.errors}`);
    return 1;
  }
  console.log(
    `合格: ${path}(節 ${result.patch.sectionId} の編集案。${result.patch.blocks.length}ブロック)`,
  );
  report(result.warnings);
  return 0;
};

const checkDeckFile = async (
  path: string,
  value: unknown,
  minutes?: number,
): Promise<number> => {
  const result = checkGeneratedDeck(value, deckIdFromPath(path));
  if (!result.ok) {
    console.error(`不合格: ${path}\n${result.errors}`);
    return 1;
  }
  const missing = await findMissingAssets(result.deck, dirname(path));
  if (missing.length > 0) {
    console.error(
      `不合格: 画像が見つからない\n${missing.map((src) => `- ${src}`).join("\n")}`,
    );
    return 1;
  }
  console.log(`合格: ${path}(${result.deck.slides.length}枚)`);
  report(result.warnings);
  if (minutes !== undefined) {
    const talk = talkCheck(result.deck, minutes);
    console.log(talk.estimateLine);
    report(talk.warnings);
  }
  return 0;
};

// 画像は JSON のファイルからの相対パスで探す(保存した資料なら assets/ がその隣にある)
const checkDocumentJson = async (
  path: string,
  value: unknown,
): Promise<number> => {
  const result = checkDocumentFile(value);
  if (!result.ok) {
    console.error(`不合格: ${path}\n${result.errors}`);
    return 1;
  }
  const images = await prepareImages(documentImageSrcs(result.document), {
    baseDir: dirname(path),
  });
  if (!images.success) {
    console.error(`不合格: ${path}\n${images.message}`);
    return 1;
  }
  console.log(`合格: ${path}(${result.document.sections.length}節の資料)`);
  report([...result.warnings, ...images.warnings]);
  return 0;
};

// 画像は質問 JSON のファイルからの相対パスで探す
const checkSheetJson = async (
  path: string,
  value: unknown,
): Promise<number> => {
  const result = checkSheetFile(value);
  if (!result.ok) {
    console.error(`不合格: ${path}\n${result.errors}`);
    return 1;
  }
  const images = await prepareImages(sheetImageSrcs(result.sheet), {
    baseDir: dirname(path),
  });
  if (!images.success) {
    console.error(`不合格: ${path}\n${images.message}`);
    return 1;
  }
  console.log(`合格: ${path}(${result.sheet.questions.length}問の質問票)`);
  report([...result.warnings, ...images.warnings]);
  return 0;
};

// 合格なら 0、不合格なら 1 を返す。path は絶対パス。minutes は deck.json の登壇の検査(--minutes)にだけ使う
export const checkFile = async (
  path: string,
  minutes?: number,
): Promise<number> => {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) {
    console.error(`不合格: ファイルを読めない: ${path}`);
    return 1;
  }
  const json = parseJson(text);
  if (!json.ok) {
    console.error(`不合格: JSON として読めない: ${json.message}`);
    return 1;
  }
  if (isSheetInput(json.value)) return checkSheetJson(path, json.value);
  if (isDocumentInput(json.value)) return checkDocumentJson(path, json.value);
  if (isDocumentPatchInput(json.value)) {
    return checkDocumentPatchJson(path, json.value);
  }
  return isPatchInput(json.value)
    ? checkPatch(path, json.value)
    : checkDeckFile(path, json.value, minutes);
};
