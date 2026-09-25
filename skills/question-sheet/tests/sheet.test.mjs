import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	validateDocument,
	completeVisitedAnswer,
	selectedForText,
	markdown,
	initialAnswer,
	validateResponse,
	responseFor,
	recommendedMark,
	labelWarnings,
	imageWarnings,
} from "../scripts/model.mjs";
import {
	render,
	digestOf,
	layoutOf,
} from "../scripts/render.mjs";
import { startServer } from "../scripts/server.mjs";
import { findArchify } from "../scripts/archify.mjs";
const sample = JSON.parse(
	await readFile(
		new URL(
			"../examples/candidates.json",
			import.meta.url,
		),
	),
);
const completed = (doc) =>
	responseFor(
		doc,
		digestOf(doc),
		doc.questions.map((q) => ({ ...initialAnswer(q), reviewed: true })),
	);
test("推奨値は未回答。全件確認と条件付き補足が必要", () => {
	const doc = validateDocument(sample);
	assert.throws(
		() =>
			validateResponse(
				doc,
				digestOf(doc),
				responseFor(doc, digestOf(doc), doc.questions.map(initialAnswer)),
			),
		/確認/,
	);
	const answers = completed(doc);
	validateResponse(doc, digestOf(doc), answers);
	answers.answers[3].selected = ["register"];
	answers.answers[3].text = doc.questions[3].options.find(
		(o) => o.id === "register",
	).label;
	assert.throws(
		() => validateResponse(doc, digestOf(doc), answers),
		/自分が行う部分/,
	);
	answers.answers[3].fields.scope = "テストの確認";
	validateResponse(doc, digestOf(doc), answers);
});
test("質問IDの順番が変わっても対応し、欠落・重複・古い内容を拒否", () => {
	const a = completed(sample);
	a.answers.reverse();
	validateResponse(sample, digestOf(sample), a);
	assert.throws(
		() => validateResponse(sample, digestOf(sample), { ...a, revision: "old" }),
		/古い/,
	);
	assert.throws(
		() =>
			validateResponse(sample, digestOf(sample), {
				...a,
				answers: a.answers.slice(1),
			}),
		/件数/,
	);
	assert.throws(
		() =>
			validateResponse(sample, digestOf(sample), {
				...a,
				answers: a.answers.map(() => a.answers[0]),
			}),
		/重複/,
	);
	const changed = structuredClone(sample);
	changed.questions[0].title = "別の質問";
	assert.throws(() => validateResponse(changed, digestOf(changed), a), /古い/);
});
test("下書きは復元でき、不正なフィールドや選択値は復元しない", () => {
	const a = responseFor(
		sample,
		digestOf(sample),
		sample.questions.map(initialAnswer),
	);
	validateResponse(sample, digestOf(sample), a, false);
	a.answers[0].selected = ["unknown"];
	assert.throws(
		() => validateResponse(sample, digestOf(sample), a, false),
		/選択値/,
	);
});
test("短い説明・構造化図解を検査し、会議文字列をスクリプトにしない", () => {
	const doc = structuredClone(sample);
	doc.questions[0].title = "</script><script>alert(1)</script>";
	const html = render(doc);
	assert.equal((html.match(/<script/g) ?? []).length, 1);
	assert.ok(!html.includes("<script>alert(1)</script>"));
	assert.ok(!html.includes("https://fonts."));
	doc.questions[0].summary = "あ".repeat(141);
	assert.throws(() => render(doc), /140/);
	doc.questions[0].summary = "短い概要";
	doc.questions[5].visual.figure.flow[0].label = "あ".repeat(40);
	assert.throws(() => render(doc), /width/);
});
test("HTTPは正しい回答だけを1度保存し、既存ファイルを上書きしない", async () => {
	const dir = await mkdtemp(join(tmpdir(), "question-sheet-"));
	const out = join(dir, "answers.json");
	const running = await startServer(sample, out, { timeout: 30 });
	const send = (data, origin = running.origin) =>
		fetch(`${running.url}/answers`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body: JSON.stringify(data),
		});
	try {
		assert.equal((await fetch(running.url)).status, 200);
		assert.equal(
			(await send(completed(sample), "http://elsewhere.test")).status,
			403,
		);
		assert.equal(
			(await send({ ...completed(sample), digest: "stale" })).status,
			400,
		);
		const responses = await Promise.all([
			send(completed(sample)),
			send(completed(sample)),
		]);
		assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
		assert.deepEqual(
			JSON.parse(await readFile(out, "utf8")),
			completed(sample),
		);
		await assert.rejects(startServer(sample, out), /既に/);
	} finally {
		running.close();
		await rm(dir, { recursive: true });
	}
});
test("通常の相談は複数選択・自由入力を欠かさずJSON往復できる", async () => {
	const doc = JSON.parse(
		await readFile(
			new URL(
				"../examples/general.json",
				import.meta.url,
			),
		),
	);
	const a = completed(doc);
	assert.throws(() => validateResponse(doc, digestOf(doc), a), /回答を入力/);
	a.answers[2].text = "前の回答へ迷わず戻れる";
	validateResponse(doc, digestOf(doc), JSON.parse(JSON.stringify(a)));
	a.answers[1].selected = [];
	assert.throws(() => validateResponse(doc, digestOf(doc), a), /1つ以上/);
});

