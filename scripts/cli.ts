import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  applySettingsUpdates,
  type CliCommand,
  createDeckForAgent,
  DEV_ORIGIN,
  DEV_PORT,
  formatExamples,
  formatNewDeck,
  formatOpen,
  formatSettings,
  formatTemplates,
  parseCli,
  resolveLan,
  type SettingsUpdate,
  USAGE,
} from "../app/server/deck-cli.ts";
import { ensureTemplateRegistry } from "../app/server/design-registry.ts";
import { makeDiagram, reportDiagram } from "../app/server/diagram.ts";
import {
  createDocument,
  updateDocument,
} from "../app/server/document-store.ts";
import {
  installExamples,
  markExamplesIfAbsent,
} from "../app/server/examples.ts";
import {
  formatHandout,
  type HandoutCommand,
} from "../app/server/handout-cli.ts";
import {
  createSheet,
  exportHandout,
  saveSheetAnswers,
  updateSheetLayout,
  updateSheetQuestions,
} from "../app/server/handout-store.ts";
import { handoutDir, handoutKindOf } from "../app/server/handouts.ts";
import {
  LAN_ENV,
  LAN_NOTE,
  type ListenScope,
  lanAddressesOf,
  lanOriginsOf,
  listenScopeOf,
} from "../app/server/lan.ts";
import {
  readFeatures,
  readSettingsFile,
  resolveSettings,
  saveProfile,
} from "../app/server/profile.ts";
import {
  buildShareBundle,
  formatShareBuild,
  formatShareUrl,
  readShareState,
  writeShareState,
} from "../app/server/share.ts";
import { takeShot } from "../app/server/shot.ts";
import { deckDir } from "../app/server/workspace.ts";
import type { Surface } from "../app/src/schema/design.ts";
import type { Locale } from "../app/src/schema/profile.ts";
import { checkFile } from "./check-file.ts";
import { markDesignBuilt, syncDev } from "./dev-sync.mjs";

// ai-handout-studio new / check / open / restart / design build。リポジトリはこのファイルの場所から決める

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot =
  process.env.AI_HANDOUT_STUDIO_WORKSPACE ?? join(repoRoot, "workspace");
const designDir = join(repoRoot, "design");
const serverLog = join(tmpdir(), "ai-handout-studio-dev.log");

type ServerState = "running" | "down" | "other";

// 一覧の API が配列を返せば ai-handout-studio が動いている
const probeServer = async (): Promise<ServerState> => {
  try {
    const response = await fetch(`${DEV_ORIGIN}/api/decks`, {
      signal: AbortSignal.timeout(1000),
    });
    const body: unknown = await response.json().catch(() => undefined);
    return response.ok && Array.isArray(body) ? "running" : "other";
  } catch {
    return "down";
  }
};

const waitForServer = async (deadline: number): Promise<boolean> => {
  if ((await probeServer()) === "running") return true;
  if (Date.now() > deadline) return false;
  await sleep(300);
  return waitForServer(deadline);
};

// 開発サーバーを切り離して起こす。CLI が終わっても動き続ける。
// lan なら全ての口で待ち受けるよう vite.config.ts へ伝える
const startServer = (lan: boolean): void => {
  const log = openSync(serverLog, "a");
  const child = spawn(
    process.execPath,
    [
      join(repoRoot, "node_modules/vite/bin/vite.js"),
      "--port",
      String(DEV_PORT),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", log, log],
      env: lan ? { ...process.env, [LAN_ENV]: "1" } : process.env,
    },
  );
  child.unref();
};

const ensureServer = async (lan: boolean): Promise<string | undefined> => {
  const state = await probeServer();
  if (state === "other") {
    return `${DEV_PORT} 番を ai-handout-studio 以外が使っている`;
  }
  if (state === "running") return undefined;
  // 起こす前に、pull などで古くなった依存と design/dist を揃える
  const synced = syncDev({ repoRoot });
  if (!synced.success) return synced.message;
  startServer(lan);
  return (await waitForServer(Date.now() + 30_000))
    ? undefined
    : `サーバーが起きなかった。ログ: ${serverLog}`;
};

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

// 開く資料のフォルダ。id の形で decks/・sheets/・documents/ を選ぶ
const openDirOf = (id: string): string => {
  const kind = handoutKindOf(id);
  return kind
    ? handoutDir(workspaceRoot, kind, id)
    : deckDir(workspaceRoot, id);
};

// lsof の出力。lsof が無いときは空
const lsof = (args: readonly string[]): Promise<string> =>
  new Promise((done) => {
    const child = spawn("lsof", args);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => done(""));
    child.on("close", () => done(Buffer.concat(chunks).toString()));
  });

