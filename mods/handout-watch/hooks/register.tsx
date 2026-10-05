import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";

import type { HandoutKind, HandoutRow, Locale, Studio } from "../types";

// この会話で作った・直した AI Handout Studio の資料を、入力欄の上の帯と横のパネルに出す。
// mod は clone の mods/handout-watch にあり、~/.claude/skills/handout-watch の symlink から読まれる

// studio の待ち受け。mod の Link は http なら localhost だけを受け付ける(doctor は 127.0.0.1:5190 を見る)
const ORIGIN = "http://localhost:5190";
const SCAN_MS = 60_000;
// 帯に並べる件数。残りは「ほか N 件」にまとめる
const BAND_MAX = 3;
const PANE = "handout-watch";

// 資料を作る・直す・回答を保存するコマンド。open・export は中身を変えないので数えない
// スライドは new で場所を取り、deck.json を書いたあと check にかける
const STUDIO_COMMAND =
  /ai-handout-studio\s+(?:new|check|document\s+(?:new|update)|sheet\s+(?:new|update|answers))\b/;
const HANDOUT_ID = /\b(?:deck|doc|sheet)_\d{8}_\d{3}\b/g;
// スライドと HTML 資料は正本を直接書くこともあるので、ファイルの道具で書いた先からも拾う
const HANDOUT_FILE =
  /\/workspace\/(?:decks|documents)\/((?:deck|doc)_\d{8}_\d{3})\/(?:deck|document)\.json$/;
const FILE_TOOLS = ["Write", "Edit"] as const;

const DIRS: Record<HandoutKind, string> = {
  deck: "decks",
  document: "documents",
  sheet: "sheets",
};

const studio = atom({ plugin: "handout-watch", key: "studio" } as const, null);
const locale = atom({ plugin: "handout-watch", key: "locale" } as const, "en");
const tracked = atom({ plugin: "handout-watch", key: "tracked" } as const, []);
const handouts = atom(
  { plugin: "handout-watch", key: "handouts" } as const,
  [],
);
const hidden = atom({ plugin: "handout-watch", key: "hidden" } as const, []);
const isServerUp = atom(
  { plugin: "handout-watch", key: "isServerUp" } as const,
  null,
);
const scannedAt = atom(
  { plugin: "handout-watch", key: "scannedAt" } as const,
  0,
);
const icon = atom({ plugin: "handout-watch", key: "icon" } as const, null);

// studio のアイコンの青
const BLUE = "#2563eb";
const GRAY = "#8b949e";
const AMBER = "#d29922";
const GREEN = "#2ea043";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const KIND: Record<Locale, Record<HandoutKind, string>> = {
  ja: { deck: "スライド", document: "HTML 資料", sheet: "質問票" },
  en: { deck: "Slides", document: "HTML handout", sheet: "Question sheet" },
};

