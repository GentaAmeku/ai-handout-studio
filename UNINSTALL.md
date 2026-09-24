# Uninstall

This file is written for a coding agent (Claude Code or Codex CLI). To uninstall, start in the folder of the cloned repository, in one of these ways:

- **Claude Code:** start Claude Code in that folder and type `/studio-uninstall`.
- **Codex CLI:** open that folder and ask: **"Uninstall this by following UNINSTALL.md."**
- **If the clone is already gone:** clone it again, then start in one of the ways above.

Like [SETUP.md](SETUP.md), it is a game book. `doctor --uninstall` checks what is left and tells you which section to read next. The section numbers are the same in [UNINSTALL.ja.md](UNINSTALL.ja.md) (Japanese).

## 1. Introduction (for the agent)

### Ask once, before you start

1. In the repository root, run `node scripts/doctor.mjs --uninstall --json` (it uses only Node's standard library; use it instead of `ai-handout-studio doctor`, which stops working once section 5 removes the command).
2. Show the user the items whose `status` is `remaining` as the list of what will be removed. Add that section 6 also removes Playwright's Chromium (anything another project uses stays), and what will not be removed (see the promises below).
3. Ask these together, once:
   - May you remove everything on the list? Say that only the ai-handout-studio block is deleted from the agent instructions, and no other line changes.
   - If `archify` is `warn` (installed): should archify go too? It is another author's skill, and the user may have installed it for something else.
   - What should happen to the handouts and the clone? The `workspace` detail has the handouts' location and counts. Offer: "delete the clone, handouts included", "move the handouts to another folder, then delete the clone" (ask where), or "keep the clone (remove only what lives outside it)".

If the user says no to removing, stop without changing anything.

### Repeat

Repeat this loop until `ok` is `true`:

1. Run `node scripts/doctor.mjs --uninstall --json`.
2. Read the section named by `next.section`. `next.reason` says what is left. The exit code is 1 while something is left.
3. Do what that section says, then run doctor again.

Once `ok` is `true`, nothing is left outside the clone. Finish with section 6.

`checks` lists every item with `status`: `ok` (absent or removed), `remaining` (left; remove it), `skipped` (belongs to another clone or another app; leave it) or `warn` (worth mentioning, but it does not block).

Promises to the user:

- Speak the user's language. Ask only once before you start, plus the final check right before deleting the clone. Decide everything else yourself.
- Remove only what doctor reports as `remaining` and what section 6 lists. Leave anything `skipped` alone.
- Delete only the ai-handout-studio block from the agent instructions (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`).
- Never use `sudo`. When a step needs it, show the command and ask the user to run it.
- Do not remove the shared tools used during setup (git, Node, pnpm, mise, lsof, system libraries on Linux) or the `PATH` line added to the shell configuration: other tools use them too. If the user wants them gone, tell them where they are.

## 2. Server

doctor checks that this repository's server is not running on `127.0.0.1:5190` and that the server log (`ai-handout-studio-dev.log` in the system temp folder) is gone.

```bash
kill $(lsof -ti tcp:5190 -sTCP:LISTEN)
rm -f "$(node -p "require('os').tmpdir()")/ai-handout-studio-dev.log"
```

- Run `kill` only when `server` is `remaining`. doctor reports `remaining` only after confirming that the server on port 5190 belongs to this repository.
- Delete the log after the server has stopped. If another clone's server is running (`skipped`), leave the log: that server is writing to it.

## 3. Agent instructions

doctor checks that the agent instructions file of each agent (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`; the target when it is a symlink) has no ai-handout-studio block. The block is what setup section 8 added, from `<!-- ai-handout-studio:start … -->` to `<!-- ai-handout-studio:end -->`. The detail gives its line numbers.

1. Read the file and confirm the block is on the lines in the detail.
2. Delete the block, both marker lines included. Collapse the blank lines around it into one. Change no other line. If the file is a symlink, edit its target and keep the link.
3. If only whitespace is left, delete the file. If it is a symlink, keep both the link and its target.

If the detail says start and end do not pair up, show the user the lines around the markers and confirm what to delete before deleting it.

## 4. Skills

doctor checks that the skill folders (`~/.claude/skills/` for Claude Code, `~/.agents/skills/` for Codex CLI) have no `ai-handout-studio` or `question-sheet` link pointing to this repository. Broken links (left behind by a deleted clone) are removed too.

```bash
# remove only the links named in the detail
rm ~/.claude/skills/ai-handout-studio ~/.claude/skills/question-sheet
rm ~/.agents/skills/ai-handout-studio ~/.agents/skills/question-sheet
```

- Pass `rm` the link name as it is. Never add `-r` or a trailing `/`: that would delete what the link points to (this repository's `skills/`).
- Leave anything `skipped` (a folder with contents, a link to another clone). Leave the skill folders themselves.

## 5. Command

doctor checks that neither `PATH` nor `~/.local/bin` has an `ai-handout-studio` pointing to this repository. The detail says where it was found and how it was installed.

- **`(symlink)`** (the recommended way in setup section 5): `rm ~/.local/bin/ai-handout-studio`. If the detail names another location, remove that one.
- **`(pnpm global entry)`**: `pnpm remove --global ai-handout-studio`

Keep the `~/.local/bin` folder and the `PATH` line in the shell configuration.

## 6. Finish

Do this once doctor reports `ok: true`. It uses `node_modules` inside the clone, so follow this order.

1. **Chromium:** run `pnpm exec playwright uninstall`. It unregisters the browsers this repository installed and deletes only those no other project uses. Do not add `--all` (it deletes other projects' browsers too). Remove it even when the clone stays (setup section 4 installs it again if needed). If `node_modules` is missing (a fresh clone without `pnpm install`), skip this and tell the user where the browsers live (`~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux). Other projects use them too, so the user decides whether to delete them.
2. **archify:** only if the user said to remove it, run `npx skills remove archify archify-review -g -y` (installing archify also installs archify-review).
3. **warn:** tell the user about any other `warn` item (such as a server whose repository could not be determined).
4. **Handouts and clone:** follow the answer from before you started.
   - **Delete the clone:** show the user the path to delete (the clone's absolute path) and confirm, then move outside the clone (to its parent folder) and run `rm -rf <absolute path of the clone>`.
   - **Move the handouts, then delete:** `mv` the folder at the `workspace` detail's location to the destination the user gave. Confirm it arrived, then delete the clone as above.
   - **Keep the clone:** stop here.
   - If the `workspace` detail's location is outside the clone (set with `AI_HANDOUT_STUDIO_WORKSPACE`), deleting the clone does not delete the handouts. Say so, and let the user decide whether to delete them too.
5. Summarize what was removed and what was kept (`skipped` items, what the user chose to keep, the shared tools). If you deleted the clone, add that the agent session running inside it can be closed, since its working folder is gone.