test("閲覧した有効な初期値だけ完了し、未入力と他の質問を変えない", () => {
	const first = initialAnswer(sample.questions[0]);
	const other = initialAnswer(sample.questions[1]);
	assert.equal(
		completeVisitedAnswer(sample.questions[0], first).reviewed,
		true,
	);
	assert.equal(first.reviewed, false);
	assert.equal(other.reviewed, false);
	const q = sample.questions[3];
	const incomplete = { ...initialAnswer(q), selected: ["register"] };
	assert.equal(completeVisitedAnswer(q, incomplete).reviewed, false);
});

test("自由に直した回答は選択IDを残さず、文章のまま往復する", () => {
	const doc = sample;
	const response = completed(doc);
	const a = response.answers[0];
	assert.match(a.text, /（推奨）/);
	a.text = "テスト完了後、明日に延期して進めます";
	assert.throws(
		() => validateResponse(doc, digestOf(doc), response),
		/回答文と選択値/,
	);
	a.selected = selectedForText(doc.questions[0], a.text);
	assert.deepEqual(a.selected, []);
	validateResponse(doc, digestOf(doc), response);
	assert.ok(markdown(doc, response).includes(a.text));
	a.text = "";
	assert.throws(
		() => validateResponse(doc, digestOf(doc), response),
		/回答を入力/,
	);
});

test("強調図と補助表は構造を検査し、文をHTMLとして実行しない", () => {
	const doc = structuredClone(sample);
	doc.questions[0].visual = {
		type: "decision",
		caption: "判断点",
		steps: [
			{ id: "a", label: "<img src=x onerror=alert(1)>" },
			{ id: "b", label: "保存" },
		],
		focus: ["b"],
		table: [["条件", "成功後だけ通知"]],
	};
	const html = render(doc);
	assert.ok(html.includes("ab-focus"));
	assert.ok(!html.includes("<img src=x"));
	doc.questions[0].visual.focus = ["missing"];
	assert.throws(() => render(doc), /強調する段/);
});
test("全体図は質問ID参照で結び、未検証のHTML・ファイル参照を受け付けない", () => {
	const doc = structuredClone(sample);
	doc.questions[0].explorer = "map";
	assert.throws(() => validateDocument(doc), /全体図がありません/);
	doc.explorers = [
		{
			id: "map",
			spec: { diagram_type: "architecture", meta: { output: "/tmp/unwanted" } },
		},
	];
	assert.throws(() => validateDocument(doc), /ファイル参照/);
	doc.explorers[0].spec = {
		diagram_type: "architecture",
		components: [{ brand: "https://example.test/logo" }],
	};
	assert.throws(() => validateDocument(doc), /同梱ブランド/);
	doc.explorers = [{ id: "map", spec: "<script>alert(1)</script>" }];
	assert.throws(() => validateDocument(doc), /形式が違います/);
});
test("導入済みArchifyでFlowとLightの全体図を生成する", {
	skip: !findArchify(),
}, async () => {
	const doc = JSON.parse(
		await readFile(
			new URL(
				"../examples/explorer.json",
				import.meta.url,
			),
		),
	);
	const html = render(doc);
	assert.ok(html.includes("signal-flow"));
	assert.ok(!html.includes('<link href=\\"https://fonts.googleapis'));
	const broken = structuredClone(doc);
	broken.explorers[0].spec.connections[0].to = "missing";
	assert.throws(() => render(broken), /全体図の検査に失敗/);
});

