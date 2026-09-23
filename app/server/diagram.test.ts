// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCli } from "./deck-cli";
import {
  ARCHIFY_MISSING,
  type DiagramContext,
  type ExportRequest,
  makeDiagram,
  reportDiagram,
} from "./diagram";

// archify は別の作者のスキルなので、一時のフォルダに偽物を置いて探し方と終了コードを確かめる。
// 実物で撮る確かめは手で行う

let root: string;
let home: string;
let project: string;

// 偽の archify。受け取った引数を args.json に残し、FAKE_DELIVER が fail なら診断を出して exit 2
const FAKE_BIN = `
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const here = dirname(dirname(fileURLToPath(import.meta.url)));
writeFileSync(join(here, "args.json"), JSON.stringify({ args, updateCheck: process.env.ARCHIFY_UPDATE_CHECK_DISABLED }));
if (process.env.FAKE_DELIVER === "fail") {
  console.log(JSON.stringify({ ok: false, errors: [{ rule: "label-collision", subject: "api" }] }));
  console.error("composition failed");
  process.exit(2);
}
writeFileSync(args[3], "<html><body><div class=diagram-container><svg viewBox='0 0 10 10'></svg></div></body></html>");
`;

const installFake = (dir: string): string => {
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "fake archify");
  writeFileSync(join(dir, "bin", "archify.mjs"), FAKE_BIN);
  return dir;
};

const argsOf = (archify: string): { args: string[]; updateCheck: string } =>
  JSON.parse(readFileSync(join(archify, "args.json"), "utf8"));

const context = (
  env: Record<string, string | undefined> = {},
): DiagramContext => ({ cwd: project, env, home });

const options = {
  type: "architecture",
  spec: "spec.json",
  out: "out/diagram.png",
} as const;

// ビューアーの Export の代わり。受け取った依頼を残し、決まった大きさを返す
const fakeExport =
  (seen: ExportRequest[]) => async (request: ExportRequest) => {
    seen.push(request);
    mkdirSync(join(request.out, ".."), { recursive: true });
    writeFileSync(request.out, "image");
    return { path: request.out, bytes: 24, width: 4200, height: 2208 };
  };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "diagram-"));
  home = join(root, "home");
  project = join(root, "project", "nested");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "spec.json"), "{}");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("diagram の archify の探し方", () => {
  it("ホームのスキルの置き場から見つけ、deliver を showcase の検査で呼ぶ", async () => {
    const archify = installFake(join(home, ".claude", "skills", "archify"));
    const seen: ExportRequest[] = [];
    const outcome = await makeDiagram(options, context(), fakeExport(seen));
    const { args, updateCheck } = argsOf(archify);
    expect(args.slice(0, 3)).toEqual([
      "deliver",
      "architecture",
      join(project, "spec.json"),
    ]);
    expect(args.slice(4)).toEqual(["--quality", "showcase", "--json"]);
    expect(updateCheck).toBe("1");
    // 書き出すのは deliver が書いた HTML。形式は --out の拡張子で決まる
    expect(seen).toEqual([
      {
        html: args[3],
        out: join(project, "out", "diagram.png"),
        format: "png",
      },
    ]);
    expect(reportDiagram(outcome)).toEqual({
      exitCode: 0,
      out: [
        `path: ${join(project, "out", "diagram.png")}`,
        "size: 4200x2208",
        "bytes: 24",
      ],
      err: [],
    });
    // deliver に渡した一時の HTML は残さない
    expect(existsSync(args[3] ?? "")).toBe(false);
  });

  it("作業フォルダの親と ARCHIFY_SKILL_DIR からも見つける", async () => {
    const parent = installFake(
      join(root, "project", ".agents", "skills", "archify"),
    );
    await makeDiagram(options, context(), fakeExport([]));
    expect(argsOf(parent).args[0]).toBe("deliver");

    const explicit = installFake(join(root, "elsewhere"));
    await makeDiagram(
      options,
      context({ ARCHIFY_SKILL_DIR: explicit }),
      fakeExport([]),
    );
    expect(argsOf(explicit).args[0]).toBe("deliver");
  });

  it("見つからなければ exit 3 で入れ方を出す。ARCHIFY_SKILL_DIR が違えばほかは探さない", async () => {
    const missing = reportDiagram(await makeDiagram(options, context()));
    expect(missing).toEqual({ exitCode: 3, out: [], err: [ARCHIFY_MISSING] });
    expect(ARCHIFY_MISSING).toBe(
      "archify が見つからない。入れるなら: npx skills add tt-a1i/archify -g(https://github.com/tt-a1i/archify)",
    );

    installFake(join(home, ".claude", "skills", "archify"));
    const outcome = await makeDiagram(
      options,
      context({ ARCHIFY_SKILL_DIR: join(root, "not-installed") }),
    );
    expect(reportDiagram(outcome).exitCode).toBe(3);
  });

  it("deliver が失敗したら診断をそのまま出して exit 1。撮らない", async () => {
    installFake(join(home, ".agents", "skills", "archify"));
    const seen: ExportRequest[] = [];
    const outcome = await makeDiagram(
      options,
      context({ FAKE_DELIVER: "fail" }),
      fakeExport(seen),
    );
    const report = reportDiagram(outcome);
    expect(report.exitCode).toBe(1);
    expect(report.out).toEqual([]);
    expect(report.err.join("\n")).toContain('"rule":"label-collision"');
    expect(report.err.join("\n")).toContain("composition failed");
    expect(report.err.at(-1)).toContain("exit 2");
    expect(seen).toEqual([]);
    expect(existsSync(join(project, "out", "diagram.png"))).toBe(false);
  });
});

describe("diagram の引数", () => {
  it("種類・spec・--out の PNG を受ける", () => {
    expect(
      parseCli(["diagram", "sequence", "spec.json", "--out", "a.png"]),
    ).toEqual({
      success: true,
      command: {
        name: "diagram",
        type: "sequence",
        spec: "spec.json",
        out: "a.png",
      },
    });
  });

  it("--out の拡張子で Export の形式を選ぶ", async () => {
    installFake(join(home, ".claude", "skills", "archify"));
    const seen: ExportRequest[] = [];
    await makeDiagram(
      { ...options, out: "a.webp" },
      context(),
      fakeExport(seen),
    );
    await makeDiagram(
      { ...options, out: "b.JPG" },
      context(),
      fakeExport(seen),
    );
    expect(seen.map((request) => request.format)).toEqual(["webp", "jpeg"]);
  });

  it("1MB を超えたら .webp を勧め、3MB を超えたら取り込めないと知らせる", () => {
    const done = {
      kind: "done",
      path: "a.png",
      width: 4200,
      height: 2208,
    } as const;
    expect(reportDiagram({ ...done, bytes: 1024 * 1024 }).err).toEqual([]);
    expect(reportDiagram({ ...done, bytes: 2 * 1024 * 1024 }).err[0]).toContain(
      ".webp",
    );
    expect(reportDiagram({ ...done, bytes: 4 * 1024 * 1024 }).err[0]).toContain(
      "取り込めない",
    );
  });

  it("知らない種類と画像でない --out は断る", () => {
    expect(
      parseCli(["diagram", "gantt", "spec.json", "--out", "a.png"]).success,
    ).toBe(false);
    expect(
      parseCli(["diagram", "workflow", "spec.json", "--out", "a.svg"]).success,
    ).toBe(false);
    expect(parseCli(["diagram", "workflow", "spec.json"]).success).toBe(false);
  });
});
