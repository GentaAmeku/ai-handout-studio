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
import {
  countVerified,
  readText,
  runCommand,
  verifyDocumentCode,
} from "../app/server/document-verify.ts";
import { prepareImages } from "../app/server/handout-assets.ts";
import { checkSheetFile, isSheetInput } from "../app/server/sheet-check.ts";
import { sheetImageSrcs } from "../app/server/sheet-images.ts";
import type { DocumentFile } from "../app/src/schema/document.ts";

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

// --run のときだけ、code ブロックの verify を実物と照合する。コマンドとファイルは check を呼んだフォルダから見る
const verifyCode = async (
  document: DocumentFile,
  run: boolean,
): Promise<{ ok: boolean; warnings: readonly string[] }> => {
  const count = countVerified(document);
  if (!run) {
    return {
      ok: true,
      warnings:
        count > 0
          ? [
              `verify を持つ code ブロックが ${count} 個ある。実物と照合するには check --run を付ける`,
            ]
          : [],
    };
  }
  const result = await verifyDocumentCode(document, {
    cwd: process.cwd(),
    run: runCommand,
    read: readText,
    onRun: (command) => {
      console.log(`実行: ${command}`);
    },
  });
  if (result.failures.length > 0) {
    console.error(
      `不合格: 本文が出どころと合わない\n${result.failures.map((line) => `- ${line}`).join("\n")}`,
    );
    return { ok: false, warnings: [] };
  }
  console.log(`照合: ${result.checked} 個の code ブロックが出どころと一致`);
  return { ok: true, warnings: [] };
};

// 画像は JSON のファイルからの相対パスで探す(保存した資料なら assets/ がその隣にある)
const checkDocumentJson = async (
  path: string,
  value: unknown,
  run: boolean,
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
  const verified = await verifyCode(result.document, run);
  if (!verified.ok) return 1;
  console.log(`合格: ${path}(${result.document.sections.length}節の資料)`);
  report([...result.warnings, ...images.warnings, ...verified.warnings]);
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

// 合格なら 0、不合格なら 1 を返す。path は絶対パス。minutes は deck.json の登壇の検査(--minutes)にだけ、
// run は document.json の code ブロックの照合(--run)にだけ使う
export const checkFile = async (
  path: string,
  minutes?: number,
  run = false,
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
  if (run && !isDocumentInput(json.value)) {
    console.log("警告: --run は HTML 資料(document.json)だけで使う");
  }
  if (isSheetInput(json.value)) return checkSheetJson(path, json.value);
  if (isDocumentInput(json.value)) {
    return checkDocumentJson(path, json.value, run);
  }
  if (isDocumentPatchInput(json.value)) {
    return checkDocumentPatchJson(path, json.value);
  }
  return isPatchInput(json.value)
    ? checkPatch(path, json.value)
    : checkDeckFile(path, json.value, minutes);
};
