const fail = (message) => {
	throw new Error(message);
};
const object = (value) =>
	value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed, at) => {
	if (!object(value)) fail(`${at}: オブジェクトが必要です`);
	if (Object.keys(value).some((key) => !allowed.includes(key)))
		fail(`${at}: 未対応の項目があります`);
};
const str = (value, max, at, optional = false) => {
	if (optional && value === undefined) return;
	if (
		typeof value !== "string" ||
		value.length > max ||
		(!optional && !value.trim())
	)
		fail(`${at}: 1〜${max}字で指定してください`);
};
const identifier = (value, at) => {
	if (
		typeof value !== "string" ||
		!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value)
	)
		fail(`${at}: 英数字・点・ハイフン・下線で指定してください`);
};
const unique = (values, at) => {
	if (new Set(values).size !== values.length) fail(`${at}: IDが重複しています`);
};
export const validateDocument = (doc) => {
	keys(
		doc,
		[
			"schemaVersion",
			"id",
			"revision",
			"title",
			"description",
			"context",
			"questions",
			"explorers",
			"lang",
		],
		"質問群",
	);
	if (doc.schemaVersion !== 1) fail("schemaVersion は1です");
	// 画面の文言の言語(アプリの sheet new が保存のときに入れる)。このスキルの画面は日本語のまま
	if (doc.lang !== undefined && doc.lang !== "ja" && doc.lang !== "en")
		fail("lang は ja か en です");
	identifier(doc.id, "id");
	identifier(doc.revision, "revision");
	str(doc.title, 80, "title");
	str(doc.description, 200, "description", true);
	str(doc.context, 200, "context", true);
	if (
		!Array.isArray(doc.questions) ||
		doc.questions.length < 1 ||
		doc.questions.length > 60
	)
		fail("質問は1〜60件にしてください");
	if (doc.explorers !== undefined) {
		if (!Array.isArray(doc.explorers) || doc.explorers.length > 5)
			fail("全体図は5件までです");
		unique(
			doc.explorers.map((e) => e?.id),
			"全体図",
		);
		doc.explorers.forEach((e) => {
			keys(e, ["id", "spec"], "全体図");
			identifier(e.id, "explorer.id");
			if (
				!object(e.spec) ||
				![
					"architecture",
					"workflow",
					"sequence",
					"dataflow",
					"lifecycle",
				].includes(e.spec.diagram_type)
			)
				fail("全体図の形式が違います");
			if (JSON.stringify(e.spec).length > 200000)
				fail("全体図の情報が多すぎます");
			const inspect = (value) => {
				if (Array.isArray(value)) {
					value.forEach(inspect);
					return;
				}
				if (!object(value)) return;
				Object.entries(value).forEach(([key, value]) => {
					if (["sources", "repository", "output"].includes(key))
						fail("全体図にファイル参照・出力先は指定できません");
					if (
						key === "brand" &&
						(typeof value !== "string" || /https?:/i.test(value))
					)
						fail("全体図は同梱ブランドだけ使えます");
					inspect(value);
				});
			};
			inspect(e.spec);
		});
	}
	unique(
		doc.questions.map((q) => q?.id),
		"質問",
	);
	doc.questions.forEach((q) => {
		keys(
			q,
			[
				"id",
				"title",
				"summary",
				"type",
				"options",
				"recommended",
				"detail",
				"notices",
				"visualRationale",
				"evidence",
				"visual",
				"fields",
				"noteLabel",
				"explorer",
			],
			"質問",
		);
		identifier(q.id, "question.id");
		if (
			q.explorer !== undefined &&
			!doc.explorers?.some((e) => e.id === q.explorer)
		)
			fail("質問が参照する全体図がありません");
		str(q.title, 60, "title");
		str(q.summary, 140, "summary", true);
		str(q.detail, 1200, "detail", true);
		str(q.visualRationale, 140, "visualRationale", true);
		if (q.notices !== undefined) {
			if (!Array.isArray(q.notices) || q.notices.length > 3)
				fail("notices は3件までです");
			q.notices.forEach((notice) => {
				keys(notice, ["kind", "text"], "notice");
				if (!["success", "info", "warning"].includes(notice.kind))
					fail("notice.kind は success / info / warning です");
				str(notice.text, 140, "notice.text");
			});
		}
		str(q.noteLabel, 60, "noteLabel", true);
		if (!["single", "multiple", "text"].includes(q.type))
			fail("type は single / multiple / text です");
		if (q.type !== "text") {
			if (
				!Array.isArray(q.options) ||
				q.options.length < 2 ||
				q.options.length > 6
			)
				fail("選択肢は2〜6件にしてください");
			unique(
				q.options.map((o) => o?.id),
				"選択肢",
			);
			q.options.forEach((o) => {
				keys(o, ["id", "label"], "選択肢");
				identifier(o.id, "option.id");
				str(o.label, 50, "option.label");
			});
		} else if (q.options !== undefined || q.recommended !== undefined)
			fail("自由入力には選択肢・推奨値を付けません");
		if (q.recommended !== undefined) {
			if (
				!Array.isArray(q.recommended) ||
				!q.recommended.length ||
				(q.type === "single" && q.recommended.length !== 1) ||
				q.recommended.some((id) => !q.options.some((o) => o.id === id))
			)
				fail("推奨値が選択肢と一致しません");
			unique(q.recommended, "推奨値");
		}
		if (q.evidence !== undefined) {
			if (!Array.isArray(q.evidence) || q.evidence.length > 3)
				fail("根拠は3件までにしてください");
			q.evidence.forEach((e) => {
				keys(e, ["label", "text"], "根拠");
				str(e.label, 80, "evidence.label");
				str(e.text, 240, "evidence.text");
			});
		}
		if (q.fields !== undefined) {
			if (!Array.isArray(q.fields) || q.fields.length > 4)
				fail("追加欄は4件までにしてください");
			unique(
				q.fields.map((f) => f?.id),
				"追加欄",
			);
			q.fields.forEach((f) => {
				keys(
					f,
					["id", "label", "initial", "required", "requiredWhen", "multiline"],
					"追加欄",
				);
				identifier(f.id, "field.id");
				str(f.label, 60, "field.label");
				str(f.initial, 20000, "field.initial", true);
				if (f.required !== undefined && typeof f.required !== "boolean")
					fail("required は真偽値です");
				if (f.multiline !== undefined && typeof f.multiline !== "boolean")
					fail("multiline は真偽値です");
				if (
					f.requiredWhen !== undefined &&
					(!Array.isArray(f.requiredWhen) ||
						!f.requiredWhen.length ||
						f.requiredWhen.some((id) => !q.options?.some((o) => o.id === id)))
				)
					fail("requiredWhen が選択肢と一致しません");
			});
		}
		if (q.visual !== undefined) {
			keys(
				q.visual,
				[
					"type",
					"caption",
					"columns",
					"rows",
					"figure",
					"steps",
					"focus",
					"table",
					"items",
				],
				"図解",
			);
			if (q.visual.type === "decision") {
				str(q.visual.caption, 140, "caption");
				if (
					!Array.isArray(q.visual.steps) ||
					q.visual.steps.length < 2 ||
					q.visual.steps.length > 6
				)
					fail("強調図は2〜6段です");
				q.visual.steps.forEach((step) => {
					keys(step, ["id", "label", "role"], "段");
					identifier(step.id, "step.id");
					str(step.label, 40, "step.label");
					str(step.role, 30, "step.role", true);
				});
				unique(
					q.visual.steps.map((step) => step.id),
					"段",
				);
				if (
					!Array.isArray(q.visual.focus) ||
					!q.visual.focus.length ||
					q.visual.focus.some(
						(id) => !q.visual.steps.some((step) => step.id === id),
					)
				)
					fail("強調する段がありません");
				if (q.visual.table !== undefined) {
					if (
						!Array.isArray(q.visual.table) ||
						q.visual.table.length < 1 ||
						q.visual.table.length > 4
					)
						fail("補助表は1〜4行です");
					q.visual.table.forEach((row) => {
						if (!Array.isArray(row) || row.length !== 2)
							fail("補助表は2列です");
						row.forEach((cell) => str(cell, 80, "セル"));
					});
				}
				if (
					["figure", "columns", "rows"].some((k) => q.visual[k] !== undefined)
				)
					fail("強調図の項目が違います");
			} else if (q.visual.type === "comparison") {
				str(q.visual.caption, 140, "caption");
				if (
					!Array.isArray(q.visual.columns) ||
					q.visual.columns.length < 2 ||
					q.visual.columns.length > 4
				)
					fail("比較表は2〜4列です");
				q.visual.columns.forEach((c) => str(c, 30, "列名"));
				if (
					!Array.isArray(q.visual.rows) ||
					!q.visual.rows.length ||
					q.visual.rows.length > 4
				)
					fail("比較表は1〜4行です");
				q.visual.rows.forEach((r) => {
					if (!Array.isArray(r) || r.length !== q.visual.columns.length)
						fail("比較表の列数が一致しません");
					r.forEach((c) => {
						if (typeof c === "string") return str(c, 100, "セル");
						keys(c, ["text", "kind"], "セル");
						str(c.text, 100, "セル.text");
						if (!["success", "info", "warning"].includes(c.kind))
							fail("セル.kind は success / info / warning です");
					});
				});
				if (q.visual.figure !== undefined) fail("比較表にfigureは不要です");
			} else if (q.visual.type === "flow") {
				if (
					!object(q.visual.figure) ||
					Object.keys(q.visual).some((k) => !["type", "figure"].includes(k))
				)
					fail("flowにはfigureを指定してください");
			} else if (q.visual.type === "images") {
				// 案ごとのイメージ画像。src は質問 JSON からの相対パスか絶対パスの PNG・JPEG・WebP
				str(q.visual.caption, 140, "caption", true);
				if (
					!Array.isArray(q.visual.items) ||
					q.visual.items.length < 1 ||
					q.visual.items.length > 4
				)
					fail("イメージ画像は1〜4枚です");
				q.visual.items.forEach((item) => {
					keys(item, ["src", "label", "alt"], "画像");
					str(item.src, 1000, "画像.src");
					if (/^[a-z][a-z0-9+.-]*:/i.test(item.src) || item.src.includes("\\"))
						fail("画像.src はファイルのパスで指定してください(URL と data: は書けません)");
					str(item.label, 50, "画像.label");
					if (typeof item.alt !== "string" || item.alt.length > 200)
						fail("画像.alt: 200字までの文字で指定してください");
				});
				if (
					["figure", "columns", "rows", "steps", "focus", "table"].some(
						(k) => q.visual[k] !== undefined,
					)
				)
					fail("イメージ画像の項目が違います");
			} else fail("図解は decision / comparison / flow / images です");
		}
	});
	return doc;
};
export const selectedForText = (q, text) => {
	const plain = text
		.replace(/（推奨）|\(推奨\)|\s*\(recommended\)/gi, "")
		.trim();
	const option = q.options?.find((o) => o.label === plain);
	return option ? [option.id] : [];
};
// 画面が推奨の選択肢に付ける「（推奨）」。作者が label の末尾に書いていたら二重にしない
export const recommendedMark = (q, option) =>
	q.recommended?.includes(option.id) &&
	!/(?:\(推奨\)|（推奨）)$/.test(option.label.trim())
		? "（推奨）"
		: "";