// 5190 番で待ち受けているプロセス。lsof が無い・誰もいないときは空
const listenersOf = async (port: number): Promise<number[]> =>
  (await lsof(["-ti", `tcp:${port}`, "-sTCP:LISTEN"]))
    .split("\n")
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);

// 5190 番の待ち受けが LAN に開いているか(`*:5190` か `127.0.0.1:5190` か)
const listenScope = async (port: number): Promise<ListenScope> =>
  listenScopeOf(await lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]), port);

// LAN に開いたサーバーのときだけ、スマホから開く origin を返す
const lanOrigins = async (): Promise<string[]> =>
  (await listenScope(DEV_PORT)) === "lan"
    ? lanOriginsOf(lanAddressesOf(networkInterfaces()), DEV_PORT)
    : [];

const runOpen = async (
  id: string | undefined,
  lan: boolean,
): Promise<number> => {
  if (id && !(await exists(openDirOf(id)))) {
    console.error(`資料が見つからない: ${id}`);
    return 1;
  }
  const error = await ensureServer(lan);
  if (error) {
    console.error(error);
    return 1;
  }
  if (!lan) {
    console.log(formatOpen(workspaceRoot, DEV_ORIGIN, id));
    return 0;
  }
  // 動いているサーバーの待ち受けは変えられない。ループバックだけなら止めずに restart を促す
  if ((await listenScope(DEV_PORT)) !== "lan") {
    console.log(formatOpen(workspaceRoot, DEV_ORIGIN, id));
    console.error(
      `動いているサーバーは 127.0.0.1 だけで待ち受けている。LAN から開くには ai-handout-studio restart --lan${id ? ` ${id}` : ""} を実行する`,
    );
    return 1;
  }
  const origins = lanOriginsOf(lanAddressesOf(networkInterfaces()), DEV_PORT);
  console.log(formatOpen(workspaceRoot, DEV_ORIGIN, id, origins));
  if (origins.length === 0) {
    console.error(
      "LAN の IPv4 アドレスが見つからなかった。Wi-Fi につながっているか確かめる",
    );
    return 1;
  }
  console.log(`note: ${LAN_NOTE}`);
  return 0;
};

const waitForDown = async (deadline: number): Promise<boolean> => {
  if ((await probeServer()) === "down") return true;
  if (Date.now() > deadline) return false;
  await sleep(300);
  return waitForDown(deadline);
};

// 動いている ai-handout-studio だけを止める。ほかのアプリの 5190 番には触らない
const stopServer = async (): Promise<string | undefined> => {
  const state = await probeServer();
  if (state === "other") {
    return `${DEV_PORT} 番を ai-handout-studio 以外が使っている`;
  }
  if (state === "down") return undefined;
  const pids = await listenersOf(DEV_PORT);
  if (pids.length === 0) return "止めるプロセスが見つからなかった";
  pids.forEach((pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // すでに終わっている
    }
  });
  return (await waitForDown(Date.now() + 10_000))
    ? undefined
    : `サーバーが止まらなかった。pid: ${pids.join(" ")}`;
};

const runRestart = async (
  id: string | undefined,
  lan: boolean,
): Promise<number> => {
  if (id && !(await exists(openDirOf(id)))) {
    console.error(`資料が見つからない: ${id}`);
    return 1;
  }
  const error = await stopServer();
  if (error) {
    console.error(error);
    return 1;
  }
  return runOpen(id, lan);
};

// --lan / --no-lan が無ければ設定(features.lan)に従う
const lanOf = async (override: boolean | undefined): Promise<boolean> =>
  resolveLan(override, await readFeatures(workspaceRoot));

const runSettings = async (
  updates: readonly SettingsUpdate[],
): Promise<number> => {
  // profile.json が壊れていれば、既定値で埋めた形を出したり上書きしたりせずに止める
  const read = await readSettingsFile(workspaceRoot);
  if (!read.success) {
    console.error(read.message);
    return 1;
  }
  if (updates.length === 0) {
    console.log(formatSettings(read.settings));
    return 0;
  }
  // 決めた値だけを書く。既定値で埋めると、doctor が決めていない項目を見分けられない
  const saved = await saveProfile(
    workspaceRoot,
    applySettingsUpdates(read.profile, updates),
  );
  if (!saved.success) {
    console.error(saved.message);
    return 1;
  }
  console.log(formatSettings(resolveSettings(saved.profile)));
  return 0;
};

const runNew = async (
  title: string,
  outlineId?: string,
  templateId?: string,
): Promise<number> => {
  const result = await createDeckForAgent({
    workspaceRoot,
    designDir,
    title,
    outlineId,
    templateId,
    now: new Date(),
  });
  if (!result.success) {
    console.error(result.message);
    return 1;
  }
  console.log(formatNewDeck(result));
  return 0;
};

