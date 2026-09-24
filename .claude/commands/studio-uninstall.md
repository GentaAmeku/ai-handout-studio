---
description: AI Handout Studio をこの環境から外す(UNINSTALL のゲームブックを doctor --uninstall に沿って進める)
---

Uninstall AI Handout Studio from this environment by following the uninstall game book. Speak the user's language throughout.

1. Read section 1 of `UNINSTALL.md` (`UNINSTALL.ja.md` if the user speaks Japanese). Run `node scripts/doctor.mjs --uninstall --json` in the repository root, show the user what will be removed, and ask the questions there once.
2. Run `node scripts/doctor.mjs --uninstall --json`.
3. If `ok` is `true`, do section 6 and stop.
4. Otherwise, read the section numbered `next.section` and do what it says. `next.reason` says what is left.
5. Go back to step 2.

Keep the promises in section 1 of UNINSTALL.md: ask only once before you start (plus the final check before deleting the clone), remove only what doctor reports as `remaining` and what section 6 lists, delete only the ai-handout-studio block from the agent instructions, and never use `sudo`. UNINSTALL.md is the only source of what each section does, so read it instead of guessing.
