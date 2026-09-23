// 画面の DOM の正は ai-handout-studio の app/server/sheet-sample.ts(見本 design/samples/sheet.<骨格>.html)。
// class や並びを変えるときは、先に ai-handout-studio の見本を直してから合わせる。
// 骨格(layout): focus = 1問ずつ・広い画面では一覧を開いて始める / overview = focus と同じ /
// all = 全問を縦に並べてその場で答える / print = 全問を縦に並べ、紙に書き込む
const { doc, digest, visuals, explorers, endpoint, layout } = payload;
const paged = layout === "focus" || layout === "overview";
const count = doc.questions.length;
const storageKey = `question-sheet:${doc.id}:${doc.revision}:${digest}`;
const state = {
	answers: doc.questions.map(initialAnswer),
	current: 0,
	busy: false,
	submitted: false,
};
const el = (tag, attrs = {}, children = []) => {
	const node = document.createElement(tag);
	Object.entries(attrs).forEach(([key, value]) => {
		if (key === "text") node.textContent = value;
		else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
		else if (key === "class") node.className = value;
		else node.setAttribute(key, value);
	});
	children.forEach((child) => node.append(child));
	return node;
};
// 記入欄が必須かどうかの印。問い(選択肢そのもの)には持たせず、記入欄だけに出す(ai-handout-studio チケット86 と同じ字と DOM)
const requirement = (field, q) => {
	if (field.required)
		return el("span", { class: "ds-requirement", "data-required": "true", text: "※必須" });
	if (field.requiredWhen?.length) {
		const labels = field.requiredWhen.map(
			(id) => q.options?.find((o) => o.id === id)?.label ?? id,
		);
		return el("span", {
			class: "ds-requirement",
			"data-required": "true",
			text: `※「${labels.join("・")}」を選んだら必須`,
		});
	}
	return el("span", { class: "ds-requirement", "data-required": "false", text: "※任意" });
};
const button = (text, action, primary = false) =>
	el("button", {
		type: "button",
		class: `ds-button${primary ? " ds-button-primary" : ""}`,
		text,
		onclick: action,
	});
const app = document.querySelector("#app");
// focus・overview は1問ずつ、この区画を描き替える
const page = el("section", {
	class: "ds-question-content",
	"aria-labelledby": "question-heading",
});
// all・print は全問を並べる
const list = el("div", { class: "ds-question-list" });
// all の回答一覧。開くまで置かない
const reviewSlot = el("section", {
	class: "ds-question-content",
	"aria-labelledby": "review-heading",
});
const navList = el("ol", { class: "ds-question-nav" });
const progress = el("p", { class: "ds-subtle", "aria-live": "polite" });
const pageProgress = el("p", {
	class: "ds-page-progress",
	"aria-live": "polite",
});
const navBar = el("nav", {
	class: "ds-page-navigation",
	"aria-label": paged ? "質問の移動" : "回答の送信",
});
const message = el("p", {
	class: "ds-subtle",
	role: "status",
	"aria-live": "polite",
});
const errors = el("p", { class: "ds-error", role: "alert", hidden: "" });
const controls = new Map();
const answer = (q) => state.answers.find((a) => a.id === q.id);
const response = () => responseFor(doc, digest, state.answers);
const reviewing = () => state.current >= count;
const say = (text) => {
	message.textContent = text;
};
const complain = (text) => {
	errors.textContent = text;
	errors.hidden = false;
};
const grow = (input) => {
	input.style.height = "auto";
	input.style.height = `${input.scrollHeight}px`;
};
const growAll = () =>
	requestAnimationFrame(() => app.querySelectorAll("textarea").forEach(grow));
