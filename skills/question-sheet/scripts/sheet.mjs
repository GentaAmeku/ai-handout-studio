#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	render,
	digestOf,
	templatePath,
	checkLayout,
	layoutOf,
} from "./render.mjs";
import {
	validateDocument,
	validateResponse,
	markdown,
	presentationProblems,
	labelWarnings,
	imageWarnings,
} from "./model.mjs";
import { startServer } from "./server.mjs";
const usage = `node scripts/sheet.mjs audit questions.json
node scripts/sheet.mjs render questions.json --out sheet.html [--template <名前>] [--layout focus]
node scripts/sheet.mjs serve questions.json --out answers.json [--timeout 1800] [--port 0] [--template <名前>] [--layout focus]
node scripts/sheet.mjs validate questions.json --answers answers.json
node scripts/sheet.mjs markdown questions.json --answers answers.json --out answers.md
--template はテンプレート名(リポジトリの design/dist/sheet/<名前>.css)か、tokens の CSS のパス。省くと ai-handout-studio で質問票の既定に選ばれたテンプレート(design/dist/sheet/tokens.css)。
--layout は骨格。focus(1問ずつ。広い画面では一覧を開いて始まる)/ overview(focus と同じ)/ all(全問を並べて答える)/ print(印刷向けの書き込み用紙)。省くとテンプレートの骨格(同梱の一覧に無ければ focus)。
Node.js 22以降。serveは回答保存後に終了します。既存の回答・HTMLは上書きしません。`;
try {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			out: { type: "string" },
			answers: { type: "string" },
			timeout: { type: "string" },
			port: { type: "string" },
			template: { type: "string" },
			layout: { type: "string" },
			help: { type: "boolean" },
		},
	});
	if (values.help) {
		console.log(usage);
	} else {
		const [command, path] = positionals;
		if (
			!path ||
			positionals.length !== 2 ||
			!["render", "serve", "validate", "markdown", "audit"].includes(command)
		)
			throw new Error(usage);
		const doc = validateDocument(JSON.parse(await readFile(path, "utf8")));
		if (["render", "serve", "markdown"].includes(command) && !values.out)
			throw new Error("--out が必要です");
		const template = values.template;
		// images の画像のパスは質問 JSON の場所から解く
		const baseDir = dirname(resolve(path));
		const layout = values.layout ?? layoutOf(template);
		if (["render", "serve"].includes(command)) {
			templatePath(template);
			checkLayout(layout);
		}
		if (command === "serve" && layout === "print")
			throw new Error(
				"print は紙に書き込む用紙で、画面から回答を返せません。render で HTML を作ってください",
			);
		if (command === "audit") {
			[...labelWarnings(doc), ...imageWarnings(doc)].forEach((warning) =>
				console.error(`警告: ${warning}`),
			);
			// 画像が読めるかは、描いてみて確かめる(読めなければエラー)
			render(doc, null, { template, layout, baseDir });
			const problems = presentationProblems(doc);
			if (problems.length) throw new Error(problems.join("\n"));
			console.log(
				"比較の組み立てを確認しました。配色と読みやすさは生成画面でも確認してください。",
			);
		}
		if (["render", "serve"].includes(command)) {
			[
				...presentationProblems(doc),
				...labelWarnings(doc),
				...imageWarnings(doc),
			].forEach(
				(problem) => console.error(`表示の確認: ${problem}`),
			);
		}
		if (command === "render") {
			await writeFile(values.out, render(doc, null, { template, layout, baseDir }), {
				flag: "wx",
				mode: 0o600,
			});
			console.log(values.out);
		}
		if (command === "serve") {
			const running = await startServer(doc, values.out, {
				timeout: Number(values.timeout ?? 1800),
				port: Number(values.port ?? 0),
				template,
				layout,
				baseDir,
			});
			console.log(`質問票: ${running.url}`);
			console.log(`回答先: ${values.out}`);
			process.on("SIGINT", () => {
				running.close();
				process.exitCode = 130;
			});
			process.on("SIGTERM", () => {
				running.close();
				process.exitCode = 130;
			});
			running.server.on("close", () => {
				if (!running.accepted() && !process.exitCode) {
					console.error(
						"回答未受領で終了しました。保存した下書きから再開できます。",
					);
					process.exitCode = 2;
				}
			});
		}
		if (["validate", "markdown"].includes(command)) {
			if (!values.answers) throw new Error("--answers が必要です");
			const answers = validateResponse(
				doc,
				digestOf(doc),
				JSON.parse(await readFile(values.answers, "utf8")),
			);
			if (command === "markdown")
				await writeFile(values.out, markdown(doc, answers), {
					flag: "wx",
					mode: 0o600,
				});
			console.log(
				"全回答・質問の版・必須入力を確認しました（外部操作の承認は含みません）。",
			);
		}
	}
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
