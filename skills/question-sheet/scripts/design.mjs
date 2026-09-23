// 質問票の見た目は、このスキルが入っているリポジトリ(ai-handout-studio)の design/dist を直接読む。
// スキルは ~/.claude/skills などから symlink で見せるので、場所はこのファイルの実体から辿る
// (Node は import.meta.url を symlink を解いた場所にするが、念のため realpath を通す)。
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(realpathSync(fileURLToPath(import.meta.url)));

// skills/question-sheet/scripts から3つ上がリポジトリの直下
export const repoRoot = join(scriptsDir, "..", "..", "..");
export const designDist = join(repoRoot, "design", "dist");

// design/dist は git に入らない生成物。pnpm install(prepare)か pnpm design:build で作られる
export const designBuilt = () =>
	["sheet/tokens.css", "sheet/templates.json", "figure/render.mjs"].every(
		(file) => existsSync(join(designDist, file)),
	);

export const missingDesignMessage = () =>
	`質問票の見た目(${designDist})がありません。リポジトリ(${repoRoot})で pnpm install を実行してください(作り直すだけなら pnpm design:build)。`;

export const requireDesign = () => {
	if (!designBuilt()) throw new Error(missingDesignMessage());
	return designDist;
};
