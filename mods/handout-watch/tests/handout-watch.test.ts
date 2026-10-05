import { expect, mock, test } from "claude-code/testing";

const BAND = {
  plugin: "handout-watch",
  component: "AbovePrompt",
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 14,
    bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 13 },
    view: {},
  },
} as const;

const PANE = {
  plugin: "handout-watch",
  component: "Pane",
  requestId: "handout-watch",
  viewport: { columns: 120, rows: 40 },
  props: {
    title: "この会話の資料",
    isFocused: true,
    bodyColumns: 60,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

// mod は <clone>/mods/handout-watch にあり、~/.claude/skills/handout-watch の symlink から読まれる
const STUDIO = "/home/me/src/ai-handout-studio";
const MOD = `${STUDIO}/mods/handout-watch`;
const SHEETS = `${STUDIO}/workspace/sheets`;
const DOCS = `${STUDIO}/workspace/documents`;
const DECKS = `${STUDIO}/workspace/decks`;
const NOW = Date.parse("2026-10-05T08:00:00.000Z");
const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>AI Handout Studio</title><rect width="32" height="32" rx="7" fill="#2563eb"/></svg>';

// この会話で作る質問票(sheet_20261005_002)・HTML 資料(doc_20261005_001)・スライド(deck_20261005_001)と、
// ほかの会話の質問票(sheet_20260901_001)・HTML 資料(doc_20260920_003)
const filesOf = (locale: string | null = "ja"): Record<string, string> => ({
  [`${STUDIO}/app/public/favicon.svg`]: FAVICON,
  ...(locale === null
    ? {}
    : { [`${STUDIO}/workspace/profile.json`]: JSON.stringify({ locale }) }),
  [`${SHEETS}/sheet_20261005_002/meta.json`]: JSON.stringify({
    title: "業務改善の学習資料を決める",
    createdAt: new Date(NOW - 2 * 60 * 60_000).toISOString(),
  }),
  [`${SHEETS}/sheet_20261005_002/questions.json`]: JSON.stringify({
    description: "6つの質問に答えてください。",
    questions: [
      { title: "スライドは何に使いますか" },
      { title: "読み手は誰ですか" },
    ],
  }),
  [`${SHEETS}/sheet_20260901_001/meta.json`]: JSON.stringify({
    title: "ほかの会話の質問票",
    createdAt: new Date(NOW - 30 * 86_400_000).toISOString(),
  }),
  [`${SHEETS}/sheet_20260901_001/questions.json`]: JSON.stringify({
    questions: [{ title: "q" }],
  }),
  [`${DOCS}/doc_20261005_001/meta.json`]: JSON.stringify({
    title: "業務改善の学び方",
    createdAt: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    updatedAt: new Date(NOW - 30 * 60_000).toISOString(),
  }),
  [`${DOCS}/doc_20261005_001/document.json`]: JSON.stringify({
    head: { title: "業務改善の学び方", lede: "受注から請求までを例に学ぶ。" },
    sections: [{}, {}, {}],
  }),
  [`${DECKS}/deck_20261005_001/deck.json`]: JSON.stringify({
    title: "mods の紹介",
    meta: {
      createdAt: new Date(NOW - 4 * 60 * 60_000).toISOString(),
      updatedAt: new Date(NOW - 10 * 60_000).toISOString(),
    },
    slides: [{}, {}],
  }),
  [`${DOCS}/doc_20260920_003/meta.json`]: JSON.stringify({
    title: "ほかの会話の HTML 資料",
    createdAt: new Date(NOW - 15 * 86_400_000).toISOString(),
  }),
});

type Options = {
  messages?: unknown[];
  isServerUp?: boolean;
  files?: Record<string, string>;
  realPath?: string | null;
  env?: Record<string, string>;
};

// biome-ignore lint/suspicious/noExplicitAny: スタブは要る項目だけを返すので、エンジンの型は当てない
const stubEngine = (on: any, options: Options = {}) => {
  const files = options.files ?? filesOf();
  const ran: string[][] = [];
  mock.clock(on, { now: NOW });
  mock.env(on, options.env ?? { HOME: "/home/me" });
  on("session.start", () => ({ cwd: "/work" }));
  on("command.register", () => ({ value: undefined }));
  on("session.messages", () => ({ value: options.messages ?? [] }));
  // symlink を辿った先。null なら clone の外に置かれた mod
  on("fs.stat", () => ({
    value: {
      kind: "directory",
      size: 0,
      mtimeMs: 0,
      isLink: true,
      ...(options.realPath === null
        ? {}
        : { realPath: options.realPath ?? MOD }),
    },
  }));
  on("fs.exists", (_: unknown, e: { path: string }) => ({
    value: e.path in files,
  }));
  on("fs.read", (_: unknown, e: { path: string }) =>
    e.path in files ? { value: files[e.path] } : { deny: "ENOENT" },
  );
  on("http.fetch", () =>
    options.isServerUp === false
      ? { deny: "connection refused" }
      : { value: { status: 200, ok: true, headers: {}, text: "" } },
  );
  on("process.run", (_: unknown, e: { argv: string[] }) => {
    ran.push(e.argv);
    return { value: { exitCode: 0, stdout: "", stderr: "" } };
  });
  // Bash はコマンドに応じた出力を返す。new は作った id を出す
  on("tool.call", (_: unknown, e: { command?: string }) => {
    const command = e.command ?? "";
    if (command.includes("sheet new"))
      return {
        result:
          "id: sheet_20261005_002\nurl: http://localhost:5190/sheets/sheet_20261005_002",
      };
    if (command.includes("document new"))
      return {
        result:
          "id: doc_20261005_001\nurl: http://localhost:5190/documents/doc_20261005_001",
      };
    return { result: "ok" };
  });
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.render", () => ({
    type: "Text",
    props: {},
    children: ["drawn by Claude Code"],
  }));
  return { files, ran };
};

