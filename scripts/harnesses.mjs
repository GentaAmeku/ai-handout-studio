// エージェントのハーネス(Claude Code・Codex CLI など)の表。
// doctor(依存なしの Node)と、サーバー(TypeScript)の両方が読むので、Node の標準だけで書く。
// 読み場所は 2026-10-04 に各社の公式資料と --help で確かめた。推測で行を足さない
import { join } from "node:path";

// 空の環境変数は無いものとして扱う
const envDir = (env, name) => {
  const value = env?.[name];
  return typeof value === "string" && value !== "" ? value : undefined;
};

// スキルの置き場。すべてのハーネスが、この2か所のどちらかを読む
export const skillPlacesOf = (home) => [
  { id: "agents", dir: join(home, ".agents", "skills") },
  { id: "claude", dir: join(home, ".claude", "skills") },
];

const placeDir = (home, id) =>
  skillPlacesOf(home).find((place) => place.id === id).dir;

// 1行の項目:
// - configDir: 入っている印にする設定のフォルダ
// - setupEntries: セットアップ自身が configDir に置くもの。これだけのフォルダは入っている印にしない
//   (Grok CLI の人が ~/.claude/skills を張ると ~/.claude ができるため)
// - skillPlace・skillsDir: 利用者のスキルを読む置き場
// - instructions: 共通指示のファイル(ファイルで置けなければ null)
// - fallbackInstructions: instructions が無いときに代わりに読むファイル(OpenCode だけ)
// - bin: PATH の名前
// - headless(依頼): 非対話で動かす argv
// - interactive(引用済みの依頼): 利用者がコピーして打つコマンド(cd は含めない)
export const harnessesOf = ({ home, env = {} }) => {
  const codexHome = envDir(env, "CODEX_HOME") ?? join(home, ".codex");
  const opencodeDir = join(
    envDir(env, "XDG_CONFIG_HOME") ?? join(home, ".config"),
    "opencode",
  );
  const claudeInstructions = join(home, ".claude", "CLAUDE.md");
  const row = (fields) => ({
    setupEntries: [],
    fallbackInstructions: null,
    skillsDir: placeDir(home, fields.skillPlace),
    interactive: (quoted) => `${fields.bin} ${quoted}`,
    ...fields,
  });
  return [
    row({
      id: "claude",
      name: "Claude Code",
      configDir: join(home, ".claude"),
      setupEntries: ["skills"],
      skillPlace: "claude",
      instructions: claudeInstructions,
      bin: "claude",
      headless: (prompt) => [
        "claude",
        "-p",
        prompt,
        "--allowedTools",
        "Read Write Edit Bash(pnpm deck:check *)",
      ],
    }),
    row({
      id: "codex",
      name: "Codex CLI",
      configDir: codexHome,
      skillPlace: "agents",
      instructions: join(codexHome, "AGENTS.md"),
      bin: "codex",
      headless: (prompt) => ["codex", "exec", "-s", "workspace-write", prompt],
    }),
    row({
      id: "opencode",
      name: "OpenCode",
      configDir: opencodeDir,
      skillPlace: "agents",
      instructions: join(opencodeDir, "AGENTS.md"),
      // 自分の AGENTS.md が無ければ ~/.claude/CLAUDE.md を読む
      fallbackInstructions: claudeInstructions,
      bin: "opencode",
      headless: (prompt) => ["opencode", "run", prompt],
      // 位置引数はフォルダになるので、依頼は --prompt で渡す
      interactive: (quoted) => `opencode --prompt ${quoted}`,
    }),
    row({
      id: "gemini",
      name: "Gemini CLI",
      configDir: join(home, ".gemini"),
      skillPlace: "agents",
      instructions: join(home, ".gemini", "GEMINI.md"),
      bin: "gemini",
      headless: (prompt) => [
        "gemini",
        "-p",
        prompt,
        "--approval-mode",
        "auto_edit",
      ],
    }),
    row({
      id: "cursor",
      name: "Cursor CLI",
      configDir: join(home, ".cursor"),
      skillPlace: "agents",
      // ファイルは無い。設定画面の User Rules に貼る
      instructions: null,
      bin: "cursor-agent",
      // 何でも許す --force は付けない
      headless: (prompt) => ["cursor-agent", "-p", prompt],
    }),
    row({
      id: "grok",
      name: "Grok CLI",
      configDir: join(home, ".grok"),
      skillPlace: "claude",
      instructions: join(home, ".grok", "AGENTS.md"),
      bin: "grok",
      headless: (prompt) => ["grok", "-p", prompt],
    }),
  ];
};
