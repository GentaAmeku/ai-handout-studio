import { readdirSync, readFileSync } from "node:fs";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// テストが使う資料。スライドのテンプレートの中身の見本(design/templates/slide/<名前>/sample.json)から組む

// jsdom の環境では import.meta.url がファイルの URL にならないので、リポジトリの直下(テストを回す場所)から読む
const repoDesignDir = join(process.cwd(), "design");
const slideTemplatesDir = `${join(repoDesignDir, "templates", "slide")}/`;

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

// 中身の見本を持つスライドのテンプレートの名前
export const sampleTemplateNames = (): string[] =>
  readdirSync(slideTemplatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        readFileSync(`${slideTemplatesDir}${name}/sample.json`);
        return true;
      } catch {
        return false;
      }
    })
    .sort();

// テンプレートから新規作成したときと同じ形の deck.json
export const templateDeck = (name: string): Record<string, unknown> => {
  const sample = readJson(`${slideTemplatesDir}${name}/sample.json`);
  return {
    id: `tpl_${name.replaceAll("-", "_")}`,
    title: sample.label ?? name,
    template: "default",
    size: { width: 1280, height: 720 },
    status: "draft",
    meta: {
      ...(sample.meta as object | undefined),
      createdAt: "2026-09-16T00:00:00Z",
      updatedAt: "2026-09-16T00:00:00Z",
    },
    slides: sample.slides,
  };
};

export const proposalDeck = (): Record<string, unknown> =>
  templateDeck("proposal");

// design/selection.json の既定。利用者がどのテンプレートを既定に選んでも、テストはこの既定で確かめる
export const DEFAULT_SELECTION = {
  slide: "default",
  sheet: "default",
  document: "default",
} as const;

// 本物の design/ を一時フォルダへ写し、selection.json を既定(default)に固定して返す。
// 「既定のテンプレートで作る」を確かめるテストはこれを designDir として渡す(本物の design/ には書き込まない)。
// 呼んだ側が rm({ recursive: true, force: true }) で片付ける
export const copyDesignWithDefaultSelection = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-design-"));
  await cp(repoDesignDir, dir, { recursive: true });
  await writeFile(
    join(dir, "selection.json"),
    `${JSON.stringify(DEFAULT_SELECTION, null, 2)}\n`,
  );
  return dir;
};