// 投げっぱなしの見直しが終わるまで待つ
// biome-ignore lint/suspicious/noExplicitAny: コマンドの入力も要る項目だけを渡す
const settle = async ($: any) => {
  await $.command.run({ command: "handout-watch", args: "" });
};

const bashUse = (command: string, text: string) => ({
  role: "assistant",
  text: "",
  toolUses: [{ tool_use_id: command, tool: "Bash", input: { command }, text }],
});

test("会話の記録から、この会話で作った質問票だけを拾う", async ($, on) => {
  stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002\nreadUrl: http://localhost:5190/api/sheets/sheet_20261005_002/preview",
      ),
      // 中身を見ただけのコマンドは数えない
      bashUse(
        "ls ~/src/ai-handout-studio/workspace/sheets",
        "sheet_20260901_001\nsheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);

  for (const surface of ["desktop", "terminal"] as const) {
    const band = await $.ui.mount({ ...BAND, surface });
    expect(
      await band.find({ type: "Text", text: /未回答の質問票 1件/ }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: "業務改善の学習資料を決める" }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: /2問 · 2時間前/ }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: "ほかの会話の質問票" }),
    ).toBeUndefined();
    const link = await band.find({ type: "Link" });
    expect(link?.props.href).toBe(
      "http://localhost:5190/api/sheets/sheet_20261005_002/preview",
    );
    await band.unmount();
  }
});

test("studio のアイコンに質問の数を重ね、読めなければ「?」の印にする", async ($, on) => {
  const files = filesOf();
  delete files[`${STUDIO}/app/public/favicon.svg`];
  stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
    files,
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  const svg = await band.find({ type: "Svg" });
  expect(svg?.props.source).toMatch(/>\?</);
  expect(svg?.props.source).toMatch(/>2</);
});

test("アイコンが読めれば studio のアイコンを使う", async ($, on) => {
  stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  const svg = await band.find({ type: "Svg" });
  expect(svg?.props.source).toContain(
    '<rect width="32" height="32" rx="7" fill="#2563eb"/>',
  );
  expect(svg?.props.source).not.toContain("<title>");
  expect(svg?.props.source).toMatch(/>2</);
});