const TEXT = {
  ja: {
    kind: KIND.ja,
    count: {
      deck: (n: number) => `${n}枚`,
      document: (n: number) => `${n}章`,
      sheet: (n: number) => `${n}問`,
    },
    minutes: (n: number) => `${n}分前`,
    hours: (n: number) => `${n}時間前`,
    days: (n: number) => `${n}日前`,
    updated: (ago: string) => `${ago}に更新`,
    read: "読む",
    edit: "編集",
    open: "開く",
    answer: "回答する",
    hide: "隠す",
    unhide: "帯に戻す",
    start: "studio を起動",
    list: "一覧",
    more: (n: number) => `ほか ${n} 件`,
    title: "この会話の資料",
    band: (n: number) => `この会話の資料 ${n}件`,
    unanswered: (n: number) => `未回答の質問票 ${n}件`,
    paneHeader: (n: number, open: number) =>
      `この会話の資料 ${n}件${open > 0 ? `(未回答の質問票 ${open}件)` : ""}`,
    answered: "✓ 回答済み",
    waiting: "未回答",
    waitingHidden: "未回答(隠し中)",
    hidden: "隠し中",
    empty: "この会話ではまだ資料を作っていません。",
    notFound:
      "この mod の場所から AI Handout Studio の clone が見つかりません。clone の mods/handout-watch への symlink で入れてください。",
    serverDown:
      "studio のサーバーが止まっています。「studio を起動」で起動してから開いてください。",
    footer:
      "この会話で ai-handout-studio の new・check・document new / update・sheet new / update / answers を実行した資料と、deck.json・document.json を書き換えた資料を数えています。",
    startFailed: (reason: string) => `studio を起動できませんでした: ${reason}`,
    command: "この会話で作った資料を横のパネルで一覧する",
    iconAlt: (kind: HandoutKind, count: number) =>
      kind === "sheet"
        ? `AI Handout Studio の質問票 ${count}問`
        : `AI Handout Studio の${KIND.ja[kind]}`,
  },
  en: {
    kind: KIND.en,
    count: {
      deck: (n: number) => plural(n, "slide", "slides"),
      document: (n: number) => plural(n, "section", "sections"),
      sheet: (n: number) => plural(n, "question", "questions"),
    },
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    days: (n: number) => `${n} d ago`,
    updated: (ago: string) => `updated ${ago}`,
    read: "Read",
    edit: "Edit",
    open: "Open",
    answer: "Answer",
    hide: "Hide",
    unhide: "Show above the prompt",
    start: "Start studio",
    list: "List",
    more: (n: number) => `+${n} more`,
    title: "Handouts in this conversation",
    band: (n: number) => `Handouts in this conversation: ${n}`,
    unanswered: (n: number) => `Unanswered question sheets: ${n}`,
    paneHeader: (n: number, open: number) =>
      `Handouts in this conversation: ${n}${open > 0 ? ` (unanswered question sheets: ${open})` : ""}`,
    answered: "✓ Answered",
    waiting: "Unanswered",
    waitingHidden: "Unanswered (hidden)",
    hidden: "Hidden",
    empty: "No handouts have been made in this conversation yet.",
    notFound:
      "Could not find the AI Handout Studio clone from where this mod is. Install it as a symlink to the clone’s mods/handout-watch.",
    serverDown:
      "The studio server is not running. Press “Start studio”, then open the handout.",
    footer:
      "Counts the handouts this conversation made or changed with ai-handout-studio new, check, document new / update or sheet new / update / answers, or by editing deck.json or document.json.",
    startFailed: (reason: string) => `Could not start studio: ${reason}`,
    command: "List the handouts made in this conversation in a side pane",
    iconAlt: (kind: HandoutKind, count: number) =>
      kind === "sheet"
        ? `AI Handout Studio question sheet, ${plural(count, "question", "questions")}`
        : `AI Handout Studio ${KIND.en[kind]}`,
  },
};

type Words = (typeof TEXT)["en"];

const kindOf = (id: string): HandoutKind =>
  id.startsWith("deck_")
    ? "deck"
    : id.startsWith("doc_")
      ? "document"
      : "sheet";

const isOpenSheet = (row: HandoutRow): boolean =>
  row.kind === "sheet" && !row.isAnswered;

const isDoneSheet = (row: HandoutRow): boolean =>
  row.kind === "sheet" && row.isAnswered;

type HandoutLink = { key: string; href: string; label: string };

const linksOf = (row: HandoutRow, words: Words): HandoutLink[] => {
  const id = encodeURIComponent(row.id);
  if (row.kind === "sheet")
    return [
      {
        key: "read",
        href: `${ORIGIN}/api/sheets/${id}/preview`,
        label: row.isAnswered ? words.open : words.answer,
      },
    ];
  if (row.kind === "document")
    return [
      {
        key: "read",
        href: `${ORIGIN}/api/documents/${id}/preview`,
        label: words.read,
      },
      { key: "edit", href: `${ORIGIN}/documents/${id}`, label: words.edit },
    ];
  return [{ key: "open", href: `${ORIGIN}/decks/${id}`, label: words.open }];
};

const ageOf = (ms: number, words: Words): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return words.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.hours(hours);
  return words.days(Math.floor(hours / 24));
};

// 区分・数・時間を1行にする。質問票は作ってからの時間、ほかは最後に直してからの時間
const metaOf = (row: HandoutRow, now: number, words: Words): string =>
  [
    words.kind[row.kind],
    row.count > 0 ? words.count[row.kind](row.count) : null,
    row.kind === "sheet"
      ? ageOf(now - row.createdAt, words)
      : words.updated(ageOf(now - row.updatedAt, words)),
  ]
    .filter(Boolean)
    .join(" · ");

const parse = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const textOf = (value: unknown): string =>
  typeof value === "string" ? value : "";

const timeOf = (value: unknown): number => Date.parse(textOf(value)) || 0;

const lengthOf = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

// コマンドが資料を作った・直した・回答を保存したものなら、その id を返す
const idsOf = (command: string, output: string): string[] =>
  STUDIO_COMMAND.test(command)
    ? [
        ...new Set(
          [...command.matchAll(HANDOUT_ID), ...output.matchAll(HANDOUT_ID)].map(
            (match) => match[0],
          ),
        ),
      ]
    : [];

