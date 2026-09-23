import { test } from "node:test";
import assert from "node:assert/strict";
import {
	mkdtempSync,
	symlinkSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
	findArchify,
	requireArchify,
	embedExplorer,
} from "../scripts/archify.mjs";

const temporary = (run) => {
	const dir = mkdtempSync(join(tmpdir(), "question-archify-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};
const installFixture = (dir) => {
	mkdirSync(join(dir, "bin"), { recursive: true });
	writeFileSync(join(dir, "SKILL.md"), "Test-only external CLI fixture");
	writeFileSync(join(dir, "LICENSE"), "Synthetic test license");
	writeFileSync(
		join(dir, "bin/archify.mjs"),
		`
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [command, type, input, output] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(input));
assert.equal(command, 'deliver');
assert.equal(type, spec.diagram_type);
assert.equal(spec.meta.visual_preset, 'signal-flow');
assert.equal(spec.meta.animation, 'none');
assert.equal(process.env.ARCHIFY_UPDATE_CHECK_DISABLED, '1');
writeFileSync(output, '<html><head></head><body>external-renderer-output</body></html>');
`,
	);
};
test("外部スキルを親階層・ユーザー領域・明示指定で検出する", () =>
	temporary((dir) => {
		const installed = join(dir, ".agents/skills/archify");
		installFixture(installed);
		assert.equal(
			findArchify({
				cwd: join(dir, "project/nested"),
				home: join(dir, "empty"),
				env: {},
			}),
			installed,
		);
		assert.equal(findArchify({ cwd: "/", home: dir, env: {} }), installed);
		assert.equal(
			findArchify({
				cwd: "/",
				home: "/",
				env: { ARCHIFY_SKILL_DIR: installed },
			}),
			installed,
		);
		assert.equal(
			findArchify({
				cwd: "/",
				home: "/",
				env: { CODEX_HOME: join(dir, ".agents") },
			}),
			installed,
		);
		assert.throws(
			() =>
				requireArchify({
					cwd: dir,
					home: dir,
					env: { ARCHIFY_SKILL_DIR: join(dir, "missing") },
				}),
			/npx skills add tt-a1i\/archify -g/,
		);
	}));
test("生成時は外部CLIを使い、導入先を変更しない", () =>
	temporary((dir) => {
		installFixture(dir);
		const cli = fileURLToPath(
			new URL("../scripts/sheet.mjs", import.meta.url),
		);
		const source = fileURLToPath(
			new URL(
				"../examples/explorer.json",
				import.meta.url,
			),
		);
		const output = join(dir, "result.html");
		const before = readFileSync(join(dir, "bin/archify.mjs"), "utf8");
		execFileSync(process.execPath, [cli, "render", source, "--out", output], {
			env: { ...process.env, ARCHIFY_SKILL_DIR: dir },
		});
		const html = readFileSync(output, "utf8");
		assert.ok(html.includes("external-renderer-output"));
		assert.ok(html.includes("Synthetic test license"));
		assert.equal(readFileSync(join(dir, "bin/archify.mjs"), "utf8"), before);
		const missing = spawnSync(
			process.execPath,
			[cli, "render", source, "--out", output],
			{
				env: { ...process.env, ARCHIFY_SKILL_DIR: join(dir, "missing") },
				encoding: "utf8",
			},
		);
		assert.equal(missing.status, 1);
		assert.match(missing.stderr, /npx skills add/);
		assert.equal(readFileSync(output, "utf8"), html);
	}));
test("埋め込みだけにLight初期値・通信制限・権利表記を適用する", () =>
	temporary((dir) => {
		installFixture(dir);
		const html = `<html><head><link href="https://fonts.googleapis.com/css2?family=Example"></head><body><script>const theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';</script></body></html>`;
		const embedded = embedExplorer(html, dir);
		assert.ok(!embedded.includes("fonts.googleapis"));
		assert.match(embedded, /const theme = 'light'/);
		assert.match(embedded, /connect-src 'none'/);
		assert.match(embedded, /Synthetic test license/);
		assert.throws(() => embedExplorer("<body>bad</body>", dir), /head/);
	}));

test("リンク経由の導入確認も検出結果を表示する", () =>
	temporary((dir) => {
		installFixture(dir);
		const link = join(dir, "check.mjs");
		symlinkSync(
			fileURLToPath(
				new URL(
					"../scripts/archify.mjs",
					import.meta.url,
				),
			),
			link,
		);
		const result = spawnSync(process.execPath, [link], {
			encoding: "utf8",
			env: { ...process.env, ARCHIFY_SKILL_DIR: dir },
		});
		assert.equal(result.status, 0);
		assert.equal(result.stdout.trim(), dir);
		const missing = spawnSync(process.execPath, [link], {
			encoding: "utf8",
			env: { ...process.env, ARCHIFY_SKILL_DIR: join(dir, "missing") },
		});
		assert.equal(missing.status, 1);
		assert.match(missing.stderr, /npx skills add/);
	}));

test("標準入力から読み込んでもCLI判定で失敗しない", () => {
	const target = new URL(
		"../scripts/archify.mjs",
		import.meta.url,
	).href;
	const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
		input: `import ${JSON.stringify(target)};`,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
});