test("作った質問票をその場で拾い、回答を保存したら帯から消える", async ($, on) => {
  const { files } = stubEngine(on);
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const empty = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await empty.find({ type: "Text", text: /未回答の質問票/ }),
  ).toBeUndefined();
  await empty.unmount();

  await $.tool.call({
    tool: "Bash",
    command: "ai-handout-studio sheet new --questions q.json",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: /未回答の質問票 1件/ }),
  ).toBeDefined();
  await band.unmount();

  files[`${SHEETS}/sheet_20261005_002/answers.json`] = "{}";
  await $.tool.call({
    tool: "Bash",
    command:
      "ai-handout-studio sheet answers sheet_20261005_002 --answers a.json",
  });
  await settle($);
  const after = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await after.find({ type: "Text", text: /未回答の質問票/ }),
  ).toBeUndefined();
  await after.unmount();

  const pane = await $.ui.mount({ ...PANE, surface: "desktop" });
  expect(await pane.find({ type: "Text", text: /✓ 回答済み/ })).toBeDefined();
});

test("隠すと帯から消え、パネルから戻せる", async ($, on) => {
  stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  await band.press({ key: "hide-sheet_20261005_002" });
  await band.unmount();
  const again = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await again.find({ type: "Text", text: /未回答の質問票/ }),
  ).toBeUndefined();
  await again.unmount();

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await pane.find({ type: "Text", text: /隠し中/ })).toBeDefined();
  await pane.press({ key: "pane-unhide-sheet_20261005_002" });
  await pane.unmount();
  const back = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await back.find({ type: "Text", text: /未回答の質問票 1件/ }),
  ).toBeDefined();
});

test("studio が止まっていれば、clone の cli.mjs で起動するボタンを出す", async ($, on) => {
  const { ran } = stubEngine(on, {
    isServerUp: false,
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(await band.find({ type: "Link" })).toBeUndefined();
  await band.press({ key: "start-sheet_20261005_002" });
  expect(ran[0]).toEqual([`${STUDIO}/scripts/cli.mjs`, "open"]);
});

test("HTML 資料とスライドも、この会話で作ったものだけを出す", async ($, on) => {
  stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio document new --json d.json --title 業務改善の学び方",
        "id: doc_20261005_001\nreadUrl: http://localhost:5190/api/documents/doc_20261005_001/preview",
      ),
      bashUse(
        "ai-handout-studio new --title mods の紹介",
        "id: deck_20261005_001\npath: /x/deck.json",
      ),
      // 開いただけ・書き出しただけの資料は数えない
      bashUse(
        "ai-handout-studio open doc_20260920_003",
        "url: http://localhost:5190/documents/doc_20260920_003",
      ),
      bashUse(
        "ai-handout-studio document export doc_20260920_003 --out a.html",
        "ok",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);

  for (const surface of ["desktop", "terminal"] as const) {
    const band = await $.ui.mount({ ...BAND, surface });
    expect(
      await band.find({ type: "Text", text: /この会話の資料 2件/ }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: /未回答の質問票/ }),
    ).toBeUndefined();
    expect(
      await band.find({ type: "Text", text: "ほかの会話の HTML 資料" }),
    ).toBeUndefined();
    expect(
      await band.find({ type: "Text", text: /HTML 資料 · 3章 · 30分前に更新/ }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: /スライド · 2枚 · 10分前に更新/ }),
    ).toBeDefined();
    expect(
      await band.find({ type: "Text", text: "受注から請求までを例に学ぶ。" }),
    ).toBeDefined();
    // 直した新しい順。スライド(10分前)が HTML 資料(30分前)より先
    const links = await band.findAll({ type: "Link" });
    expect(links.map((link) => [link.props.label, link.props.href])).toEqual([
      ["開く", "http://localhost:5190/decks/deck_20261005_001"],
      ["読む", "http://localhost:5190/api/documents/doc_20261005_001/preview"],
      ["編集", "http://localhost:5190/documents/doc_20261005_001"],
    ]);
    await band.unmount();
  }
});

