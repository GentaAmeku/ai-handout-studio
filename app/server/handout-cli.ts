import { join } from "node:path";
import { parseArgs } from "node:util";
import { type SheetBase, sheetBaseNames } from "../src/schema/design.ts";
import {
  type HandoutKind,
  handoutDir,
  handoutKindOf,
  isHandoutId,
} from "./handouts.ts";

// ai-handout-studio sheet …・document … の読み取りと出力の形。
// プロセスとファイルの読み書きは scripts/cli.ts と handout-store.ts が持つ

export const HANDOUT_USAGE = [
  "  ai-handout-studio sheet new --questions <質問JSON> [--title <題名>] [--template <テンプレート>] [--layout <focus|overview|all|print>]",
  "  ai-handout-studio sheet update <id> --questions <質問JSON> [--layout <focus|overview|all|print>]",
  "  ai-handout-studio sheet update <id> --layout <focus|overview|all|print>",
  "  ai-handout-studio sheet answers <id> --answers <回答JSON>",
  "  ai-handout-studio sheet export <id> [--out <書き出し先>]",
  "  ai-handout-studio document new --json <document.json> [--title <題名>] [--template <テンプレート>]",
  "  ai-handout-studio document update <id> --json <document.json> [--title <題名>]",
  "  ai-handout-studio document new --title <題名> --html <本文HTML> [--template <テンプレート>]  (移行期)",
  "  ai-handout-studio document update <id> --html <本文HTML> [--title <題名>]  (移行期)",
  "  ai-handout-studio document export <id> [--out <書き出し先>]",
];

export type DocumentFormat = "json" | "html";

export type HandoutCommand =
  | {
      name: "handout-new";
      kind: HandoutKind;
      file: string;
      // HTML 資料の中身の形。json は document.json、html は移行期の本文の断片
      format?: DocumentFormat;
      title?: string;
      templateId?: string;
      // 質問票だけ。骨格(レイアウト)を明示に選ぶ
      layout?: SheetBase;
    }
  | {
      name: "handout-update";
      kind: HandoutKind;
      id: string;
      // 質問票は --layout だけでも回るので、file は無いことがある
      file?: string;
      format?: DocumentFormat;
      title?: string;
      layout?: SheetBase;
    }
  | { name: "sheet-answers"; id: string; file: string }
  | { name: "handout-export"; kind: HandoutKind; id: string; out?: string };

export type ParsedHandout =
  | { success: true; command: HandoutCommand }
  | { success: false; message: string };

const fail = (message: string): ParsedHandout => ({ success: false, message });

const options = {
  title: { type: "string" },
  template: { type: "string" },
  questions: { type: "string" },
  answers: { type: "string" },
  html: { type: "string" },
  json: { type: "string" },
  out: { type: "string" },
  layout: { type: "string" },
} as const;