const runTemplates = async (kind: Surface | undefined): Promise<number> => {
  const result = await formatTemplates(designDir, DEV_ORIGIN, kind);
  if (!result.success) {
    console.error(result.message);
    return 1;
  }
  console.log(result.text);
  return 0;
};

const runDesignBuild = async (): Promise<number> => {
  // 見本の生成器は dist/templates.json を import するので、置いてから読み込む
  await ensureTemplateRegistry(designDir);
  const { buildDesign } = await import("../app/server/design-build.ts");
  const result = await buildDesign(designDir);
  if (!result.success) {
    console.error(result.message);
    return 1;
  }
  // 開発サーバーを起こすときに作り直さずに済むよう、作った元の指紋を残す
  markDesignBuilt(repoRoot);
  console.log(result.files.map((file) => `作った: design/${file}`).join("\n"));
  return 0;
};

// 質問票と HTML 資料。中身は AI が書いたファイルから読んで置く
const readJsonArg = async (path: string): Promise<unknown> => {
  const text = await readFile(resolve(process.cwd(), path), "utf8");
  return JSON.parse(text) as unknown;
};

// document.json はそのまま、移行期の本文の断片は文字列のまま渡す
const documentContent = async (
  file: string,
  format: "json" | "html" | undefined,
): Promise<{ document: unknown; baseDir: string } | { body: string }> =>
  format === "json"
    ? {
        document: await readJsonArg(file),
        // 画像のパスは JSON のファイルからの相対で解く
        baseDir: dirname(resolve(process.cwd(), file)),
      }
    : { body: await readFile(resolve(process.cwd(), file), "utf8") };

const runHandout = async (command: HandoutCommand): Promise<number> => {
  const now = new Date();
  const report = async (result: {
    success: boolean;
    message?: string;
    summary?: { id: string; template: string; createdAt: string };
    path?: string;
    warnings?: readonly string[];
  }): Promise<number> => {
    if (!result.success) {
      console.error(result.message ?? "保存できなかった");
      return 1;
    }
    // 保存は止めない。直し方だけを伝える
    (result.warnings ?? []).forEach((warning) => {
      console.error(`警告: ${warning}`);
    });
    if (result.path) {
      console.log(`path: ${result.path}`);
      return 0;
    }
    const summary = result.summary;
    if (!summary) return 0;
    const kind = handoutKindOf(summary.id);
    if (!kind) return 1;
    console.log(
      formatHandout({
        kind,
        id: summary.id,
        root: workspaceRoot,
        origin: DEV_ORIGIN,
        template: summary.template,
        createdAt: summary.createdAt,
        // restart --lan で起こしたサーバーが動いていれば、スマホから開く URL も添える
        lanOrigins: await lanOrigins(),
      }),
    );
    return 0;
  };

  if (command.name === "handout-new") {
    return report(
      command.kind === "sheet"
        ? await createSheet(
            workspaceRoot,
            designDir,
            {
              questions: await readJsonArg(command.file),
              // 画像のパスは質問 JSON のファイルからの相対で解く
              baseDir: dirname(resolve(process.cwd(), command.file)),
              ...(command.title ? { title: command.title } : {}),
              ...(command.templateId ? { templateId: command.templateId } : {}),
              ...(command.layout ? { layout: command.layout } : {}),
            },
            now,
          )
        : await createDocument(
            workspaceRoot,
            designDir,
            {
              ...(await documentContent(command.file, command.format)),
              ...(command.title ? { title: command.title } : {}),
              ...(command.templateId ? { templateId: command.templateId } : {}),
            },
            now,
          ),
    );
  }
  if (command.name === "handout-update") {
    if (command.kind === "sheet") {
      // 質問と骨格(レイアウト)は別々に保存する。両方渡せば両方差し替わる
      const questionsResult = command.file
        ? await updateSheetQuestions(
            workspaceRoot,
            command.id,
            await readJsonArg(command.file),
            now,
            dirname(resolve(process.cwd(), command.file)),
          )
        : undefined;
      if (questionsResult && !questionsResult.success) {
        return report(questionsResult);
      }
      return report(
        command.layout
          ? {
              ...(await updateSheetLayout(
                workspaceRoot,
                command.id,
                command.layout,
                now,
              )),
              warnings: questionsResult?.success
                ? questionsResult.warnings
                : [],
            }
          : (questionsResult ?? {
              success: false,
              message: "変える中身が無い",
            }),
      );
    }
    if (!command.file) {
      console.error("--json <document.json> が要る");
      return 1;
    }
    return report(
      await updateDocument(
        workspaceRoot,
        command.id,
        await documentContent(command.file, command.format),
        command.title ? { title: command.title } : {},
        now,
      ),
    );
  }
  if (command.name === "sheet-answers") {
    return report(
      await saveSheetAnswers(
        workspaceRoot,
        command.id,
        await readJsonArg(command.file),
        now,
      ),
    );
  }
  return report(
    await exportHandout(
      workspaceRoot,
      designDir,
      command.kind,
      command.id,
      now,
      command.out ? resolve(process.cwd(), command.out) : undefined,
    ),
  );
};