test("正本を書き換えたら拾い、未回答の質問票を先に並べる", async ($, on) => {
  stubEngine(on);
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);

  // 作業用の場所の document.json は studio の資料ではない
  await $.tool.call({
    tool: "Write",
    file_path: "/tmp/scratch/document.json",
    content: "{}",
  });
  await settle($);
  const empty = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await empty.find({ type: "Text", text: /この会話の資料/ }),
  ).toBeUndefined();
  await empty.unmount();

  await $.tool.call({
    tool: "Edit",
    file_path: `${DECKS}/deck_20261005_001/deck.json`,
    old_string: "a",
    new_string: "b",
  });
  await $.tool.call({
    tool: "Bash",
    command: "ai-handout-studio sheet new --questions q.json",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: /この会話の資料 2件/ }),
  ).toBeDefined();
  expect(
    await band.find({ type: "Text", text: /未回答の質問票 1件/ }),
  ).toBeDefined();
  const links = await band.findAll({ type: "Link" });
  expect(links.map((link) => link.props.label)).toEqual(["回答する", "開く"]);
  // スライドの印には数を重ねない。質問票だけに質問の数を重ねる
  const icons = await band.findAll({ type: "Svg" });
  expect(icons[0]?.props.source).toMatch(/>2</);
  expect(icons[1]?.props.source).not.toMatch(/<circle/);
  await band.unmount();

  const pane = await $.ui.mount({ ...PANE, surface: "desktop" });
  expect(
    await pane.find({
      type: "Text",
      text: /この会話の資料 2件\(未回答の質問票 1件\)/,
    }),
  ).toBeDefined();
});

test("答え終わった質問票は帯から外れ、ほかの資料は残る", async ($, on) => {
  const { files } = stubEngine(on, {
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
      bashUse(
        "ai-handout-studio document update doc_20261005_001 --json d.json",
        "ok",
      ),
    ],
  });
  files[`${SHEETS}/sheet_20261005_002/answers.json`] = "{}";
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: /この会話の資料 1件/ }),
  ).toBeDefined();
  expect(
    await band.find({ type: "Text", text: "業務改善の学び方" }),
  ).toBeDefined();
  expect(
    await band.find({ type: "Text", text: "業務改善の学習資料を決める" }),
  ).toBeUndefined();
  await band.unmount();

  const pane = await $.ui.mount({ ...PANE, surface: "desktop" });
  expect(
    await pane.find({ type: "Text", text: /この会話の資料 2件$/ }),
  ).toBeDefined();
  expect(await pane.find({ type: "Text", text: /✓ 回答済み/ })).toBeDefined();
});

test("studio の言語の設定が無く LANG も日本語でなければ、英語で出す", async ($, on) => {
  stubEngine(on, {
    files: filesOf(null),
    env: { HOME: "/home/me", LANG: "en_US.UTF-8" },
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
      bashUse(
        "ai-handout-studio document new --json d.json",
        "id: doc_20261005_001",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: "Handouts in this conversation: 2" }),
  ).toBeDefined();
  expect(
    await band.find({ type: "Text", text: "Unanswered question sheets: 1" }),
  ).toBeDefined();
  expect(
    await band.find({
      type: "Text",
      text: /Question sheet · 2 questions · 2 h ago/,
    }),
  ).toBeDefined();
  expect(
    await band.find({
      type: "Text",
      text: /HTML handout · 3 sections · updated 30 min ago/,
    }),
  ).toBeDefined();
  const links = await band.findAll({ type: "Link" });
  expect(links.map((link) => link.props.label)).toEqual([
    "Answer",
    "Read",
    "Edit",
  ]);
});

test("資料の置き場は AI_HANDOUT_STUDIO_WORKSPACE があればそこを読む", async ($, on) => {
  const moved = Object.fromEntries(
    Object.entries(filesOf()).map(([path, text]) => [
      path.replace(`${STUDIO}/workspace`, "/data/handouts"),
      text,
    ]),
  );
  stubEngine(on, {
    files: moved,
    env: { HOME: "/home/me", AI_HANDOUT_STUDIO_WORKSPACE: "/data/handouts" },
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: /未回答の質問票 1件/ }),
  ).toBeDefined();
});

test("clone の外に置かれた mod は帯を出さず、パネルで入れ方を伝える", async ($, on) => {
  stubEngine(on, {
    realPath: null,
    messages: [
      bashUse(
        "ai-handout-studio sheet new --questions q.json",
        "id: sheet_20261005_002",
      ),
    ],
  });
  await $.session.start({
    surface: "desktop",
    isInteractive: true,
    cwd: "/work",
  });
  await settle($);
  const band = await $.ui.mount({ ...BAND, surface: "desktop" });
  expect(
    await band.find({ type: "Text", text: /資料|Handouts/ }),
  ).toBeUndefined();
  await band.unmount();
  const pane = await $.ui.mount({ ...PANE, surface: "desktop" });
  expect(
    await pane.find({ type: "Text", text: /mods\/handout-watch/ }),
  ).toBeDefined();
});
