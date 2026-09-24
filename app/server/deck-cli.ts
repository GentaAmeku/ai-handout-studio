import { join } from "node:path";
import { parseArgs } from "node:util";
import { deckTemplate } from "../src/schema/deck.ts";
import {
  type Surface,
  surfaceName,
  surfaceNames,
} from "../src/schema/design.ts";
import {
  type AgentInstructions,
  agentInstructionsName,
  type Locale,
  localeName,
  type Profile,
  type ResolvedSettings,
} from "../src/schema/profile.ts";
import { isShareUrl, SHARE_URL_PREFIX } from "../src/schema/share.ts";
import { readSelection, readTemplates, templateNames } from "./design.ts";
import {
  DIAGRAM_TYPES,
  type DiagramType,
  diagramFormatOf,
  isDiagramType,
} from "./diagram.ts";
import {
  contentPathOf,
  HANDOUT_USAGE,
  type HandoutCommand,
  openUrl,
  parseHandoutCli,
  urlLines,
} from "./handout-cli.ts";
import { handoutKindOf } from "./handouts.ts";
import { isShotTarget } from "./shot.ts";
import {
  claimDeckDir,
  copyTemplateAssets,
  createDeckFromOutline,
  deckDir,
  decksDir,
  isDeckId,
  listOutlines,
  resolveDesign,
} from "./workspace.ts";

// ai-handout-studio CLI の中身。プロセスとサーバーの扱いは scripts/cli.ts が持つ

export const DEV_PORT = 5190;
export const DEV_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;

export const USAGE = [
  "使い方:",
  "  ai-handout-studio new --title <題名> [--outline <構成>] [--template <テンプレート>]",
  "  ai-handout-studio check <ファイル> [--minutes <分>]",
  "  ai-handout-studio open [<id>] [--lan|--no-lan]",
  "  ai-handout-studio restart [<id>] [--lan|--no-lan]",
  "  ai-handout-studio templates [--kind slide|sheet|document]",
  ...HANDOUT_USAGE,
  "  ai-handout-studio share <id>",
  "  ai-handout-studio share <id> --url <公開した Artifact の URL>",
  "  ai-handout-studio shot <URL か HTML のファイル> --out <PNG> [--width 1440] [--height 900] [--full] [--wait <ミリ秒>]",
  `  ai-handout-studio diagram <${DIAGRAM_TYPES.join("|")}> <spec.json> --out <画像(.png・.jpg・.webp)>`,
  "  ai-handout-studio design build",
  "  ai-handout-studio settings",
  "  ai-handout-studio settings --set <キー>=<値> [--set <キー>=<値> ...]",
  "    キー: orgName・locale(ja|en)・features.lan・features.imageGeneration・features.share(true|false)・agentInstructions(ask|declined)",
  "  ai-handout-studio examples [--lang ja|en]",
  "  ai-handout-studio doctor [--uninstall] [--json]",
].join("\n");

export type CliCommand =
  | { name: "new"; title: string; outlineId?: string; templateId?: string }
  | { name: "check"; path: string; minutes?: number }
  // 開く資料。スライド・質問票・HTML 資料のどの id でもよい
  // lan が無ければ設定(features.lan)に従う。--lan / --no-lan で1回だけ上書きする
  | { name: "open"; id?: string; lan?: boolean }
  // 動いているサーバーを止めてから、open と同じに起こす
  | { name: "restart"; id?: string; lan?: boolean }
  // テンプレートの一覧。区分を省くと3区分とも出す
  | { name: "templates"; kind?: Surface }
  // 共有用の束を作って依頼文を出す。--url は公開した URL を share.json に残す
  | { name: "share"; id: string; url?: string }
  // 資料に載せるスクリーンショット。Web の画面か手元の HTML(モック)を PNG に撮る
  | {
      name: "shot";
      target: string;
      out: string;
      width: number;
      height: number;
      full: boolean;
      wait: number;
    }
  // archify の図を画像にする。形式は --out の拡張子で選ぶ。archify が無ければ exit 3
  | { name: "diagram"; type: DiagramType; spec: string; out: string }
  | { name: "design-build" }
  // 設定(言語・任意の機能)。--set が無ければ今の値を出すだけ
  | { name: "settings"; updates: readonly SettingsUpdate[] }
  // 同梱資料(使い方のスライドとセットアップの HTML 資料)を新しい id で入れ直す。lang が無ければ設定の locale
  | { name: "examples"; lang?: Locale }
  | { name: "help" }
  | HandoutCommand;

