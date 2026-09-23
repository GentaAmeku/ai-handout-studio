import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 入れ方と公式の場所。ai-handout-studio の diagram と doctor も使う
export const archifyInstall = "npx skills add tt-a1i/archify -g";
export const archifyHome = "https://github.com/tt-a1i/archify";
export const installHint = `Archify が必要です。${archifyInstall} で導入してください（${archifyHome}）。別の場所に導入済みなら ARCHIFY_SKILL_DIR に SKILL.md のあるディレクトリを指定してください。自動インストールは行いません。`;
const agentDirectories = [".agents", ".claude", ".codex", ".cursor"];
const locations = (root) =>
	agentDirectories.map((agent) => join(root, agent, "skills/archify"));
const ancestors = (path) =>
	dirname(path) === path ? [path] : [path, ...ancestors(dirname(path))];
export const findArchify = ({
	env = process.env,
	cwd = process.cwd(),
	home = homedir(),
} = {}) => {
	const candidates = env.ARCHIFY_SKILL_DIR
		? [resolve(cwd, env.ARCHIFY_SKILL_DIR)]
		: [
				...ancestors(resolve(cwd)).flatMap(locations),
				...(env.CODEX_HOME ? [join(env.CODEX_HOME, "skills/archify")] : []),
				...locations(home),
			];
	return (
		candidates.find(
			(root) =>
				existsSync(join(root, "SKILL.md")) &&
				existsSync(join(root, "bin/archify.mjs")),
		) ?? null
	);
};
export const requireArchify = (options) => {
	const root = findArchify(options);
	if (!root) throw new Error(installHint);
	return root;
};

// Adapt only the generated embedding. Never patch the installed skill.
export const embedExplorer = (html, root) => {
	if (!/<head\b[^>]*>/i.test(html))
		throw new Error(
			"Archify の出力に head がありません。導入版の出力形式を確認してください。",
		);
	const secured = html
		.replace(/<link\b[^>]*href=["']https:\/\/fonts\.[^>]*>/gi, "")
		.replaceAll(
			"window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'",
			"'light'",
		)
		.replace(
			/<head\b[^>]*>/i,
			`$&<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">`,
		);
	const notices = ["LICENSE", "THIRD_PARTY_NOTICES.md"]
		.filter((name) => existsSync(join(root, name)))
		.map((name) => readFileSync(join(root, name), "utf8"))
		.join("\n")
		.replaceAll("--", "- -");
	return `${secured}\n<!-- Archify: https://github.com/tt-a1i/archify\n${notices}\n-->`;
};
if (
	process.argv[1] &&
	existsSync(process.argv[1]) &&
	import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
	try {
		console.log(requireArchify());
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
