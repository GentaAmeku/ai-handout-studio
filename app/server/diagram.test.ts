// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCli } from "./deck-cli";
import {
  type DiagramContext,
  GENERATOR_MISSING,
  makeDiagram,
  reportDiagram,
  type ShootRequest,
} from "./diagram";

// 生成器は依存の diagram-skill の本物を動かす。撮るところだけ置き換える。実ブラウザで撮る確かめは diagram.export.test.ts

let root: string;
let project: string;

const context = (more: Partial<DiagramContext> = {}): DiagramContext => ({
  cwd: project,
  env: process.env,
  ...more,
});

const specOf = (name: string): string =>
  fileURLToPath(
    new URL(
      `../../node_modules/diagram-skill/skills/diagram/examples/${name}.json`,
      import.meta.url,
    ),
  );

type Shot = { request: ShootRequest; svg: string };

const fakeShoot = (seen: Shot[]) => async (request: ShootRequest) => {
  seen.push({ request, svg: readFileSync(request.svg, "utf8") });
  return { path: request.out, bytes: 24, width: 2000, height: 1000 };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "diagram-"));
  project = join(root, "project", "nested");
  mkdirSync(project, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("diagram の図", () => {
  it.each([
    ["flow", "flow-lanes"],
    ["structure", "structure"],
    ["compare", "compare"],
    ["sequence", "sequence"],
    ["state", "state"],
  ] as const)(
    "%s を描いて撮る。題と説明は図の中に描かない",
    async (type, example) => {
      const seen: Shot[] = [];
      const outcome = await makeDiagram(
        { type, spec: specOf(example), out: "out/diagram.webp" },
        context(),
        fakeShoot(seen),
      );
      expect(seen.map(({ request }) => request.format)).toEqual(["webp"]);
      expect(seen[0]?.request.out).toBe(join(project, "out", "diagram.webp"));
      expect(seen[0]?.svg).toContain("<svg");
      expect(seen[0]?.svg).not.toContain('class="title"');
      expect(reportDiagram(outcome)).toEqual({
        exitCode: 0,
        out: [
          `path: ${join(project, "out", "diagram.webp")}`,
          "size: 2000x1000",
          "bytes: 24",
        ],
        err: [],
      });
    },
  );

  it("検査に通らなければ指摘をそのまま出して exit 1。撮らない", async () => {
    const seen: Shot[] = [];
    writeFileSync(
      join(project, "broken.json"),
      JSON.stringify({ type: "flow", title: "題", nodes: [], edges: [] }),
    );
    const report = reportDiagram(
      await makeDiagram(
        { type: "flow", spec: "broken.json", out: "a.png" },
        context(),
        fakeShoot(seen),
      ),
    );
    expect(report.exitCode).toBe(1);
    expect(report.err.join("\n")).toContain("caption");
    expect(report.err.join("\n")).toContain("生成器の検査に通らなかった");
    expect(seen).toEqual([]);
  });

  it("生成器が入っていなければ exit 3 で入れ方を出す。撮らない", async () => {
    const seen: Shot[] = [];
    const report = reportDiagram(
      await makeDiagram(
        { type: "flow", spec: specOf("flow-lanes"), out: "a.png" },
        context({ generator: join(root, "not-installed.mjs") }),
        fakeShoot(seen),
      ),
    );
    expect(report).toEqual({
      exitCode: 3,
      out: [],
      err: [GENERATOR_MISSING],
    });
    expect(seen).toEqual([]);
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

  it("--out の拡張子で形式を選ぶ", async () => {
    const seen: Shot[] = [];
    const draw = (out: string) =>
      makeDiagram(
        { type: "state", spec: specOf("state"), out },
        context(),
        fakeShoot(seen),
      );
    await draw("a.webp");
    await draw("b.JPG");
    expect(seen.map(({ request }) => request.format)).toEqual(["webp", "jpeg"]);
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
    // 前は別の道具で描いていた種類の名前は、もう受けない
    expect(
      parseCli(["diagram", "architecture", "spec.json", "--out", "a.png"])
        .success,
    ).toBe(false);
    expect(
      parseCli(["diagram", "flow", "spec.json", "--out", "a.svg"]).success,
    ).toBe(false);
    expect(parseCli(["diagram", "flow", "spec.json"]).success).toBe(false);
  });
});