// settings --set のキーと、既に検証・変換した値
export type SettingsUpdate =
  | { key: "orgName"; value: string }
  | { key: "locale"; value: Locale }
  | { key: "features.lan"; value: boolean }
  | { key: "features.imageGeneration"; value: boolean }
  | { key: "features.share"; value: boolean }
  | { key: "agentInstructions"; value: AgentInstructions };

export type ParsedCli =
  | { success: true; command: CliCommand }
  | { success: false; message: string };

const fail = (message: string): ParsedCli => ({ success: false, message });

const parseNewOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: {
        title: { type: "string" },
        outline: { type: "string" },
        template: { type: "string" },
      },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseNew = (args: readonly string[]): ParsedCli => {
  const parsed = parseNewOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  // 改行や連続する空白を畳んで1行にする
  const title = values.title?.replace(/\s+/g, " ").trim() ?? "";
  if (!title) return fail("--title <題名> が要る");
  if (positionals.length > 0) {
    return fail(`余分な引数: ${positionals.join(" ")}`);
  }
  return {
    success: true,
    command: {
      name: "new",
      title,
      ...(values.outline ? { outlineId: values.outline } : {}),
      ...(values.template ? { templateId: values.template } : {}),
    },
  };
};

const parseCheckOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { minutes: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseCheck = (args: readonly string[]): ParsedCli => {
  const parsed = parseCheckOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  const [path, ...extra] = positionals;
  if (!path || extra.length > 0) {
    return fail("check <ファイル> [--minutes <分>] の形で渡す");
  }
  if (values.minutes === undefined) {
    return { success: true, command: { name: "check", path } };
  }
  const minutes = Number(values.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return fail("--minutes は正の数で渡す");
  }
  return { success: true, command: { name: "check", path, minutes } };
};

const parseTemplatesOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { kind: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseTemplates = (args: readonly string[]): ParsedCli => {
  const parsed = parseTemplatesOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  if (positionals.length > 0) {
    return fail(`余分な引数: ${positionals.join(" ")}`);
  }
  if (values.kind === undefined) {
    return { success: true, command: { name: "templates" } };
  }
  const kind = surfaceName.safeParse(values.kind);
  if (!kind.success) {
    return fail(`--kind は ${surfaceNames.join("・")} のどれか`);
  }
  return { success: true, command: { name: "templates", kind: kind.data } };
};

const parseShareOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { url: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseShare = (args: readonly string[]): ParsedCli => {
  const parsed = parseShareOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  const [id, ...extra] = positionals;
  if (!id || extra.length > 0) {
    return fail("share <id> [--url <URL>] の形で渡す");
  }
  if (!isDeckId(id) && handoutKindOf(id) === undefined) {
    return fail(`資料の id の形が正しくない: ${id}`);
  }
  if (values.url !== undefined && !isShareUrl(values.url)) {
    return fail(
      `--url は ${SHARE_URL_PREFIX} で始まる URL だけ受ける(空白や引用符は含めない)`,
    );
  }
  return {
    success: true,
    command: { name: "share", id, ...(values.url ? { url: values.url } : {}) },
  };
};

const parseShotOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: {
        out: { type: "string" },
        width: { type: "string" },
        height: { type: "string" },
        full: { type: "boolean" },
        wait: { type: "string" },
      },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

// 正の整数だけ。範囲の外は undefined
const sizeOf = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | undefined => {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : undefined;
};

const parseShot = (args: readonly string[]): ParsedCli => {
  const parsed = parseShotOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  const [target, ...extra] = positionals;
  if (!target || extra.length > 0 || !values.out) {
    return fail("shot <URL か HTML のファイル> --out <PNG> の形で渡す");
  }
  if (!isShotTarget(target)) {
    return fail("撮るのは http(s) の URL か、手元の HTML のファイルだけ");
  }
  if (!values.out.toLowerCase().endsWith(".png")) {
    return fail("--out は .png のファイルにする");
  }
  const width = sizeOf(values.width, 1440, 320, 3840);
  const height = sizeOf(values.height, 900, 240, 3840);
  const wait = sizeOf(values.wait, 500, 0, 30_000);
  if (width === undefined || height === undefined || wait === undefined) {
    return fail(
      "--width は 320〜3840、--height は 240〜3840、--wait は 0〜30000 の整数",
    );
  }
  return {
    success: true,
    command: {
      name: "shot",
      target,
      out: values.out,
      width,
      height,
      full: values.full ?? false,
      wait,
    },
  };
};

const parseDiagramOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { out: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseDiagram = (args: readonly string[]): ParsedCli => {
  const parsed = parseDiagramOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  const [type, spec, ...extra] = positionals;
  if (!type || !spec || extra.length > 0 || !values.out) {
    return fail(
      `diagram <${DIAGRAM_TYPES.join("|")}> <spec.json> --out <画像> の形で渡す`,
    );
  }
  if (!isDiagramType(type)) {
    return fail(
      `図の種類は ${DIAGRAM_TYPES.join("・")} のどれか(渡された値: ${type})`,
    );
  }
  if (diagramFormatOf(values.out) === undefined) {
    return fail("--out は .png・.jpg・.webp のファイルにする");
  }
  return {
    success: true,
    command: { name: "diagram", type, spec, out: values.out },
  };
};

const parseSettingsOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { set: { type: "string", multiple: true } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const SETTINGS_BOOLEAN_KEYS = [
  "features.lan",
  "features.imageGeneration",
  "features.share",
] as const;

// --set <キー>=<値> を1つ検証する。キーと値をここで確定し、あとの層は素通しする
const parseSettingsUpdate = (raw: string): SettingsUpdate | string => {
  const eq = raw.indexOf("=");
  if (eq < 0) return `--set は <キー>=<値> の形で渡す: ${raw}`;
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (key === "orgName") return { key, value };
  if (key === "locale") {
    const parsed = localeName.safeParse(value);
    return parsed.success
      ? { key, value: parsed.data }
      : `locale は ja か en(渡された値: ${value})`;
  }
  if (key === "agentInstructions") {
    const parsed = agentInstructionsName.safeParse(value);
    return parsed.success
      ? { key, value: parsed.data }
      : `agentInstructions は ask か declined(渡された値: ${value})`;
  }
  const booleanKey = SETTINGS_BOOLEAN_KEYS.find((known) => known === key);
  if (booleanKey === undefined) {
    return `知らない設定のキー: ${key}(orgName・locale・${SETTINGS_BOOLEAN_KEYS.join("・")}・agentInstructions のどれか)`;
  }
  if (value === "true") return { key: booleanKey, value: true };
  if (value === "false") return { key: booleanKey, value: false };
  return `${key} は true か false(渡された値: ${value})`;
};

const isSettingsError = (update: SettingsUpdate | string): update is string =>
  typeof update === "string";

const parseSettings = (args: readonly string[]): ParsedCli => {
  const parsed = parseSettingsOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  if (positionals.length > 0) {
    return fail("settings [--set <キー>=<値> ...] の形で渡す");
  }
  const parsedUpdates = (values.set ?? []).map(parseSettingsUpdate);
  const firstError = parsedUpdates.find(isSettingsError);
  if (firstError !== undefined) return fail(firstError);
  const updates = parsedUpdates.filter(
    (update): update is SettingsUpdate => !isSettingsError(update),
  );
  return { success: true, command: { name: "settings", updates } };
};

const parseExamplesOptions = (args: readonly string[]) => {
  try {
    return parseArgs({
      args: [...args],
      options: { lang: { type: "string" } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const parseExamples = (args: readonly string[]): ParsedCli => {
  const parsed = parseExamplesOptions(args);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  if (positionals.length > 0) {
    return fail("examples [--lang ja|en] の形で渡す");
  }
  if (values.lang === undefined) {
    return { success: true, command: { name: "examples" } };
  }
  const lang = localeName.safeParse(values.lang);
  if (!lang.success)
    return fail(`--lang は ja か en(渡された値: ${values.lang})`);
  return { success: true, command: { name: "examples", lang: lang.data } };
};

export const parseCli = (argv: readonly string[]): ParsedCli => {
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help") {
    return { success: true, command: { name: "help" } };
  }
  if (name === "new") return parseNew(rest);
  if (name === "check") return parseCheck(rest);
  if (name === "open" || name === "restart") {
    const hasLan = rest.includes("--lan");
    const hasNoLan = rest.includes("--no-lan");
    if (hasLan && hasNoLan) {
      return fail("--lan と --no-lan は同時に渡せない");
    }
    const [id, ...extra] = rest.filter(
      (arg) => arg !== "--lan" && arg !== "--no-lan",
    );
    if (extra.length > 0 || id?.startsWith("-")) {
      return fail(`${name} [<id>] [--lan|--no-lan] の形で渡す`);
    }
    if (id !== undefined && !isDeckId(id) && handoutKindOf(id) === undefined) {
      return fail(`資料の id の形が正しくない: ${id}`);
    }
    const lan = hasLan ? true : hasNoLan ? false : undefined;
    return {
      success: true,
      command: {
        name,
        ...(id ? { id } : {}),
        ...(lan !== undefined ? { lan } : {}),
      },
    };
  }
  if (name === "templates") return parseTemplates(rest);
  if (name === "share") return parseShare(rest);
  if (name === "shot") return parseShot(rest);
  if (name === "diagram") return parseDiagram(rest);
  if (name === "settings") return parseSettings(rest);
  if (name === "examples") return parseExamples(rest);
  if (name === "sheet") return parseHandoutCli("sheet", rest);
  if (name === "document") return parseHandoutCli("document", rest);
  if (name === "design") {
    return rest.length === 1 && rest[0] === "build"
      ? { success: true, command: { name: "design-build" } }
      : fail("design build の形で渡す");
  }
  return fail(`知らないコマンド: ${name}`);
};

export type NewDeckResult =
  | {
      success: true;
      deckId: string;
      dir: string;
      deckPath: string;
      createdAt: string;
      templated: boolean;
      // deck.json の template に入れるテンプレート。指定も骨組みも無ければ undefined(既定)
      template?: string;
    }
  | { success: false; message: string };

// 場所を確保する。テンプレート指定なら deck.json の骨組みも置く。
// 骨組みが無ければ deck.json は無いので、エージェントが書くまで資料一覧には出ない
export const createDeckForAgent = async ({
  workspaceRoot,
  designDir,
  title,
  outlineId,
  templateId,
  now,
}: {
  workspaceRoot: string;
  designDir: string;
  title: string;
  outlineId?: string;
  templateId?: string;
  now: Date;
}): Promise<NewDeckResult> => {
  const designs = await templateNames(designDir, "slide");
  if (templateId && !designs.includes(templateId)) {
    return {
      success: false,
      message: `テンプレートが見つからない: ${templateId}(使えるもの: ${designs.join(", ")})`,
    };
  }
  const claimed = outlineId
    ? await createDeckFromOutline(
        workspaceRoot,
        designDir,
        { outlineId, templateId, title },
        now,
      )
    : { success: true as const, deck: undefined };
  if (!claimed.success) {
    const names = (await listOutlines(designDir)).map(
      (outline) => outline.outlineId,
    );
    return {
      success: false,
      message: `構成が見つからない: ${outlineId}(使えるもの: ${names.join(", ")})`,
    };
  }
  const deckId = claimed.deck?.id ?? (await claimDeckDir(workspaceRoot, now));
  const dir = deckDir(workspaceRoot, deckId);
  // 構成なしでも、見た目のテンプレートに同梱の絵を assets/ へ写す(構成ありは作成の中で写し済み)
  if (!claimed.deck) {
    const design = await resolveDesign(designDir, templateId);
    if (design) await copyTemplateAssets(designDir, [design], dir);
  }
  return {
    success: true,
    deckId,
    dir,
    deckPath: join(dir, "deck.json"),
    createdAt: now.toISOString(),
    templated: claimed.deck !== undefined,
    template: claimed.deck ? deckTemplate(claimed.deck) : templateId,
  };
};

export const formatNewDeck = (
  result: Extract<NewDeckResult, { success: true }>,
): string =>
  [
    `id: ${result.deckId}`,
    `path: ${result.deckPath}`,
    `createdAt: ${result.createdAt}`,
    `outline: ${result.templated ? "骨組みを置いた" : "なし"}`,
    `template: ${result.template ?? "既定"}`,
  ].join("\n");

export const deckUrl = openUrl;

// ai-handout-studio examples。入れた資料ごとに id・中身のファイル・開く URL を出し、空行で分ける
export const formatExamples = (
  installed: readonly { id: string; path: string }[],
  origin: string,
  lanOrigins: readonly string[] = [],
): string =>
  installed
    .map((example) =>
      [
        `id: ${example.id}`,
        `path: ${example.path}`,
        ...urlLines(origin, example.id, lanOrigins),
      ].join("\n"),
    )
    .join("\n\n");

// 開く資料の中身のファイル。質問票と HTML 資料は decks/ の外にある
const openPathOf = (workspaceRoot: string, id: string): string => {
  const kind = handoutKindOf(id);
  return kind
    ? contentPathOf(workspaceRoot, kind, id)
    : join(deckDir(workspaceRoot, id), "deck.json");
};

// 1行目は開く URL。修正の手順で読むファイルの場所も添える。
// 質問票と HTML 資料は原寸で読む URL も添える。LAN の origin があれば lanUrl・lanReadUrl も並べる
export const formatOpen = (
  workspaceRoot: string,
  origin: string,
  id?: string,
  lanOrigins: readonly string[] = [],
): string =>
  [
    ...urlLines(origin, id, lanOrigins),
    id
      ? `path: ${openPathOf(workspaceRoot, id)}`
      : `decks: ${decksDir(workspaceRoot)}`,
  ].join("\n");

// 区分ごとのテンプレートの一覧の画面
const surfaceUrlPath: Record<Surface, string> = {
  slide: "slides",
  sheet: "sheets",
  document: "documents",
};

export type TemplatesResult =
  | { success: true; text: string }
  | { success: false; message: string };

const formatTemplateLine = (
  name: string,
  template: { label: string; description?: string },
  isDefault: boolean,
): string =>
  `- ${name}: ${template.label}${isDefault ? "(既定)" : ""}${
    template.description ? ` — ${template.description}` : ""
  }`;

const formatTemplateBlock = (
  surface: Surface,
  templates: Record<string, { label: string; description?: string }>,
  defaultName: string,
  origin: string,
): string =>
  [
    `kind: ${surface}`,
    `default: ${defaultName}`,
    `url: ${origin}/${surfaceUrlPath[surface]}/templates`,
    ...Object.entries(templates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, template]) =>
        formatTemplateLine(name, template, name === defaultName),
      ),
  ].join("\n");

// ai-handout-studio templates。design/templates/<区分>/ と design/selection.json を読むだけで、
// アプリが起きていなくても動く
export const formatTemplates = async (
  designDir: string,
  origin: string,
  kind?: Surface,
): Promise<TemplatesResult> => {
  const selection = await readSelection(designDir);
  if (!selection.success) return selection;
  const templates = await readTemplates(designDir);
  if (!templates.success) return templates;
  const kinds = kind ? [kind] : surfaceNames;
  return {
    success: true,
    text: kinds
      .map((surface) =>
        formatTemplateBlock(
          surface,
          templates.value[surface],
          selection.value[surface],
          origin,
        ),
      )
      .join("\n\n"),
  };
};

// open・restart が LAN に開くかどうか。--lan / --no-lan があればそれに、無ければ設定(features.lan)に従う
export const resolveLan = (
  override: boolean | undefined,
  features: Pick<ResolvedSettings["features"], "lan">,
): boolean => override ?? features.lan;

// ai-handout-studio settings。既定値で埋めた今の設定を1行ずつ出す
export const formatSettings = (settings: ResolvedSettings): string =>
  [
    `orgName: ${settings.orgName}`,
    `locale: ${settings.locale}`,
    `features.lan: ${settings.features.lan}`,
    `features.imageGeneration: ${settings.features.imageGeneration}`,
    `features.share: ${settings.features.share}`,
    `agentInstructions: ${settings.agentInstructions}`,
  ].join("\n");

const FEATURE_OF = {
  "features.lan": "lan",
  "features.imageGeneration": "imageGeneration",
  "features.share": "share",
} as const;

const applySettingsUpdate = (
  profile: Profile,
  update: SettingsUpdate,
): Profile => {
  if (update.key === "orgName") return { ...profile, orgName: update.value };
  if (update.key === "locale") return { ...profile, locale: update.value };
  if (update.key === "agentInstructions") {
    return { ...profile, agentInstructions: update.value };
  }
  return {
    ...profile,
    features: { ...profile.features, [FEATURE_OF[update.key]]: update.value },
  };
};

// settings --set の中身を profile.json の値に重ねる。値はすでに検証・変換済み(parseSettings)。
// 既定値で埋めずに書くので、決めていない項目は決めていないまま残る(doctor がセットアップの残りを見分ける)
export const applySettingsUpdates = (
  profile: Profile | undefined,
  updates: readonly SettingsUpdate[],
): Profile => updates.reduce(applySettingsUpdate, { orgName: "", ...profile });
