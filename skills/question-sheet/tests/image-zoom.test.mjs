import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { render } from "../scripts/render.mjs";

// client.js の画像の拡大(ai-handout-studio チケット156)。examples/images.json は
// 案ごとの画像(images visual)を持つ質問票の見本で、baseDir から実ファイルを data: に埋め込む
const examples = new URL("../examples/", import.meta.url);
const doc = JSON.parse(await readFile(new URL("images.json", examples), "utf8"));

// render() の出力(<script type="module">…</script>)を取り出し、jsdom に流し込む。
// model.mjs の export を外した plain な JS なので、そのまま eval できる
// (ai-handout-studio の sheet-client.test.ts と同じやり方)。jsdom は <dialog> の
// showModal/close を実装していないので、open 属性の出し入れと close イベントだけ補う
const run = async (options = {}) => {
	const html = render(doc, null, { baseDir: examples.pathname, ...options });
	const dom = new JSDOM(html, { runScripts: "outside-only" });
	// jsdom には matchMedia・requestAnimationFrame が無い。この検査には要らない部分なので最小限で足す
	dom.window.matchMedia = () => ({ matches: false });
	dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
	dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
		this.setAttribute("open", "");
	};
	dom.window.HTMLDialogElement.prototype.close = function close() {
		if (!this.hasAttribute("open")) return;
		this.removeAttribute("open");
		this.dispatchEvent(new dom.window.Event("close"));
	};
	const script = dom.window.document.querySelector("script").textContent;
	dom.window.eval(script);
	return dom;
};

const pick = (page, selector) => {
	const found = page.querySelector(selector);
	if (!found) throw new Error(`見つからない: ${selector}`);
	return found;
};

test("案の画像を押すと拡大する。<dialog> に同じ画像を1枚だけ出す", async () => {
	const dom = await run();
	const page = dom.window.document;
	const img = pick(page, ".ds-images-item img");
	assert.equal(img.getAttribute("role"), "button");
	assert.equal(img.tabIndex, 0);
	img.click();
	const dialog = pick(page, ".ds-image-zoom-dialog");
	assert.equal(dialog.hasAttribute("open"), true);
	const zoomed = pick(page, ".ds-image-zoom-img");
	assert.equal(zoomed.src, img.src);
	// 画面全体では同じ画像がもう1枚(拡大の分)だけ増えている。二重に埋め込んではいない
	assert.equal(
		page.querySelectorAll(`img[src="${img.src}"]`).length,
		2,
	);
});

test("Tab で選んで Enter でも開ける", async () => {
	const dom = await run();
	const page = dom.window.document;
	const img = pick(page, ".ds-images-item img");
	img.dispatchEvent(
		new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
	);
	assert.equal(pick(page, ".ds-image-zoom-dialog").hasAttribute("open"), true);
});

test("閉じるボタン・Esc・外側のクリックで閉じ、フォーカスが元の画像に戻る", async () => {
	const dom = await run();
	const page = dom.window.document;

	const img = pick(page, ".ds-images-item img");
	img.click();
	let dialog = pick(page, ".ds-image-zoom-dialog");
	pick(page, ".ds-image-zoom-dialog button").click();
	assert.equal(dialog.hasAttribute("open"), false);
	assert.equal(page.activeElement, img);

	img.click();
	dialog = pick(page, ".ds-image-zoom-dialog");
	dialog.dispatchEvent(
		new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
	assert.equal(dialog.hasAttribute("open"), false);
	assert.equal(page.activeElement, img);

	img.click();
	dialog = pick(page, ".ds-image-zoom-dialog");
	dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
	assert.equal(dialog.hasAttribute("open"), false);

	// ダイアログの中の部品(画像そのもの)を押しても閉じない
	img.click();
	dialog = pick(page, ".ds-image-zoom-dialog");
	pick(page, ".ds-image-zoom-img").dispatchEvent(
		new dom.window.MouseEvent("click", { bubbles: true }),
	);
	assert.equal(dialog.hasAttribute("open"), true);
});

test("印刷では何も変えない(押せる印もダイアログも無い)", async () => {
	const dom = await run({ layout: "print" });
	const page = dom.window.document;
	const img = pick(page, ".ds-images-item img");
	assert.equal(img.getAttribute("role"), null);
	assert.equal(img.tabIndex, -1);
	assert.equal(page.querySelector(".ds-image-zoom-dialog"), null);
});