const sync = () => {
	sidebarToggle.textContent = sidebar.hidden
		? "質問一覧を開く"
		: "質問一覧を閉じる";
	const done = doc.questions.filter(
		(q) => !answerProblems(q, answer(q)).length,
	).length;
	progress.textContent = `${done} / ${count} 問 入力済み`;
	pageProgress.replaceChildren(
		...(paged
			? [
					el("span", {
						text: reviewing()
							? "回答一覧"
							: `質問 ${state.current + 1} / ${count}`,
					}),
				]
			: []),
		el("span", { text: `${done} 問入力済み` }),
	);
	doc.questions.forEach((q, index) => {
		const a = answer(q);
		const c = controls.get(q.id);
		const nav = navList.children[index].querySelector("button");
		if (paged && index === state.current)
			nav.setAttribute("aria-current", "step");
		else nav.removeAttribute("aria-current");
		nav.querySelector(".ds-status").dataset.complete = String(
			a.reviewed && !answerProblems(q, a).length,
		);
		nav.querySelector(".ds-status").textContent = !a.reviewed
			? a.selected.length || a.text.trim()
				? "初期値あり"
				: "未入力"
			: answerProblems(q, a).length
				? "入力途中"
				: "✓ 入力済み";
		if (!c) return;
		c.inputs.forEach(({ input, option }) => {
			input.checked = a.selected.includes(option.id);
		});
		c.fields.forEach(({ field, label, input }) => {
			label.hidden =
				!!field.requiredWhen &&
				!field.required &&
				!fieldRequired(field, a) &&
				!input.value;
			input.required = fieldRequired(field, a);
		});
	});
	app.querySelectorAll("[data-mutation]").forEach((node) => {
		node.disabled = state.submitted || state.busy;
	});
};
const save = () => {
	if (state.submitted) {
		sync();
		return;
	}
	try {
		localStorage.setItem(storageKey, JSON.stringify(response()));
		localStorage.setItem(`${storageKey}:page`, String(state.current));
		say("下書きは保存されています。");
	} catch {
		say("ブラウザーへ保存できません。下書きをファイルに保存してください。");
	}
	sync();
};
const edit = (q, update) => {
	if (state.submitted || state.busy) return;
	state.answers = state.answers.map((a) =>
		a.id === q.id ? { ...a, ...update, reviewed: true } : a,
	);
	errors.hidden = true;
	save();
	// all で回答一覧を開いたまま直したら、一覧も書き直す
	if (!paged && reviewing()) showReview();
};
const leaveCurrent = () => {
	if (!paged || state.submitted || state.busy || reviewing()) return;
	const q = doc.questions[state.current];
	const next = completeVisitedAnswer(q, answer(q));
	state.answers = state.answers.map((a) => (a.id === q.id ? next : a));
};
// all は全問が見えているので、回答一覧を開くときに全問を閲覧済みにする
const visitAll = () => {
	if (state.submitted || state.busy) return;
	state.answers = doc.questions.map((q) =>
		completeVisitedAnswer(q, answer(q)),
	);
};
const focusHeading = (heading) => {
	heading?.focus({ preventScroll: true });
	heading?.scrollIntoView({ block: "start", behavior: "instant" });
};
const go = (index, focus = true) => {
	if (state.busy) return;
	if (!paged) {
		if (index >= count) {
			openReview();
			return;
		}
		focusHeading(app.querySelector(`#question-heading-${index + 1}`));
		return;
	}
	leaveCurrent();
	state.current = index;
	errors.hidden = true;
	renderPage();
	save();
	if (focus) focusHeading(page.querySelector("h2"));
};
const download = (name, contents, mime = "application/json") => {
	const url = URL.createObjectURL(new Blob([contents], { type: mime }));
	el("a", { href: url, download: name }).click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const exportAnswers = () => {
	try {
		validateResponse(doc, digest, response());
		download(`${doc.id}-answers.json`, JSON.stringify(response(), null, 2));
	} catch (error) {
		complain(error.message);
	}
};
// 古い道のコピー。クリックの中(または writeText が断られた直後)で呼ばないと効かない。
// 画面に出さない欄で選ぶ。readonly にしてスマホのキーボードを出さない
const legacyCopy = (text) => {
	if (typeof document.execCommand !== "function") return false;
	const area = el("textarea", { readonly: "", "aria-hidden": "true" });
	area.value = text;
	area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
	document.body.append(area);
	area.select();
	area.setSelectionRange(0, text.length);
	const copied = (() => {
		try {
			return document.execCommand("copy") === true;
		} catch {
			return false;
		}
	})();
	area.remove();
	return copied;
};
const showCopy = async () => {
	try {
		validateResponse(doc, digest, response());
	} catch (error) {
		complain(error.message);
		return;
	}
	const text = markdown(doc, response());
	// ① clipboard → ② execCommand → ③ 手で写す欄とファイルで保存(ai-handout-studio の 123)。
	// http で開いたスマホには navigator.clipboard が無く、許可を断られたブラウザーでは writeText が落ちる
	const copied = await (async () => {
		if (!navigator.clipboard?.writeText) return legacyCopy(text);
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return legacyCopy(text);
		}
	})();
	const review = app.querySelector("#review");
	review.querySelector(".ds-copy-fallback")?.remove();
	if (copied) {
		const title = text.split("\n")[0];
		say(
			`コピーしました(${text.split("\n").length} 行、「${title}」から)。会話に貼り付けてください。`,
		);
		return;
	}
	// スマホでは select() が見た目に出ないことがあるので、readonly にせず長押しを案内する
	const area = el("textarea", {
		class: "ds-input",
		rows: "6",
		"aria-label": "コピーする回答",
	});
	area.value = text;
	review.append(
		el("div", { class: "ds-copy-fallback" }, [
			el("p", {
				text: "コピーできませんでした。下の欄を長押しして「すべて選択」→「コピー」してください。",
			}),
			area,
			el("button", {
				type: "button",
				class: "ds-button",
				"data-download": "",
				text: "ファイルで保存",
				onclick: () =>
					download(`answers-${doc.id}.md`, text, "text/markdown;charset=utf-8"),
			}),
		]),
	);
	area.focus();
	area.select();
};