test("意味別の注記は許可した種類と文字列だけを扱う", () => {
	const doc = structuredClone(sample);
	doc.questions[0].notices = [
		{ kind: "success", text: "検証通過" },
		{ kind: "warning", text: "</script>" },
	];
	assert.ok(render(doc).includes("検証通過"));
	doc.questions[0].notices[0].kind = "unknown";
	assert.throws(() => render(doc), /notice.kind/);
});

test("4列比較の意味付きセルを安全に描画し、不正な状態は拒否する", () => {
	const doc = structuredClone(sample);
	doc.questions[0].visual = {
		type: "comparison",
		caption: "比較",
		columns: ["案", "変更", "時間", "結果"],
		rows: [
			[
				"A",
				"設定",
				"未計測",
				{ kind: "success", text: "<script>通過</script>" },
			],
		],
	};
	const html = render(doc);
	const payload = JSON.parse(html.split("const payload = ")[1].split(";\n")[0]);
	assert.match(payload.visuals[doc.questions[0].id], /ds-cell-success/);
	assert.match(payload.visuals[doc.questions[0].id], /&lt;script&gt;/);
	assert.equal(
		(payload.visuals[doc.questions[0].id].match(/scope="col"/g) || []).length,
		4,
	);
	doc.questions[0].visual.rows[0][3].kind = "unknown";
	assert.throws(() => render(doc));
});

test("比較不足を検出し、図を使わない理由と自由入力を許容する", async () => {
	const { presentationProblems } = await import(
		"../scripts/model.mjs"
	);
	const doc = structuredClone(sample);
	doc.questions.forEach((q) => {
		delete q.visual;
		delete q.explorer;
		delete q.visualRationale;
	});
	assert.equal(
		presentationProblems(doc).length,
		doc.questions.filter((q) => q.type !== "text").length,
	);
	doc.questions.forEach((q) => {
		q.visualRationale = "本人の希望を尋ねるだけなので比較は不要";
	});
	assert.deepEqual(presentationProblems(doc), []);
});

test("配布する見本は比較の組み立て検査を満たす", async () => {
	const { presentationProblems } = await import(
		"../scripts/model.mjs"
	);
	for (const name of [
		"candidates",
		"general",
		"reading",
		"visual-demo",
		"explorer",
	]) {
		const doc = JSON.parse(
			await readFile(
				new URL(
					`../examples/${name}.json`,
					import.meta.url,
				),
			),
		);
		assert.deepEqual(presentationProblems(doc), [], name);
	}
});