// ファイルの道具で書いた先が studio の資料の正本なら、その id を返す
const fileIdOf = (path: string): string | null =>
  HANDOUT_FILE.exec(path)?.[1] ?? null;

const badge = (count: number): string =>
  `<circle cx="27" cy="27" r="7" fill="#ffffff"/>` +
  `<circle cx="27" cy="27" r="6" fill="${BLUE}"/>` +
  `<text x="27" y="30.3" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="9" font-weight="700" fill="#ffffff">${Math.min(count, 99)}</text>`;

// studio のアイコンを左上に置き、質問票なら右下に質問の数を重ねる
const studioIconSvg = (favicon: string, count: number | null): string => {
  const inner = favicon
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[\s\S]*?<\/title>/, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">` +
    `<svg x="0" y="0" width="28" height="28" viewBox="0 0 32 32">${inner}</svg>` +
    (count === null ? "" : badge(count)) +
    `</svg>`
  );
};

// アイコンが読めなかったときの印。紙を描き、質問票なら「?」を書く
const fallbackIconSvg = (count: number | null): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">` +
  `<rect x="2" y="1" width="24" height="27" rx="4" fill="${BLUE}" opacity="0.18" stroke="${BLUE}" stroke-width="1.5"/>` +
  (count === null
    ? ""
    : `<text x="14" y="20" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="15" font-weight="700" fill="${BLUE}">?</text>` +
      badge(count)) +
  `</svg>`;

const iconSvgOf = (favicon: string | null, row: HandoutRow): string => {
  const count = row.kind === "sheet" ? row.count : null;
  return favicon ? studioIconSvg(favicon, count) : fallbackIconSvg(count);
};