const read = (args: readonly string[]) => {
  try {
    return parseArgs({ args: [...args], options, allowPositionals: true });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const cleanTitle = (value: string | undefined): string | undefined => {
  const title = value?.replace(/\s+/g, " ").trim();
  return title ? title : undefined;
};

// --layout の値。質問票だけで使う
const parseLayoutArg = (
  kind: HandoutKind,
  value: string | undefined,
): { ok: true; layout?: SheetBase } | { ok: false; message: string } => {
  if (value === undefined) return { ok: true };
  if (kind !== "sheet")
    return { ok: false, message: "--layout は質問票だけで使う" };
  return (sheetBaseNames as readonly string[]).includes(value)
    ? { ok: true, layout: value as SheetBase }
    : {
        ok: false,
        message: `--layout の値が正しくない: ${value}(${sheetBaseNames.join("・")} のどれか)`,
      };
};

export const parseHandoutCli = (
  kind: HandoutKind,
  argv: readonly string[],
): ParsedHandout => {
  const [action, ...rest] = argv;
  const label = kind === "sheet" ? "質問票" : "HTML 資料";
  const parsed = read(rest);
  if (parsed instanceof Error) return fail(parsed.message);
  const { values, positionals } = parsed;
  const title = cleanTitle(values.title);
  if (kind === "document" && values.json && values.html) {
    return fail("--json と --html は同時に渡せない");
  }
  // 質問票は --questions、HTML 資料は --json(document.json)か --html(移行期)
  const format: DocumentFormat | undefined =
    kind === "document" ? (values.json ? "json" : "html") : undefined;
  const file = kind === "sheet" ? values.questions : values[format ?? "html"];
  const formatPart = format ? { format } : {};
  const layout = parseLayoutArg(kind, values.layout);
  if (!layout.ok) return fail(layout.message);

  if (action === "new") {
    if (positionals.length > 0) {
      return fail(`余分な引数: ${positionals.join(" ")}`);
    }
    if (!file) {
      return fail(
        kind === "sheet"
          ? "--questions <ファイル> が要る"
          : "--json <document.json> が要る",
      );
    }
    if (format === "html" && !title) return fail("--title <題名> が要る");
    return {
      success: true,
      command: {
        name: "handout-new",
        kind,
        file,
        ...formatPart,
        ...(title ? { title } : {}),
        ...(values.template ? { templateId: values.template } : {}),
        ...(layout.layout ? { layout: layout.layout } : {}),
      },
    };
  }

  const found = (():
    | { ok: true; id: string }
    | { ok: false; message: string } => {
    const [id, ...extra] = positionals;
    if (!id) return { ok: false, message: `${label}の id を渡す` };
    if (extra.length > 0) {
      return { ok: false, message: `余分な引数: ${extra.join(" ")}` };
    }
    return isHandoutId(kind, id)
      ? { ok: true, id }
      : { ok: false, message: `${label}の id の形が正しくない: ${id}` };
  })();

  if (action === "update") {
    if (!found.ok) return fail(found.message);
    // 質問票は --layout だけでも回る。それ以外はファイルが要る
    if (!file && !(kind === "sheet" && layout.layout)) {
      return fail(
        kind === "sheet"
          ? "--questions か --layout のどちらかが要る"
          : "--json <document.json> が要る",
      );
    }
    return {
      success: true,
      command: {
        name: "handout-update",
        kind,
        id: found.id,
        ...(file ? { file } : {}),
        ...formatPart,
        ...(title ? { title } : {}),
        ...(layout.layout ? { layout: layout.layout } : {}),
      },
    };
  }

  if (action === "answers") {
    if (kind !== "sheet") return fail("answers は質問票だけで使う");
    if (!found.ok) return fail(found.message);
    if (!values.answers) return fail("--answers <ファイル> が要る");
    return {
      success: true,
      command: { name: "sheet-answers", id: found.id, file: values.answers },
    };
  }

  if (action === "export") {
    if (!found.ok) return fail(found.message);
    return {
      success: true,
      command: {
        name: "handout-export",
        kind,
        id: found.id,
        ...(values.out ? { out: values.out } : {}),
      },
    };
  }

  return fail(`知らないコマンド: ${kind} ${action ?? ""}`.trim());
};

// 画面で開く経路。id の形から区分を決める
export const handoutPath: Record<HandoutKind, string> = {
  sheet: "sheets",
  document: "documents",
};

// 質問票を原寸で読む URL。資料の1件のページ(/sheets/<id>)は見本を縮めて出すので、
// 読んで回答欄に書き込むのはこちら。回答の送信は持たない
export const sheetReadUrl = (origin: string, id: string): string =>
  `${origin}/api/sheets/${encodeURIComponent(id)}/preview`;

// HTML 資料を原寸で読む URL。書き出しと同じ1枚の HTML で、スマホの幅でも横にはみ出さない
export const documentReadUrl = (origin: string, id: string): string =>
  `${origin}/api/documents/${encodeURIComponent(id)}/preview`;

// 原寸で読む URL。スライドには無い
export const readUrlOf = (origin: string, id: string): string | undefined => {
  const kind = handoutKindOf(id);
  if (kind === "sheet") return sheetReadUrl(origin, id);
  if (kind === "document") return documentReadUrl(origin, id);
  return undefined;
};

// 開く URL と原寸で読む URL の行。LAN の origin は lanUrl・lanReadUrl として同じ形で並べる
export const urlLines = (
  origin: string,
  id: string | undefined,
  lanOrigins: readonly string[] = [],
): string[] => {
  const linesOf = (base: string, lan: boolean): string[] => {
    const readUrl = id ? readUrlOf(base, id) : undefined;
    return [
      `${lan ? "lanUrl" : "url"}: ${openUrl(base, id)}`,
      ...(readUrl ? [`${lan ? "lanReadUrl" : "readUrl"}: ${readUrl}`] : []),
    ];
  };
  return [
    ...linesOf(origin, false),
    ...lanOrigins.flatMap((lanOrigin) => linesOf(lanOrigin, true)),
  ];
};

export const openUrl = (origin: string, id?: string): string => {
  if (!id) return `${origin}/`;
  const kind = handoutKindOf(id);
  return kind
    ? `${origin}/${handoutPath[kind]}/${id}`
    : `${origin}/decks/${id}`;
};

// 中身のファイル。修正の手順で読み直す場所として出す
export const contentPathOf = (
  root: string,
  kind: HandoutKind,
  id: string,
): string =>
  join(
    handoutDir(root, kind, id),
    kind === "sheet" ? "questions.json" : "document.json",
  );

export const formatHandout = ({
  kind,
  id,
  root,
  origin,
  template,
  createdAt,
  lanOrigins = [],
}: {
  kind: HandoutKind;
  id: string;
  root: string;
  origin: string;
  template: string;
  createdAt: string;
  // LAN に開いたサーバーのとき、スマホから開く origin
  lanOrigins?: readonly string[];
}): string =>
  [
    `id: ${id}`,
    `path: ${contentPathOf(root, kind, id)}`,
    ...urlLines(origin, id, lanOrigins),
    `createdAt: ${createdAt}`,
    `template: ${template}`,
  ].join("\n");
