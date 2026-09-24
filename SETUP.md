# Setup

This file is written for a coding agent (Claude Code or Codex CLI). To install, start in one of these ways:

- **Claude Code:** clone the repository, start Claude Code in it, and type `/studio-setup`.
- **Codex CLI:** clone the repository, open it, and ask: **"Set this up by following SETUP.md."**
- **Before cloning:** ask your agent: "Clone https://github.com/GentaAmeku/ai-handout-studio and set it up by following SETUP.md."

The setup is a game book. `doctor` checks the state and tells you which section to read next. The section numbers are the same in [SETUP.ja.md](SETUP.ja.md) (Japanese).

## 1. Introduction (for the agent)

Repeat this loop until `ok` is `true`:

1. In the repository root, run `node scripts/doctor.mjs --json` (it uses only Node's standard library, so it works before `pnpm install`; once section 5 is done, `ai-handout-studio doctor --json` is the same).
2. Read the section named by `next.section`. `next.reason` says what is missing. The exit code is 1 until the setup is complete.
3. Do what that section says, then run doctor again.

`checks` lists every item with `status`: `ok`, `missing`, `outdated`, `skipped` (an agent that is not set up, or instructions the user declined) or `warn` (worth mentioning, but it does not block).

Promises to the user:

- Speak the user's language. Ask only about the choices: language, organization name, adding a block to the agent instructions, and the optional features. Decide everything else yourself.
- Ask for consent before you edit the user's agent instructions (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) or shell configuration (`~/.zshrc`, `~/.bashrc`, …).
- Never use `sudo`. When a step needs it, show the command and ask the user to run it.
- Do not change anything a section does not mention. Do not install tools from other sources than the ones named here.
- Until section 6 installs the skills, ask in the conversation. From section 9 on, ask with a question sheet.

## 2. Prerequisites

doctor checks `git`, Node 24 or later, pnpm 11 and the OS (macOS or Linux; on Windows, use WSL and run everything inside it).

- **mise (recommended):** `mise.toml` pins Node and pnpm. If `mise` is installed, run `mise install` in the repository root. If it is not, ask the user to install it (see mise's own documentation) and to activate it in their shell.
- **Without mise:** install Node 24 or later, then enable pnpm with corepack: `corepack enable` and `corepack install --global pnpm@11`. If `corepack enable` fails for permissions, ask the user to run it.
- **git:** on macOS, ask the user to run `xcode-select --install`. On Linux, ask the user to install it with the package manager (`sudo apt install git`, …).
- **Windows:** stop and tell the user to install WSL, clone the repository inside WSL, and start the agent there.

## 3. Dependencies and generated styles

doctor checks `node_modules` and `design/dist`.

```bash
pnpm install
```

`pnpm install` runs `prepare`, which builds `design/dist` (the CSS and samples). If `design/dist` is still missing, run `pnpm design:build`.

## 4. Browser

doctor checks Playwright's Chromium (used for PDF/PNG export and screenshots) and `lsof` (used to see which process listens on the port).

```bash
pnpm exec playwright install chromium
```

- On Linux, if Chromium fails to start because of missing system libraries, ask the user to run `sudo pnpm exec playwright install-deps chromium`.
- If `lsof` is missing (minimal Linux), ask the user to install it (`sudo apt install lsof`, …). macOS has it.

## 5. Command

doctor checks that `ai-handout-studio` is on `PATH` and points to this repository.

Recommended: a symlink in `~/.local/bin`.

```bash
mkdir -p ~/.local/bin
ln -sfn "$PWD/scripts/cli.mjs" ~/.local/bin/ai-handout-studio
```

If `~/.local/bin` is not on `PATH`, ask for consent and add `export PATH="$HOME/.local/bin:$PATH"` to the user's shell configuration. The change applies to new shells; run doctor with the new `PATH` (`PATH="$HOME/.local/bin:$PATH" node scripts/doctor.mjs --json`).

Alternative: `pnpm link --global` (needs pnpm's global bin directory; `pnpm setup` edits the shell configuration, so ask first).

If doctor says `outdated`, the command points to another clone. Replace the link with the command above.

## 6. Skills

doctor checks, for each agent whose configuration folder exists (`~/.claude` for Claude Code, `~/.codex` for Codex CLI), that both skills are linked and point to this repository.

| Agent | Skills folder |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex CLI | `~/.agents/skills/` |

```bash
# Claude Code
mkdir -p ~/.claude/skills
ln -sfn "$PWD/skills/ai-handout-studio" ~/.claude/skills/ai-handout-studio
ln -sfn "$PWD/skills/question-sheet" ~/.claude/skills/question-sheet

# Codex CLI
mkdir -p ~/.agents/skills
ln -sfn "$PWD/skills/ai-handout-studio" ~/.agents/skills/ai-handout-studio
ln -sfn "$PWD/skills/question-sheet" ~/.agents/skills/question-sheet
```

- Use symlinks, not copies. The question-sheet scripts find the repository's `design/dist` through the link.
- `outdated` means the link points elsewhere (another clone, or the old `<repository>/skills`). Replace it with `ln -sfn`. If the path is a real folder rather than a link, do not delete it; ask the user.
- The current session may not list new skills until it is restarted. Until then, read `skills/question-sheet/SKILL.md` directly when a section needs it.

## 7. Language and organization name

doctor checks that `locale` and `orgName` are set in `workspace/profile.json`.

Ask both in one message: the language for handouts (`ja` or `en`) and the organization name shown on slide covers and closings, HTML handouts and question sheets (it may be empty).

```bash
ai-handout-studio settings --set locale=en --set orgName="Example Inc."
```

## 8. Agent instructions

doctor checks that the instruction file of each agent (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`; for a symlink, the real file) contains the ai-handout-studio block and that its version is current.

The block tells the agent to make slides and HTML handouts with the ai-handout-studio skill and to ask questions with question sheets, so the user gets the same behavior in any folder. Without it, the user has to name the skill.

1. Show the user the block in `setup/agent-instructions.<locale>.md` and ask whether to add it.
2. **Yes:** append the whole file, markers included, to the end of each instruction file (create the file if it does not exist; if it is a symlink, edit the real file and keep the link). If doctor says `outdated`, replace everything from `<!-- ai-handout-studio:start … -->` to `<!-- ai-handout-studio:end -->` with the new block.
3. **No:** record the answer, and doctor will skip this section from then on.

```bash
ai-handout-studio settings --set agentInstructions=declined
```

To be asked again later: `ai-handout-studio settings --set agentInstructions=ask`.

## 9. Optional features

doctor checks that `features.lan`, `features.imageGeneration` and `features.share` are decided (`true` or `false`). It also checks whether archify (a skill by another author) is installed (`ok` if it is, `warn` if not; it does not block).

Ask the three at once with a question sheet. If archify is missing, ask in the same sheet whether to install it (question-sheet skill: write the questions JSON, save it with `ai-handout-studio sheet new`, and give the user the `readUrl`; record the pasted answers with `ai-handout-studio sheet answers`). Write the risks into each question:

| Feature | What it does | Risk to tell the user |
| --- | --- | --- |
| `lan` | Read handouts from a phone on the same Wi-Fi (`open` starts the server on all interfaces and prints `lanReadUrl`). | Anyone on the same network can read the handouts (writes and agent runs stay limited to this computer). Do not use it on shared Wi-Fi. A firewall may block it. |
| `imageGeneration` | Make illustrations and mockups with an image-generation CLI: Codex CLI (`codex exec`) or Antigravity CLI (`agy`). | Uses those services' quota. Antigravity CLI is started with `--dangerously-skip-permissions`, which lets it run commands and write files without asking; it is pointed at the output folder but it is not a sandbox. Codex runs with `-s workspace-write` in the output folder. |
| `share` | Publish question sheets and HTML handouts as Claude Artifacts (`ai-handout-studio share`). Needs Claude Code. | Artifacts start private. If the user makes one public, anyone with the link can read it, including names in the handout. |

For image generation, check which of `codex` and `agy` are installed and mention it in the question (doctor warns when neither is on `PATH`).

```bash
ai-handout-studio settings --set features.lan=false --set features.imageGeneration=true --set features.share=false
```

With archify ([tt-a1i/archify](https://github.com/tt-a1i/archify), MIT), the agent can draw architecture, sequence, data-flow and lifecycle diagrams and put them into slides, HTML documents and question sheets as images (`ai-handout-studio diagram`). Handouts work without it; diagrams fall back to tables, text and the bundled flow figures. In the question, say what it adds and that it is a skill by another author that this repository does not bundle. Install it only if the user says yes; if they decline, leave it (doctor keeps a warn, but it does not block).

```bash
npx skills add tt-a1i/archify -g
```

## 10. Start and check

doctor checks that the server answers on `127.0.0.1:5190`, that it belongs to this repository, and that the bundled handouts (the usage slides and the setup HTML handout) are installed. They are installed automatically the first time the server starts if there are no slides and no HTML handouts yet (question sheets do not count). If the server belongs to another repository, restart it with `ai-handout-studio restart`. If the bundled handouts are missing (`examples` is `warn`), ask the user whether to add them and, if so, run `ai-handout-studio examples`.

```bash
ai-handout-studio open
```

Give the user the `url` (and `lanUrl` when it is printed). Then suggest trying it: "Make a handout about …" in any folder. The agent will ask what it needs with a question sheet, make the handout, check it and reply with its URL.

## Appendix A. Update

```bash
git pull
pnpm install
node scripts/doctor.mjs --json
```

Then follow doctor as in section 1. If the agent-instructions block is `outdated`, section 8 replaces it (with consent). After server code changes, `ai-handout-studio restart` restarts the server.

## Appendix B. Uninstall

Uninstalling is a game book too. In Claude Code, type `/studio-uninstall`; in Codex CLI, ask: "Uninstall this by following UNINSTALL.md." `node scripts/doctor.mjs --uninstall --json` checks what is left and names the next section to read. The steps are in [UNINSTALL.md](UNINSTALL.md) ([UNINSTALL.ja.md](UNINSTALL.ja.md) in Japanese).

## Appendix C. Troubleshooting

- **Port 5190 is in use:** `lsof -nP -iTCP:5190 -sTCP:LISTEN` shows the process. If it is not ai-handout-studio, ask the user whether to stop it. The server log is `ai-handout-studio-dev.log` in the system temp folder (`node -p "require('os').tmpdir()"`).
- **Chromium does not start (Linux):** ask the user to run `sudo pnpm exec playwright install-deps chromium`.
- **The phone cannot open `lanReadUrl`:** the phone must be on the same Wi-Fi (guest networks often isolate devices). The server must have been started for LAN (`ai-handout-studio restart --lan`, or `features.lan=true`). Check the firewall: on macOS, allow incoming connections for `node` (System Settings > Network > Firewall); on Linux with ufw, ask the user to run `sudo ufw allow 5190/tcp`.