test("--template は同梱のテンプレート名か tokens の CSS のパスで見た目を選び、省くと質問票の既定のテンプレートを使う", async () => {
	const doc = JSON.parse(JSON.stringify(sample));
	const bundled = render(doc);
	const selected = await readFile(
		new URL("../../../design/dist/sheet/tokens.css", import.meta.url),
		"utf8",
	);
	assert.ok(bundled.includes(selected.trim()));
	assert.match(render(doc, null, { template: "default" }), /--color-primary:/);
	assert.match(bundled, /--color-primary:/);
	assert.match(bundled, /class="ds-board"/);
	assert.doesNotMatch(bundled, /--gad-/);
	const dir = await mkdtemp(join(tmpdir(), "question-sheet-template-"));
	try {
		const custom = join(dir, "tokens.acme.css");
		await writeFile(custom, ":root { --color-primary: #0f766e; }\n");
		const themed = render(doc, null, { template: custom });
		assert.match(themed, /--color-primary: #0f766e;/);
		assert.doesNotMatch(themed, /--color-primary: #3b82f6;/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
	assert.throws(
		() => render(doc, null, { template: "missing" }),
		/テンプレート missing は同梱されていません。使えるのは cobalt \/ default \/ paper/,
	);
	assert.throws(
		() => render(doc, null, { template: "./missing.css" }),
		/テンプレートの CSS がありません/,
	);
});

test("見た目は写しを持たず、リポジトリの design/dist を直接読む", async () => {
	const { designDist } = await import("../scripts/design.mjs");
	assert.equal(
		designDist,
		fileURLToPath(new URL("../../../design/dist", import.meta.url)),
	);
	assert.equal(existsSync(new URL("../design-system", import.meta.url)), false);
	const page = render(JSON.parse(JSON.stringify(sample)));
	for (const file of ["sheet/tokens.css", "document.css", "interaction.css"]) {
		const css = await readFile(join(designDist, file), "utf8");
		assert.ok(page.includes(css.trim()), file);
	}
});

test("design/dist が無ければ、render・serve・audit は pnpm install を促して止まる", async () => {
	const { spawnSync } = await import("node:child_process");
	const { cp } = await import("node:fs/promises");
	// リポジトリと同じ並び(<root>/skills/question-sheet)に置き、design/dist だけ無い状態を作る
	const root = await mkdtemp(join(tmpdir(), "question-sheet-nodesign-"));
	try {
		const skill = join(root, "skills", "question-sheet");
		await cp(new URL("../", import.meta.url), skill, { recursive: true });
		const input = join(skill, "examples/general.json");
		const cli = join(skill, "scripts/sheet.mjs");
		for (const args of [
			["render", input, "--out", join(root, "sheet.html")],
			["serve", input, "--out", join(root, "answers.json")],
			["audit", input],
		]) {
			const result = spawnSync(process.execPath, [cli, ...args], {
				encoding: "utf8",
			});
			assert.equal(result.status, 1, args[0]);
			assert.match(result.stderr, /pnpm install を実行してください/, args[0]);
			assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|\n\s+at /, args[0]);
		}
		assert.equal(existsSync(join(root, "sheet.html")), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// 同梱の一覧。--template も省いたときは、ai-handout-studio で質問票の既定に選ばれたテンプレートになる
const bundled = JSON.parse(
	await readFile(
		new URL("../../../design/dist/sheet/templates.json", import.meta.url),
		"utf8",
	),
);
const defaultBase = bundled.templates[bundled.default].base;

test("--layout を省くと、テンプレートの一覧にある骨格の元を使う", () => {
	assert.equal(layoutOf(undefined), defaultBase);
	assert.equal(layoutOf("default"), "focus");
	// パスで渡した CSS は一覧に無いので focus
	assert.equal(layoutOf("./tokens.acme.css"), "focus");
});

test("--layout は骨格を選び、知らない骨格と print の serve を拒否する", async () => {
	const doc = JSON.parse(JSON.stringify(sample));
	assert.equal(render(doc, null, { layout: defaultBase }), render(doc));
	for (const layout of ["focus", "overview", "all", "print"]) {
		const html = render(doc, null, { layout });
		assert.match(html, new RegExp(`<main class="ds-board" data-layout="${layout}"`));
		const payload = JSON.parse(html.split("const payload = ")[1].split(";\n")[0]);
		assert.equal(payload.layout, layout);
	}
	assert.throws(
		() => render(doc, null, { layout: "grid" }),
		/骨格 grid はありません。使えるのは focus \/ overview \/ all \/ print/,
	);
	const dir = await mkdtemp(join(tmpdir(), "question-sheet-layout-"));
	try {
		const { execFileSync } = await import("node:child_process");
		const cli = new URL("../scripts/sheet.mjs", import.meta.url);
		const input = join(dir, "q.json");
		await writeFile(input, JSON.stringify(doc));
		assert.throws(
			() =>
				execFileSync(process.execPath, [cli.pathname, "serve", input, "--out", join(dir, "a.json"), "--layout", "print"], { stdio: "pipe" }),
			(error) => /render で HTML を作ってください/.test(String(error.stderr)),
		);
		const out = join(dir, "print.html");
		execFileSync(process.execPath, [cli.pathname, "render", input, "--out", out, "--layout", "print"], { stdio: "pipe" });
		assert.match(await readFile(out, "utf8"), /data-layout="print"/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("label に (推奨) を書いても「（推奨）」は1回だけで、audit が警告する", async () => {
	const doc = structuredClone(sample);
	const q = doc.questions[0];
	q.options[0].label = "登録する(推奨)";
	q.options[1].label = "推奨値のまま登録しない";
	assert.equal(initialAnswer(q).text, "登録する(推奨)");
	assert.equal(recommendedMark(q, { id: "register", label: "登録する（推奨）" }), "");
	assert.equal(recommendedMark(q, { id: "register", label: "登録する" }), "（推奨）");
	assert.equal(recommendedMark(q, { id: "register", label: "推奨値のまま登録する" }), "（推奨）");
	assert.equal(initialAnswer(sample.questions[0]).text, "登録する（推奨）");
	assert.deepEqual(labelWarnings(doc), [
		"candidate-1: 選択肢 register の label に (推奨) があります。推奨は recommended で示し、label に (推奨) を書かないでください。",
	]);
	assert.deepEqual(labelWarnings(sample), []);
	const dir = await mkdtemp(join(tmpdir(), "question-sheet-recommended-"));
	try {
		const { spawnSync } = await import("node:child_process");
		const cli = new URL("../scripts/sheet.mjs", import.meta.url);
		const input = join(dir, "q.json");
		await writeFile(input, JSON.stringify(doc));
		const audit = spawnSync(process.execPath, [cli.pathname, "audit", input], { encoding: "utf8" });
		assert.equal(audit.status, 0);
		assert.match(audit.stderr, /警告: candidate-1: 選択肢 register の label に \(推奨\) があります/);
		assert.match(audit.stdout, /比較の組み立てを確認しました/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("images は案ごとの画像を質問 JSON の場所から読んで埋め込み、見た目の質問に画像が無ければ audit が警告する", async () => {
	const examples = new URL("../examples/", import.meta.url);
	const doc = JSON.parse(await readFile(new URL("images.json", examples), "utf8"));
	validateDocument(doc);
	assert.deepEqual(imageWarnings(doc), []);
	const html = render(doc, null, { baseDir: examples.pathname });
	// 図は client.js へ JSON で渡るので、< は \u003c、" は \" になっている
	assert.equal(html.match(/img src=\\"data:image\/png;base64,/g)?.length, 2);
	assert.match(html, /ds-images-grid/);
	assert.equal(digestOf(doc), digestOf(JSON.parse(JSON.stringify(doc))));
	const missing = structuredClone(doc);
	missing.questions[0].visual.items[0].src = "images/none.png";
	assert.throws(() => render(missing, null, { baseDir: examples.pathname }), /画像が見つかりません/);
	const url = structuredClone(doc);
	url.questions[0].visual.items[0].src = "https://example.com/a.png";
	assert.throws(() => validateDocument(url), /URL と data: は書けません/);
	const plain = structuredClone(doc);
	delete plain.questions[0].visual;
	plain.questions[0].visualRationale = "比べない";
	assert.deepEqual(imageWarnings(plain), [
		"card-size: 見た目に関わる質問(「見た目」)に案ごとの画像がありません。visual を images にして、案ごとのイメージ画像を並べてください(要らない質問なら無視してよい)。",
	]);
	const { spawnSync } = await import("node:child_process");
	const cli = new URL("../scripts/sheet.mjs", import.meta.url);
	const audit = spawnSync(process.execPath, [cli.pathname, "audit", new URL("images.json", examples).pathname], { encoding: "utf8" });
	assert.equal(audit.status, 0, audit.stderr);
	assert.doesNotMatch(audit.stderr, /警告/);
});
test("アプリが保存した lang(ja・en)を受け、ほかの値は断る。英語の推奨の印も回答から外して選択肢に戻す", () => {
	const ja = validateDocument({ ...structuredClone(sample), lang: "ja" });
	assert.equal(ja.lang, "ja");
	const en = validateDocument({ ...structuredClone(sample), lang: "en" });
	assert.equal(en.lang, "en");
	assert.throws(
		() => validateDocument({ ...structuredClone(sample), lang: "EN" }),
		/lang は ja か en です/,
	);
	const q = en.questions.find((question) => question.options?.length);
	const option = q.options[0];
	assert.deepEqual(selectedForText(q, `${option.label} (recommended)`), [
		option.id,
	]);
});