// 質問の数を点で並べる。何問あるかを読まずにつかめるようにする
const dotsSvg = (count: number, isAnswered: boolean): string => {
  const shown = Math.min(count, 12);
  const color = isAnswered ? GREEN : BLUE;
  const dots = Array.from(
    { length: shown },
    (_, i) =>
      `<circle cx="${i * 12 + 5}" cy="5" r="4" fill="${isAnswered ? color : "none"}" stroke="${color}" stroke-width="1.5"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shown * 12}" height="10" viewBox="0 0 ${shown * 12} 10">${dots.join("")}</svg>`;
};

// 未回答の質問票(答えを待っているもの)を先に、あとは直した新しい順に並べる
const byAttention = (a: HandoutRow, b: HandoutRow): number =>
  Number(isOpenSheet(b)) - Number(isOpenSheet(a)) || b.updatedAt - a.updatedAt;

// mod の場所(symlink を辿った先、<clone>/mods/handout-watch)から clone を割り出す
async function findStudio($: EngineInterface): Promise<Studio | null> {
  const stat = await $.fs
    .stat($.plugin.root, { resolve: true })
    .catch(() => undefined);
  const real = stat?.realPath?.replace(/\/+$/, "");
  if (!real) return null;
  const root = real.split("/").slice(0, -2).join("/");
  const workspace = await $.env.get("AI_HANDOUT_STUDIO_WORKSPACE");
  return { root, workspace: workspace || `${root}/workspace` };
}

// doctor と同じく、設定の locale、無ければ LANG で決める
async function localeOf(
  $: EngineInterface,
  found: Studio | null,
): Promise<Locale> {
  const text = found
    ? await $.fs.read(`${found.workspace}/profile.json`).catch(() => "")
    : "";
  const value = parse(text).locale;
  if (value === "ja" || value === "en") return value;
  return ((await $.env.get("LANG")) ?? "").startsWith("ja") ? "ja" : "en";
}

async function deckRowOf(
  $: EngineInterface,
  dir: string,
  id: string,
): Promise<HandoutRow | null> {
  if (!(await $.fs.exists(`${dir}/deck.json`))) return null;
  const deck = parse(await $.fs.read(`${dir}/deck.json`));
  const meta = objectOf(deck.meta);
  const createdAt = timeOf(meta.createdAt);
  return {
    id,
    kind: "deck",
    title: textOf(deck.title) || id,
    description: "",
    count: lengthOf(deck.slides),
    questionTitles: [],
    createdAt,
    updatedAt: timeOf(meta.updatedAt) || createdAt,
    isAnswered: false,
  };
}

async function documentRowOf(
  $: EngineInterface,
  dir: string,
  id: string,
): Promise<HandoutRow | null> {
  if (!(await $.fs.exists(`${dir}/meta.json`))) return null;
  const meta = parse(await $.fs.read(`${dir}/meta.json`));
  // 移行期の HTML だけの資料には document.json が無い。題名と日時は meta.json で足りる
  const document = (await $.fs.exists(`${dir}/document.json`))
    ? parse(await $.fs.read(`${dir}/document.json`))
    : {};
  const createdAt = timeOf(meta.createdAt);
  return {
    id,
    kind: "document",
    title: textOf(meta.title) || textOf(document.title) || id,
    description: textOf(objectOf(document.head).lede),
    count: lengthOf(document.sections),
    questionTitles: [],
    createdAt,
    updatedAt: timeOf(meta.updatedAt) || createdAt,
    isAnswered: false,
  };
}

async function sheetRowOf(
  $: EngineInterface,
  dir: string,
  id: string,
): Promise<HandoutRow | null> {
  if (!(await $.fs.exists(`${dir}/meta.json`))) return null;
  const meta = parse(await $.fs.read(`${dir}/meta.json`));
  const questions = parse(await $.fs.read(`${dir}/questions.json`));
  const list = Array.isArray(questions.questions)
    ? (questions.questions as Record<string, unknown>[])
    : [];
  const createdAt = timeOf(meta.createdAt);
  return {
    id,
    kind: "sheet",
    title: textOf(meta.title) || textOf(questions.title) || id,
    description: textOf(questions.description) || textOf(questions.context),
    count: list.length,
    questionTitles: list.map((one) => textOf(one.title)).filter(Boolean),
    createdAt,
    updatedAt: timeOf(meta.updatedAt) || createdAt,
    isAnswered: await $.fs.exists(`${dir}/answers.json`),
  };
}

async function rowOf(
  $: EngineInterface,
  found: Studio,
  id: string,
): Promise<HandoutRow | null> {
  const kind = kindOf(id);
  const dir = `${found.workspace}/${DIRS[kind]}/${id}`;
  // 書きかけの資料は読めなければ次の見回りで拾う
  if (kind === "deck") return deckRowOf($, dir, id).catch(() => null);
  if (kind === "document") return documentRowOf($, dir, id).catch(() => null);
  return sheetRowOf($, dir, id).catch(() => null);
}

async function scan($: EngineInterface): Promise<void> {
  const found = await read($, studio);
  const ids = await read($, tracked);
  if (!found || ids.length === 0) {
    await update($, handouts, () => []);
    return;
  }
  const rows = (await Promise.all(ids.map((id) => rowOf($, found, id)))).filter(
    (row): row is HandoutRow => row !== null,
  );
  const now = await $.clock.now();
  await update($, handouts, () => rows.sort(byAttention));
  await update($, scannedAt, () => now);
  if (rows.length > 0) await checkServer($);
}

// id を数える対象に足してから見直す。足すものが無くても、回答の保存や書き換えを拾うために見直す
async function track($: EngineInterface, ids: string[]): Promise<void> {
  const current = await read($, tracked);
  const added = [...new Set(ids)].filter((id) => !current.includes(id));
  if (added.length > 0) await update($, tracked, (list) => [...list, ...added]);
  await scan($);
}

// 会話の記録から、この会話で資料を作った・直したコマンドと書き込みを拾い直す(読み込み前・再開前の分)
async function backfill($: EngineInterface): Promise<void> {
  const messages = await $.session.messages();
  const ids = messages.flatMap((message) =>
    message.toolUses.flatMap((use) => {
      if (use.tool === "Bash")
        return idsOf(textOf(use.input.command), use.text ?? "");
      const id = (FILE_TOOLS as readonly string[]).includes(use.tool)
        ? fileIdOf(textOf(use.input.file_path))
        : null;
      return id ? [id] : [];
    }),
  );
  await track($, ids);
}

async function loadIcon(
  $: EngineInterface,
  found: Studio | null,
): Promise<void> {
  const text = found
    ? await $.fs.read(`${found.root}/app/public/favicon.svg`).catch(() => "")
    : "";
  await update($, icon, () => (text.includes("<svg") ? text : null));
}

async function checkServer($: EngineInterface): Promise<void> {
  const isUp = await $.http
    .fetch(`${ORIGIN}/`)
    .then(() => true)
    .catch(() => false);
  await update($, isServerUp, () => isUp);
}

async function startStudio($: EngineInterface): Promise<void> {
  const found = await read($, studio);
  const words = TEXT[await read($, locale)];
  if (!found) return;
  const failure = await $.process
    .run([`${found.root}/scripts/cli.mjs`, "open"], { timeoutMs: 60_000 })
    .then((run) => (run.exitCode === 0 ? null : run.stderr.trim()))
    .catch((error) => String(error));
  if (failure !== null) $.ui.toast(words.startFailed(failure.slice(0, 120)));
  await checkServer($);
}

// clone の場所と言葉を決める。session.start と /clear・/resume のあとに呼ぶ
async function locate($: EngineInterface): Promise<Locale> {
  const found = await findStudio($);
  const lang = await localeOf($, found);
  await update($, studio, () => found);
  await update($, locale, () => lang);
  return lang;
}

async function setup($: EngineInterface): Promise<void> {
  await loadIcon($, await read($, studio));
  await backfill($);
}

const openPane = async ($: EngineInterface): Promise<void> => {
  await $.ui.open({
    id: PANE,
    title: TEXT[await read($, locale)].title,
    focus: true,
    closeOnEscape: true,
  });
};

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const lang = await locate($);
    await $.command.register({
      name: "handout-watch",
      description: TEXT[lang].command,
      immediate: true,
    });
    void setup($);
    $.clock.every(SCAN_MS, () => void scan($));
    return next(e);
  });

  // /clear・/resume で $.state が戻ったら、会話の記録から拾い直す
  on(
    "classic.SessionStart",
    { source: ["clear", "resume", "fork"] },
    async ($, e, next) => {
      await locate($);
      void setup($);
      return next(e);
    },
  );

  on("command.run", { command: "handout-watch" }, async ($) => {
    await openPane($);
    return {};
  });

  // 資料を作った・直した・回答を保存したら、待たずに見直す(サブエージェントの分も通る)
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const result = await next(e);
    const command = textOf(e.command);
    if (STUDIO_COMMAND.test(command)) {
      const output =
        typeof result.text === "string"
          ? result.text
          : JSON.stringify(result.result ?? "");
      void track($, idsOf(command, output));
    }
    return result;
  });

  on("tool.call", { tool: FILE_TOOLS }, async ($, e, next) => {
    const result = await next(e);
    const id = fileIdOf(textOf(e.file_path));
    if (id) void track($, [id]);
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (
      e.props.hasSurvey ||
      (e.surface !== "desktop" && e.surface !== "terminal")
    )
      return next(e);
    const hiddenIds = await read($, hidden);
    const rows = (await read($, handouts)).filter(
      (row) => !isDoneSheet(row) && !hiddenIds.includes(row.id),
    );
    if (rows.length === 0) return next(e);
    const words = TEXT[await read($, locale)];
    const now = await read($, scannedAt);
    const isUp = await read($, isServerUp);
    const favicon = await read($, icon);
    const theirs = await next(e);
    const { Box, Text, Button, Link } = $.ui.resolve(e);
    const iconOf = (row: HandoutRow) => {
      if (e.surface !== "desktop") return <Text color={BLUE}>▣</Text>;
      const { Svg } = $.ui.resolve(e);
      return (
        <Svg
          source={iconSvgOf(favicon, row)}
          alt={words.iconAlt(row.kind, row.count)}
        />
      );
    };
    const openSheets = rows.filter(isOpenSheet).length;

    const cards = rows.slice(0, BAND_MAX).map((row) => (
      <Box
        key={`handout-${row.id}`}
        flexDirection="row"
        columnGap={1}
        marginTop={1}
      >
        {iconOf(row)}
        <Box flexDirection="column" flexShrink={1}>
          <Box flexDirection="row" columnGap={1}>
            <Text bold wrap="truncate-end">
              {row.title}
            </Text>
            <Text dimColor>{metaOf(row, now, words)}</Text>
          </Box>
          {row.description && (
            <Text dimColor wrap="truncate-end">
              {row.description}
            </Text>
          )}
          <Box flexDirection="row" columnGap={2}>
            {isUp === false ? (
              <Button
                key={`start-${row.id}`}
                label={words.start}
                plain
                onPress={() => void startStudio($)}
              />
            ) : (
              linksOf(row, words).map((link) => (
                <Text key={`${link.key}-${row.id}`}>
                  <Link href={link.href} label={link.label} />
                </Text>
              ))
            )}
            <Button
              key={`hide-${row.id}`}
              label={words.hide}
              plain
              dimColor
              onPress={() =>
                void update($, hidden, (list) => [...list, row.id])
              }
            />
          </Box>
        </Box>
      </Box>
    ));

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Text bold color={BLUE}>
              {words.band(rows.length)}
            </Text>
            {openSheets > 0 && (
              <Text color={AMBER}>{words.unanswered(openSheets)}</Text>
            )}
            {rows.length > BAND_MAX && (
              <Text dimColor>{words.more(rows.length - BAND_MAX)}</Text>
            )}
            <Button
              key="handout-watch-open"
              label={words.list}
              plain
              onPress={() => void openPane($)}
            />
          </Box>
          {cards}
        </Box>
        {theirs}
      </Box>
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const found = await read($, studio);
    const rows = await read($, handouts);
    const hiddenIds = await read($, hidden);
    const words = TEXT[await read($, locale)];
    const now = await read($, scannedAt);
    const isUp = await read($, isServerUp);
    const favicon = await read($, icon);
    const { Box, Text, Button, Link } = $.ui.resolve(e);
    const svgOf = (source: string, alt: string) => {
      if (e.surface !== "desktop") return null;
      const { Svg } = $.ui.resolve(e);
      return <Svg source={source} alt={alt} />;
    };
    const openSheets = rows.filter(isOpenSheet).length;

    const statusOf = (row: HandoutRow, isHidden: boolean): string | null => {
      if (row.kind === "sheet")
        return row.isAnswered
          ? words.answered
          : isHidden
            ? words.waitingHidden
            : words.waiting;
      return isHidden ? words.hidden : null;
    };

    const card = (row: HandoutRow) => {
      const isHidden = hiddenIds.includes(row.id);
      const isDone = isDoneSheet(row);
      return (
        <Box key={`pane-${row.id}`} flexDirection="column" marginTop={1}>
          <Box flexDirection="row" columnGap={1} alignItems="center">
            {svgOf(
              iconSvgOf(favicon, row),
              words.iconAlt(row.kind, row.count),
            ) ?? <Text color={BLUE}>▣</Text>}
            <Box flexDirection="column" flexShrink={1}>
              <Text bold dimColor={isDone}>
                {row.title}
              </Text>
              <Box flexDirection="row" columnGap={1} alignItems="center">
                {row.kind === "sheet" &&
                  svgOf(
                    dotsSvg(row.count, row.isAnswered),
                    words.count.sheet(row.count),
                  )}
                <Text color={isDone ? GREEN : undefined} dimColor={!isDone}>
                  {[statusOf(row, isHidden), metaOf(row, now, words)]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </Box>
            </Box>
          </Box>
          {!isDone && row.description && (
            <Text dimColor>{row.description}</Text>
          )}
          {isOpenSheet(row) && row.questionTitles.length > 0 && (
            <Text dimColor>
              {row.questionTitles
                .slice(0, 4)
                .map((title) => `・${title}`)
                .join("\n")}
            </Text>
          )}
          <Box flexDirection="row" columnGap={2}>
            {!isDone && isUp === false ? (
              <Button
                key={`pane-start-${row.id}`}
                label={words.start}
                plain
                onPress={() => void startStudio($)}
              />
            ) : (
              linksOf(row, words).map((link) => (
                <Text key={`pane-${link.key}-${row.id}`}>
                  <Link href={link.href} label={link.label} />
                </Text>
              ))
            )}
            {!isDone && isHidden && (
              <Button
                key={`pane-unhide-${row.id}`}
                label={words.unhide}
                plain
                dimColor
                onPress={() =>
                  void update($, hidden, (list) =>
                    list.filter((id) => id !== row.id),
                  )
                }
              />
            )}
            {!isDone && !isHidden && (
              <Button
                key={`pane-hide-${row.id}`}
                label={words.hide}
                plain
                dimColor
                onPress={() =>
                  void update($, hidden, (list) => [...list, row.id])
                }
              />
            )}
          </Box>
        </Box>
      );
    };

    return (
      <Box flexDirection="column">
        {!found && <Text color={AMBER}>{words.notFound}</Text>}
        {rows.length > 0 && isUp === false && (
          <Text color={AMBER}>{words.serverDown}</Text>
        )}
        <Text bold>{words.paneHeader(rows.length, openSheets)}</Text>
        {rows.length === 0 && <Text dimColor>{words.empty}</Text>}
        {rows.map(card)}
        <Text color={GRAY} dimColor>
          {words.footer}
        </Text>
      </Box>
    );
  });
};