const submit = async () => {
	if (state.busy || state.submitted) return;
	try {
		validateResponse(doc, digest, response());
	} catch (error) {
		complain(error.message);
		return;
	}
	state.busy = true;
	sync();
	try {
		const result = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(response()),
		});
		if (!result.ok)
			throw new Error((await result.json()).error || "受け取れませんでした");
		state.submitted = true;
		try {
			localStorage.removeItem(storageKey);
			localStorage.removeItem(`${storageKey}:page`);
		} catch {
			/* Export remains available. */
		}
		say("回答を返しました。");
	} catch (error) {
		complain(
			`回答を返せませんでした: ${error.message}。回答JSONを保存して返せます。`,
		);
	} finally {
		state.busy = false;
		sync();
	}
};
// 回答一覧。カード1枚
const reviewCard = (headingId) => {
	const missing = doc.questions.filter(
		(q) => answerProblems(q, answer(q)).length,
	);
	const sendButton = button("回答を返す", submit, true);
	sendButton.setAttribute("data-mutation", "");
	return el("article", { class: "ds-question-card", id: "review" }, [
		el("h2", { id: headingId, tabindex: "-1", text: "回答一覧" }),
		el("p", {
			class: "ds-subtle",
			text: missing.length
				? `${missing.length}問が未入力です。${paged ? "質問一覧" : "質問の名前"}から戻れます。`
				: "回答をまとめました。変更するときは質問を選んでください。",
		}),
		...doc.questions.map((q, index) => {
			const a = answer(q);
			const valid = !answerProblems(q, a).length;
			return el("div", { class: "ds-review-item" }, [
				button(q.title, () => go(index)),
				el("p", {
					text: valid
						? q.type !== "multiple"
							? a.text
							: a.selected
									.map((id) => q.options.find((o) => o.id === id).label)
									.join(" / ")
						: "未入力・入力途中",
				}),
				...(a.text && q.type === "multiple" ? [el("p", { text: a.text })] : []),
				...(q.fields ?? [])
					.filter((f) => a.fields[f.id])
					.map((f) => el("p", { text: `${f.label}: ${a.fields[f.id]}` })),
			]);
		}),
		el("div", { class: "ds-toolbar" }, [
			...(endpoint ? [sendButton] : []),
			button("回答JSONを保存", exportAnswers, !endpoint),
			button("Markdownをコピー", showCopy),
		]),
		el("p", {
			class: "ds-subtle",
			text: "回答の返却です。登録や実行の承認は含みません。",
		}),
	]);
};
const showReview = () => {
	reviewSlot.replaceChildren(reviewCard("review-heading"));
	if (!reviewSlot.isConnected) list.append(reviewSlot);
	sync();
};
const openReview = () => {
	visitAll();
	state.current = count;
	errors.hidden = true;
	save();
	showReview();
	focusHeading(reviewSlot.querySelector("h2"));
};
// Replays the reflect animation; with reduced motion only the text changes.
const reflect = (input) => {
	input.classList.remove("ds-reflected");
	void input.offsetWidth;
	input.classList.add("ds-reflected");
};
app.addEventListener("input", (event) => {
	if (event.target.tagName === "TEXTAREA") grow(event.target);
});
const explorerView = (q) => {
	const panel = el("details", { class: "ds-explorer" }, [
		el("summary", { text: "全体図を開く · Archify" }),
	]);
	panel.addEventListener("toggle", () => {
		if (!panel.isConnected) return;
		panel.querySelector("summary").textContent = panel.open
			? "全体図を閉じる · Archify"
			: "全体図を開く · Archify";
		if (panel.open && !panel.querySelector("iframe")) {
			const frame = el("iframe", {
				title: `${q.title}の全体図`,
				sandbox: "allow-scripts allow-downloads",
				referrerpolicy: "no-referrer",
			});
			frame.srcdoc = explorers[q.explorer];
			panel.append(frame);
		}
		growAll();
	});
	return panel;
};
// 問いの本文(説明・図表・注意・根拠)。白いカード1枚
const questionCard = (q, index, headingId) => {
	const visual = el("div", { class: "ds-inline-visual" });
	// Only the renderer's validated, escaped markup is inserted.
	if (visuals[q.id]) visual.innerHTML = visuals[q.id];
	return el("article", { class: "ds-question-card" }, [
		el("p", {
			class: "ds-question-count",
			text: `質問 ${index + 1} / ${count}`,
		}),
		el("div", { class: "ds-question-title-row" }, [
			el("h2", { id: headingId, tabindex: "-1", text: q.title }),
			...(q.notices ?? [])
				.filter((notice) => notice.kind === "success")
				.map((notice) =>
					el("span", {
						class: "ds-badge ds-badge-success",
						text: `✓ ${notice.text}`,
					}),
				),
		]),
		...(q.summary
			? [el("p", { class: "ds-question-summary", text: q.summary })]
			: []),
		...(q.detail
			? [el("p", { class: "ds-question-detail", text: q.detail })]
			: []),
		...(visuals[q.id] ? [visual] : []),
		...(q.notices ?? [])
			.filter((notice) => notice.kind !== "success")
			.map((notice) =>
				el("div", { class: `ds-notice ds-notice-${notice.kind}` }, [
					el("span", {
						class: "ds-notice-label",
						text: { success: "✓ 成功", info: "ⓘ 情報", warning: "⚠ 注意" }[
							notice.kind
						],
					}),
					el("p", { text: notice.text }),
				]),
			),
		...(q.explorer
			? [
					el("h3", {
						class: "ds-section-heading",
						text: "全体図で関係を確認する",
					}),
					explorerView(q),
				]
			: []),
		...(q.evidence ?? []).map((e) =>
			el("blockquote", { class: "ds-quote" }, [
				el("p", { text: e.text }),
				el("p", { class: "ds-subtle", text: e.label }),
			]),
		),
	]);
};
// 画面で答える回答欄。カード1枚
const answerCard = (q) => {
	const a = answer(q);
	const note = el("textarea", {
		class: "ds-input",
		rows: q.type === "multiple" ? "2" : "3",
		maxlength: "20000",
		"data-mutation": "",
		oninput: () => {
			edit(q, {
				text: note.value,
				...(q.type === "single"
					? { selected: selectedForText(q, note.value) }
					: {}),
			});
		},
	});
	note.value = a.text;
	const noteLabel = el(
		"label",
		{
			class: "ds-field",
			text: q.type !== "multiple" ? "回答文" : q.noteLabel || "補足（任意）",
		},
		[note],
	);
	const choices =
		q.type !== "text"
			? q.options.map((option) => {
					const input = el("input", {
						type: q.type === "single" ? "radio" : "checkbox",
						name: q.id,
						value: option.id,
						"data-mutation": "",
						onchange: () => {
							if (q.type === "single") {
								note.value = `${option.label}${recommendedMark(q, option)}`;
								edit(q, { selected: [option.id], text: note.value });
								grow(note);
								reflect(note);
								return;
							}
							edit(q, {
								selected: input.checked
									? [...answer(q).selected, option.id]
									: answer(q).selected.filter((id) => id !== option.id),
							});
						},
					});
					return {
						input,
						option,
						label: el("label", { class: "ds-choice" }, [
							input,
							el("span", { text: option.label }),
						]),
					};
				})
			: [];
	const fields = (q.fields ?? []).map((field) => {
		const input = el(field.multiline ? "textarea" : "input", {
			class: "ds-input",
			...(field.multiline ? { rows: "4" } : { type: "text" }),
			maxlength: "20000",
			"data-mutation": "",
			oninput: () =>
				edit(q, { fields: { ...answer(q).fields, [field.id]: input.value } }),
		});
		input.value = a.fields[field.id];
		return {
			field,
			input,
			label: el("label", { class: "ds-field", text: `${field.label} ` }, [
				requirement(field, q),
				input,
			]),
		};
	});
	controls.set(q.id, { inputs: choices, fields });
	return el("div", { class: "ds-answer-section" }, [
		el("h3", { text: "あなたの回答" }),
		...(choices.length
			? [
					el("fieldset", { class: "ds-options" }, [
						el("legend", {
							class: "ds-sr-only",
							text: q.type === "single" ? "回答の選択肢" : "回答（複数選択）",
						}),
						...choices.map((c) => c.label),
					]),
				]
			: []),
		...fields.map((f) => f.label),
		noteLabel,
		...(q.type === "single"
			? [
					el("p", {
						class: "ds-subtle",
						text: "選択すると回答文が入ります。文章は自由に編集できます。",
					}),
				]
			: []),
	]);
};
// 印刷向けの回答欄。選択肢に書き込む印、罫線の書き込み欄。ボタンと入力部品は出さない
const printAnswer = (q) => {
	const lines = (label, mark) => [
		el("p", { class: "ds-field", text: mark ? `${label} ` : label }, mark ? [mark] : []),
		el("div", { class: "ds-answer-lines", "aria-hidden": "true" }),
	];
	const hint = { single: "1つ選ぶ", multiple: "当てはまるものをすべて" }[
		q.type
	];
	return el("div", { class: "ds-answer-section" }, [
		el("h3", { text: "あなたの回答" }, [
			...(hint ? [el("span", { class: "ds-subtle", text: hint })] : []),
		]),
		...(q.type !== "text"
			? [
					el(
						"ul",
						{ class: "ds-print-options", "data-type": q.type },
						q.options.map((option) =>
							el("li", { text: option.label }, [
								...(recommendedMark(q, option)
									? [
											el("span", {
												class: "ds-subtle",
												text: recommendedMark(q, option),
											}),
										]
									: []),
							]),
						),
					),
				]
			: []),
		...(q.fields ?? []).flatMap((field) => lines(field.label, requirement(field, q))),
		...lines(
			{ single: "回答文・条件", multiple: q.noteLabel || "補足（任意）" }[
				q.type
			] ?? "回答",
		),
	]);
};
const everyQuestion = (answerView) =>
	doc.questions.map((q, index) =>
		el(
			"section",
			{
				class: "ds-question-content",
				"aria-labelledby": `question-heading-${index + 1}`,
			},
			[questionCard(q, index, `question-heading-${index + 1}`), answerView(q)],
		),
	);
