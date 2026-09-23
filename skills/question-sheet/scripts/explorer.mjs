import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireArchify, embedExplorer } from "./archify.mjs";
import { execFileSync } from "node:child_process";
export const renderExplorer = (spec) => {
	const archify = requireArchify();
	const dir = mkdtempSync(join(tmpdir(), "question-sheet-explorer-"));
	try {
		const input = join(dir, "input.json"),
			output = join(dir, "explorer.html");
		const source = {
			...spec,
			meta: {
				...spec.meta,
				visual_preset: "signal-flow",
				animation: "none",
				quality_profile: "showcase",
			},
		};
		writeFileSync(input, JSON.stringify(source), { mode: 0o600 });
		try {
			execFileSync(
				process.execPath,
				[
					join(archify, "bin/archify.mjs"),
					"deliver",
					source.diagram_type,
					input,
					output,
					"--quality",
					"showcase",
					"--json",
				],
				{
					encoding: "utf8",
					timeout: 30000,
					maxBuffer: 2 * 1024 * 1024,
					env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: "1" },
				},
			);
		} catch (error) {
			throw new Error(
				`全体図の検査に失敗しました: ${String(error.stdout || error.stderr || error.message).slice(0, 5000)}`,
			);
		}
		return embedExplorer(readFileSync(output, "utf8"), archify);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};