// スクリーンショットを PNG に撮る。撮った場所と大きさを出す
const runShot = async (
  command: Extract<CliCommand, { name: "shot" }>,
): Promise<number> => {
  try {
    const result = await takeShot(command, process.cwd());
    console.log(`path: ${result.path}`);
    console.log(
      `size: ${command.width}x${command.full ? "全体" : command.height}`,
    );
    console.log(`bytes: ${result.bytes}`);
    result.warnings.forEach((warning) => {
      console.error(`警告: ${warning}`);
    });
    return 0;
  } catch (error) {
    console.error(
      `撮れなかった: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
};

// archify の図を画像にする。archify が無ければ exit 3(資料は図なしで作る)
const runDiagram = async (
  command: Extract<CliCommand, { name: "diagram" }>,
): Promise<number> => {
  try {
    const report = reportDiagram(
      await makeDiagram(command, {
        cwd: process.cwd(),
        env: process.env,
        home: homedir(),
      }),
    );
    report.out.forEach((line) => {
      console.log(line);
    });
    report.err.forEach((line) => {
      console.error(line);
    });
    return report.exitCode;
  } catch (error) {
    console.error(
      `書き出せなかった: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
};

// 共有用の束を作って依頼文を出す。--url は束を作り直さず、公開した URL を share.json に残す
const runShare = async (id: string, url?: string): Promise<number> => {
  const kind = handoutKindOf(id);
  if (!kind) {
    // parseCli が id の形を確かめ済みなので、ここに来るのはスライドの id だけ
    console.error("スライドの共有はまだ作っていない(129)");
    return 1;
  }
  const now = new Date();
  if (url !== undefined) {
    if (!(await exists(handoutDir(workspaceRoot, kind, id)))) {
      console.error(`資料が見つからない: ${id}`);
      return 1;
    }
    await writeShareState(workspaceRoot, kind, id, url, now);
    console.log(formatShareUrl({ kind, id, url }));
    return 0;
  }
  const result = await buildShareBundle(workspaceRoot, designDir, kind, id);
  if (!result.success) {
    console.error(result.message);
    return 1;
  }
  const previous = await readShareState(workspaceRoot, kind, id);
  console.log(
    formatShareBuild({
      kind,
      id,
      bundleDir: result.bundleDir,
      files: result.files,
      textBytes: result.textBytes,
      ...(result.warning ? { warning: result.warning } : {}),
      ...(previous ? { previousUrl: previous.url } : {}),
    }),
  );
  return 0;
};

// 同梱資料を印に関係なく足す。入れた資料の id と URL を new と同じ形で出す
const runExamples = async (lang: Locale | undefined): Promise<number> => {
  const now = new Date();
  const result = await installExamples({
    workspaceRoot,
    repoRoot,
    ...(lang ? { lang } : {}),
    now,
  });
  if (!result.success) {
    console.error(result.message);
    return 1;
  }
  await markExamplesIfAbsent(workspaceRoot, result, now);
  console.log(formatExamples(result.installed, DEV_ORIGIN, await lanOrigins()));
  return 0;
};

const HANDOUT_COMMANDS = [
  "handout-new",
  "handout-update",
  "sheet-answers",
  "handout-export",
] as const;

const isHandoutCommand = (command: CliCommand): command is HandoutCommand =>
  HANDOUT_COMMANDS.some((known) => known === command.name);

const run = async (argv: readonly string[]): Promise<number> => {
  const parsed = parseCli(argv);
  if (!parsed.success) {
    console.error(`${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  const { command } = parsed;
  if (command.name === "new")
    return runNew(command.title, command.outlineId, command.templateId);
  if (command.name === "check") {
    return checkFile(resolve(process.cwd(), command.path), command.minutes);
  }
  if (command.name === "open") {
    return runOpen(command.id, await lanOf(command.lan));
  }
  if (command.name === "restart") {
    return runRestart(command.id, await lanOf(command.lan));
  }
  if (command.name === "templates") return runTemplates(command.kind);
  if (command.name === "share") return runShare(command.id, command.url);
  if (command.name === "shot") return runShot(command);
  if (command.name === "diagram") return runDiagram(command);
  if (command.name === "design-build") return runDesignBuild();
  if (command.name === "settings") return runSettings(command.updates);
  if (command.name === "examples") return runExamples(command.lang);
  if (isHandoutCommand(command)) return runHandout(command);
  console.log(USAGE);
  return 0;
};

process.exitCode = await run(process.argv.slice(2));
