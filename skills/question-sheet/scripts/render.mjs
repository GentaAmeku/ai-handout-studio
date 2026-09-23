import { renderExplorer } from "./explorer.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { validateDocument } from "./model.mjs";
import { designBuilt, designDist, requireDesign } from "./design.mjs";
// 流れの図の生成器もリポジトリの design/dist から読む。
// 無ければ(pnpm install の前)、描くときに requireDesign が作り方を伝えて止める
const figure = designBuilt()
	? await import(pathToFileURL(join(designDist, "figure/render.mjs")).href)
	: undefined;
// テンプレート(色・書体・余白・部品の変種・骨格の寸法)。名前なら design/dist/sheet/<名前>.css、
// パス(/ を含むか .css で終わる)ならそのファイルを tokens として読む。
// 省くと design/dist/sheet/tokens.css(ai-handout-studio で質問票の既定に選ばれたテンプレート)を使う
const sheetDir = join(designDist, "sheet");
const templateIndex = () => {
	const path = join(sheetDir, "templates.json");
	return existsSync(path)
		? JSON.parse(readFileSync(path, "utf8"))
		: { default: undefined, templates: {} };
};
export const templateNames = () => Object.keys(templateIndex().templates).sort();
export const templatePath = (template) => {
	requireDesign();
	if (template === undefined) return join(sheetDir, "tokens.css");
	if (template.includes("/") || template.endsWith(".css")) {
		const path = resolve(template);
		if (!existsSync(path))
			throw new Error(`テンプレートの CSS がありません: ${path}`);
		return path;
	}
	if (!templateNames().includes(template))
		throw new Error(
			`テンプレート ${template} は同梱されていません。使えるのは ${templateNames().join(" / ")} か、tokens の CSS のパスです`,
		);
	return join(sheetDir, `${template}.css`);
};
// --layout を省いたときの骨格。テンプレートの骨格の元(base)、パスや一覧に無いときは focus
export const layoutOf = (template) => {
	const index = templateIndex();
	const name = template ?? index.default;
	return index.templates[name]?.base ?? "focus";
};
// 骨格の変種。HTML の組み立ての差は client.js が持ち、CSS は data-layout で分かれる
export const layouts = ["focus", "overview", "all", "print"];
export const checkLayout = (layout) => {
	if (!layouts.includes(layout))
		throw new Error(
			`骨格 ${layout} はありません。使えるのは ${layouts.join(" / ")} です`,
		);
	return layout;
};
export const digestOf = (doc) =>
	createHash("sha256").update(JSON.stringify(doc)).digest("hex");
const escape = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
// 案ごとのイメージ画像。質問 JSON の場所(baseDir)から読んで data: で埋め込む。
// 読めない・受け付けない画像は、配った先で欠けるのでエラーにする
const imageMime = (bytes) =>
	bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
		? "image/png"
		: bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
			? "image/jpeg"
			: bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
					bytes.subarray(8, 12).toString("latin1") === "WEBP"
				? "image/webp"
				: undefined;
const IMAGE_LIMIT = 3 * 1024 * 1024;
const imageDataUrl = (src, baseDir) => {
	const path = resolve(baseDir, src);
	if (!existsSync(path)) throw new Error(`画像が見つかりません: ${src}`);
	const bytes = readFileSync(path);
	if (bytes.length > IMAGE_LIMIT)
		throw new Error(`画像が大きすぎます(3MB まで): ${src}`);
	const mime = imageMime(bytes);
	if (!mime)
		throw new Error(`画像は PNG・JPEG・WebP だけ使えます: ${src}`);
	return `data:${mime};base64,${bytes.toString("base64")}`;
};
const imagesMarkup = (visual, baseDir) =>
	`<figure class="ds-images"><div class="ds-images-grid">${visual.items
		.map(
			(item) =>
				`<figure class="ds-images-item"><div class="ds-figure-frame"><img src="${escape(imageDataUrl(item.src, baseDir))}" alt="${escape(item.alt)}"></div><figcaption>${escape(item.label)}</figcaption></figure>`,
		)
		.join("")}</div>${visual.caption ? `<figcaption>${escape(visual.caption)}</figcaption>` : ""}</figure>`;
const cellMarkup = (cell) =>
	typeof cell === "string"
		? escape(cell)
		: `<span class="ds-cell-status ds-cell-${cell.kind}">${{ success: "✓", info: "ⓘ", warning: "⚠" }[cell.kind]} ${escape(cell.text)}</span>`;
export const render = (
	input,
	endpoint = null,
	// baseDir は質問 JSON のある場所。images の画像のパスはここから解く
	{ template, layout = layoutOf(template), baseDir = process.cwd() } = {},
) => {
	checkLayout(layout);
	const doc = validateDocument(input);
	const explorers = Object.fromEntries(
		(doc.explorers ?? []).map((e) => [e.id, renderExplorer(e.spec)]),
	);
	const visuals = Object.fromEntries(
		doc.questions
			.filter((q) => q.visual)
			.map((q) => {
				const visual = q.visual;
				if (visual.type === "images")
					return [q.id, imagesMarkup(visual, baseDir)];
				if (visual.type === "decision")
					return [
						q.id,
						`<figure class="ab-decision"><ol class="ab-steps">${visual.steps.map((step) => `<li class="${visual.focus.includes(step.id) ? "ab-focus" : ""}"><span>${escape(step.label)}</span>${step.role ? `<small>${escape(step.role)}</small>` : ""}${visual.focus.includes(step.id) ? '<small class="ab-focus-label">判断点</small>' : ""}</li>`).join("")}</ol><figcaption>${escape(visual.caption)}</figcaption>${visual.table ? `<table class="ds-table"><tbody>${visual.table.map((row) => `<tr><th scope="row">${escape(row[0])}</th><td>${escape(row[1])}</td></tr>`).join("")}</tbody></table>` : ""}</figure>`,
					];
				if (visual.type === "flow") {
					requireDesign();
					const diagnostics = figure.validate(visual.figure);
					if (diagnostics.length)
						throw new Error(figure.formatDiagnostics(diagnostics));
					return [q.id, figure.snippet(visual.figure)];
				}
				return [
					q.id,
					`<figure class="ds-comparison"><figcaption>${escape(visual.caption)}</figcaption><div class="ds-table-scroll" role="region" aria-label="${escape(visual.caption)}" tabindex="0"><table class="ds-table"><thead><tr>${visual.columns.map((c) => `<th scope="col">${escape(c)}</th>`).join("")}</tr></thead><tbody>${visual.rows.map((r) => `<tr>${r.map((c) => `<td>${cellMarkup(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></figure>`,
				];
			}),
	);
	const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
	const css = [
		readFileSync(templatePath(template), "utf8"),
		...["document.css", "interaction.css"].map((f) =>
			readFileSync(join(requireDesign(), f), "utf8"),
		),
		read("../assets/visual.css"),
	].join("\n");
	const data = JSON.stringify({
		doc,
		digest: digestOf(doc),
		visuals,
		explorers,
		endpoint,
		layout,
	})
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
	const script = `${read("./model.mjs").replaceAll("export const ", "const ")}\nconst payload = ${data};\n${read("../assets/client.js")}`;
	return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data: blob:; frame-src 'self' about:; base-uri 'none'; form-action 'none'"><title>${escape(doc.title)} — 質問票</title><style>${css}</style></head><body><main class="ds-board" data-layout="${layout}" id="app"></main><script type="module">${script}</script></body></html>`;
};