export const initialAnswer = (q) => ({
	id: q.id,
	selected: [...(q.recommended ?? [])],
	text:
		q.type === "single" && q.recommended?.length
			? ((option) => `${option.label}${recommendedMark(q, option)}`)(
					q.options.find((o) => o.id === q.recommended[0]),
				)
			: "",
	fields: Object.fromEntries(
		(q.fields ?? []).map((f) => [f.id, f.initial ?? ""]),
	),
	reviewed: false,
});
export const fieldRequired = (field, answer) =>
	field.required === true ||
	(field.requiredWhen ?? []).some((id) => answer.selected.includes(id)) ||
	(!!field.requiredWhen?.length &&
		!answer.selected.length &&
		typeof answer.text === "string" &&
		!!answer.text.trim());
export const answerProblems = (q, a, complete = true) => {
	const problems = [];
	if (!object(a)) return ["回答がありません"];
	if (a.id !== q.id) problems.push("質問IDが一致しません");
	if (
		!Array.isArray(a.selected) ||
		a.selected.some((id) => !q.options?.some((o) => o.id === id)) ||
		new Set(a.selected).size !== a.selected.length
	)
		problems.push("選択値が一致しません");
	if (
		q.type === "single" &&
		Array.isArray(a.selected) &&
		(a.selected.length > 1 ||
			(typeof a.text === "string" &&
				JSON.stringify(a.selected) !==
					JSON.stringify(selectedForText(q, a.text))))
	)
		problems.push("回答文と選択値が一致しません");
	if (q.type === "multiple" && complete && !a.selected?.length)
		problems.push("1つ以上選んでください");
	if (
		typeof a.text !== "string" ||
		a.text.length > 20000 ||
		(q.type !== "multiple" && complete && !a.text.trim())
	)
		problems.push("回答を入力してください（20,000字以内）");
	if (typeof a.reviewed !== "boolean" || (complete && !a.reviewed))
		problems.push("内容を確認してください");
	if (
		!object(a.fields) ||
		Object.keys(a.fields).some(
			(id) => !(q.fields ?? []).some((f) => f.id === id),
		)
	)
		problems.push("追加欄が一致しません");
	(q.fields ?? []).forEach((f) => {
		const value = a.fields?.[f.id];
		if (typeof value !== "string" || value.length > 20000)
			problems.push(`${f.label}の形式が違います`);
		else if (
			complete &&
			Array.isArray(a.selected) &&
			fieldRequired(f, a) &&
			!value.trim()
		)
			problems.push(`${f.label}を入力してください`);
	});
	if (
		Object.keys(a).some(
			(key) => !["id", "selected", "text", "fields", "reviewed"].includes(key),
		)
	)
		problems.push("未対応の回答項目があります");
	return problems;
};
export const validateResponse = (doc, digest, response, complete = true) => {
	keys(
		response,
		["schemaVersion", "documentId", "revision", "digest", "answers"],
		"回答",
	);
	if (
		response.schemaVersion !== 1 ||
		response.documentId !== doc.id ||
		response.revision !== doc.revision ||
		response.digest !== digest
	)
		fail("別の質問群または古い版の回答です");
	if (
		!Array.isArray(response.answers) ||
		response.answers.length !== doc.questions.length
	)
		fail("質問と回答の件数が一致しません");
	unique(
		response.answers.map((a) => a?.id),
		"回答",
	);
	doc.questions.forEach((q) => {
		const problems = answerProblems(
			q,
			response.answers.find((a) => a?.id === q.id),
			complete,
		);
		if (problems.length) fail(`${q.title}: ${problems.join(" / ")}`);
	});
	return response;
};
export const responseFor = (doc, digest, answers) => ({
	schemaVersion: 1,
	documentId: doc.id,
	revision: doc.revision,
	digest,
	answers,
});
export const markdown = (doc, response) =>
	[
		`# ${doc.title}`,
		`質問群: ${doc.id} / 版: ${doc.revision} / 照合値: ${response.digest}`,
		"回答の返却です。外部操作の承認は含みません。",
		...doc.questions.map((q) => {
			const a = response.answers.find((item) => item.id === q.id);
			return [
				`\n## ${q.title} (${q.id})`,
				`回答: ${q.type !== "multiple" ? a.text : a.selected.map((id) => q.options.find((o) => o.id === id).label).join(" / ")}`,
				...(q.type === "multiple" && a.text ? [`補足: ${a.text}`] : []),
				...(q.fields ?? [])
					.filter((f) => a.fields[f.id])
					.map((f) => `${f.label}: ${a.fields[f.id]}`),
			].join("\n");
		}),
	].join("\n\n");