const renderPage = () => {
	controls.clear();
	if (layout === "print") {
		list.replaceChildren(...everyQuestion(printAnswer));
		return;
	}
	if (layout === "all") {
		list.replaceChildren(
			...everyQuestion(answerCard),
			...(reviewing() ? [reviewSlot] : []),
		);
		navBar.replaceChildren(
			pageProgress,
			button("回答一覧へ", openReview, true),
		);
		if (reviewing()) showReview();
		sync();
		growAll();
		return;
	}
	page.replaceChildren(
		...(reviewing()
			? [reviewCard("question-heading")]
			: [
					questionCard(
						doc.questions[state.current],
						state.current,
						"question-heading",
					),
					answerCard(doc.questions[state.current]),
				]),
		errors,
	);
	const prev = button("前へ", () => go(state.current - 1));
	prev.disabled = state.current === 0 || state.busy;
	const next = button(
		state.current === count - 1 ? "回答一覧へ" : "次の質問へ",
		() => {
			const q = doc.questions[state.current];
			leaveCurrent();
			const problems = answerProblems(q, answer(q));
			if (problems.length) {
				save();
				complain(problems.join(" / "));
				return;
			}
			go(state.current + 1);
		},
		true,
	);
	navBar.replaceChildren(prev, pageProgress, ...(reviewing() ? [] : [next]));
	sync();
	growAll();
};
if (layout !== "print") {
	try {
		const saved = localStorage.getItem(storageKey);
		if (saved) {
			state.answers = validateResponse(
				doc,
				digest,
				JSON.parse(saved),
				false,
			).answers;
			say("下書きを復元しました。");
		}
		const index = Number(localStorage.getItem(`${storageKey}:page`));
		if (paged && Number.isInteger(index) && index >= 0 && index <= count)
			state.current = index;
	} catch {
		say("下書きを復元できません。保存したJSONを読み込めます。");
	}
}
navList.append(
	...doc.questions.map((q, index) =>
		el("li", {}, [
			el(
				"button",
				{
					type: "button",
					class: "ds-question-link",
					onclick: () => go(index),
				},
				[
					el("span", {
						class: "ds-question-number",
						text: String(index + 1).padStart(2, "0"),
					}),
					el("span", { class: "ds-question-name", text: q.title }),
					el("span", { class: "ds-status" }),
				],
			),
		]),
	),
);
const importFile = el("input", {
	type: "file",
	accept: ".json,application/json",
	class: "ds-input",
	"aria-label": "下書きJSONを読み込む",
	"data-mutation": "",
	onchange: async () => {
		if (state.submitted || state.busy || !importFile.files[0]) return;
		try {
			if (importFile.files[0].size > 2 * 1024 * 1024)
				throw new Error("ファイルが大きすぎます");
			state.answers = validateResponse(
				doc,
				digest,
				JSON.parse(await importFile.files[0].text()),
				false,
			).answers;
			renderPage();
			save();
		} catch (error) {
			complain(error.message);
		}
		importFile.value = "";
	},
});
// 1問ずつ(focus・overview)は、広い画面では一覧を開いて始める(ai-handout-studio 102)。
// 狭い画面は一覧が本文の上に来るので、閉じて始める
const sidebarOpen = paged && matchMedia("(min-width: 1200px)").matches;
const sidebar = el(
	"aside",
	{
		id: "question-sidebar",
		class: "ds-question-sidebar",
		...(sidebarOpen ? {} : { hidden: "" }),
	},
	[
		el("h2", { text: "質問一覧" }),
		progress,
		el("nav", { "aria-label": "質問一覧" }, [navList]),
		button("回答一覧", () => go(count)),
	],
);
const board = el(
	"div",
	{
		class: `ds-board-layout${sidebarOpen ? "" : " ds-sidebar-collapsed"}`,
	},
	paged ? [sidebar, page] : [list],
);
const sidebarToggle = button("質問一覧を開く", () => {
	sidebar.hidden = !sidebar.hidden;
	sidebarToggle.setAttribute("aria-expanded", String(!sidebar.hidden));
	board.classList.toggle("ds-sidebar-collapsed", sidebar.hidden);
	sync();
	growAll();
});
sidebarToggle.classList.add("ds-sidebar-toggle");
sidebarToggle.setAttribute("aria-controls", "question-sidebar");
sidebarToggle.setAttribute("aria-expanded", String(sidebarOpen));
const saveDraft = () => {
	leaveCurrent();
	save();
	download(`${doc.id}-draft.json`, JSON.stringify(response(), null, 2));
};
app.append(
	el("header", { class: "ds-board-heading" }, [
		el("div", { class: "ds-board-title" }, [
			el("h1", { text: doc.title }),
			...(doc.description
				? [el("p", { class: "ds-subtle", text: doc.description })]
				: []),
		]),
		layout === "print"
			? el("p", {
					class: "ds-print-meta",
					text: `質問群 ${doc.id} / 版 ${doc.revision} / ${count} 問`,
				})
			: el("div", { class: "ds-board-actions" }, [
					button("下書きを保存", saveDraft),
					...(paged ? [sidebarToggle] : []),
				]),
	]),
	board,
	...(layout === "print"
		? []
		: [
				...(paged ? [] : [errors]),
				navBar,
				el("footer", { class: "ds-board-tools" }, [
					message,
					el("details", {}, [
						el("summary", { text: "保存した下書きを読み込む" }),
						importFile,
					]),
					...(doc.context
						? [el("p", { class: "ds-subtle", text: doc.context })]
						: []),
				]),
			]),
);
renderPage();

window.addEventListener("resize", () =>
	app.querySelectorAll("textarea").forEach(grow),
);
