---
description: AI Handout Studio をこの環境に入れる(SETUP のゲームブックを doctor に沿って進める)
---

Set up AI Handout Studio in this environment by following the setup game book. Speak the user's language throughout.

1. In the repository root, run `node scripts/doctor.mjs --json`.
2. If `ok` is `true`, tell the user the setup is complete and stop.
3. Otherwise, read the section numbered `next.section` in `SETUP.md` (in `SETUP.ja.md` if the user speaks Japanese) and do what it says. `next.reason` says what is missing.
4. At the end of the section, run doctor again and go back to step 2.

Keep the promises in section 1 of SETUP.md: ask only about the choices, get the user's consent before editing their agent instructions or shell configuration, and never use `sudo`. SETUP.md is the only source of what each section does, so read it instead of guessing.