// Authoring check: 推奨は recommended で示す。label の (推奨) は画面の「（推奨）」と重なる。
// 半角・全角の括弧の形だけを見て、「推奨値」のような語は対象にしない。
export const labelWarnings = (input) =>
	validateDocument(input).questions.flatMap((q) =>
		(q.options ?? [])
			.filter((o) => /\(推奨\)|（推奨）/.test(o.label))
			.map(
				(o) =>
					`${q.id}: 選択肢 ${o.id} の label に (推奨) があります。推奨は recommended で示し、label に (推奨) を書かないでください。`,
			),
	);

// Authoring check: 見た目・画面・配置・色の案を選ぶ質問は、案ごとのイメージ画像(images)を主図にする。
// 題と要約の語で見る(選択肢の文までは見ない)。外れることもあるので警告にとどめる。
const LOOK_WORD = /デザイン|見た目|レイアウト|配色|配置|色|UI|モック|画面|意匠|外観/;
export const imageWarnings = (input) =>
	validateDocument(input).questions.flatMap((q) => {
		if (!q.options?.length || q.visual?.type === "images") return [];
		const word = LOOK_WORD.exec(`${q.title}\n${q.summary ?? ""}`)?.[0];
		return word
			? [
					`${q.id}: 見た目に関わる質問(「${word}」)に案ごとの画像がありません。visual を images にして、案ごとのイメージ画像を並べてください(要らない質問なら無視してよい)。`,
				]
			: [];
	});

// Navigating away accepts a valid default without adding a confirmation action.
export const completeVisitedAnswer = (question, answer) => {
	const candidate = { ...answer, reviewed: true };
	return answerProblems(question, candidate).length ? answer : candidate;
};

// Authoring check: keep legacy rendering available, but require an explicit choice
// before handing off a newly authored comparison question.
export const presentationProblems = (input) => {
	const doc = validateDocument(input);
	return doc.questions.flatMap((q) =>
		q.type !== "text" && !q.visual && !q.explorer && !q.visualRationale
			? [
					`${q.id}: 選択肢の違いを比較表か図に整理してください。不要なら visualRationale に理由を記してください。`,
				]
			: [],
	);
};
