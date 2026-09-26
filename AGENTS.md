# AI Handout Studio

A tool that turns AI-authored JSON into a finished handout: a 1280x720 slide deck (`deck.json`) or an HTML document (`document.json`), edited on screen and exported to PDF, PNG, HTML or PPTX.

## Commands

Scripts are defined in `package.json`. Before finishing a change, run:

```
pnpm typecheck && pnpm test && pnpm test:skills && pnpm lint && pnpm build && pnpm test:export
```

Run `pnpm exec playwright install chromium` once before the export tests.

In a Claude cloud session, the SessionStart hook (`scripts/cloud-session.sh`) puts Node 24 from `/opt/node24` on `PATH`, installs dependencies and Chromium; it does nothing locally. The cloud environment's setup script must install Node 24.15.0 to `/opt/node24` and pnpm 11.9.0, and its network access must also allow `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.

## Where to make a change

- The API under `app/server/` is loaded when Vite reads its config; restart the dev server after editing it.
- Question-sheet markup is built in `app/server/sheet-render.ts` (it draws both the built-in sample and a saved sheet). Sample content lives in `sheet-sample.ts`, its English text in `sheet-sample.en.ts`. Only a saved sheet also ships a client script, `sheet-client.ts`, that moves between questions — editing it changes the CSP hash automatically.
- Handout (document) markup is built in `app/server/document-render.ts` (sample, on-screen preview and export all go through it). Sample content lives in `document-sample.ts`, its English text in `document-sample.en.ts`. A slide template's English sample is `sample.en.json` next to its `sample.json`; `design/templates/README.md` has the rules.
- The schema's source of truth is `app/src/schema/`; types are derived from Zod, not written by hand. After changing it, run `pnpm schema:export` to regenerate `skills/ai-handout-studio/*.schema.json`.
- There are two skills: `skills/ai-handout-studio` (handout authoring) and `skills/question-sheet` (question sheets). The question-sheet skill has no copy of the design system — it reads this repository's `design/dist` directly (`skills/question-sheet/scripts/design.mjs`).
- Setup and uninstall are game books: `scripts/doctor.mjs` returns the next section of `SETUP.md`, or of `UNINSTALL.md` with `--uninstall`, so keep its section numbers in step with both languages. When setup starts putting something new outside the clone, add its removal to `UNINSTALL.md` and `doctor --uninstall` too.
- `scripts/dev-sync.mjs` keeps dependencies and `design/dist` in step with the checkout. `pnpm dev` and `ai-handout-studio open`/`restart` run it before starting the server, and the git hooks that `prepare` installs run it after `git pull`, restarting a running server when it rebuilt something. It compares a fingerprint of the inputs with the one saved in `node_modules/.cache/ai-handout-studio/`: `pnpm-lock.yaml` for dependencies; for `design/dist`, `design/` (minus `dist/` and `samples/`) and the code reachable by relative imports from `app/server/design-build.ts`. If design build starts reading a file outside those, add it to `DESIGN_ENTRIES`.
- After changing anything under `design/` (JSON, CSS, `figure/`) or a sample generator (`app/server/design-samples.ts`, `sheet-sample.ts`, `sheet-render.ts`), run `pnpm design:build` (or `ai-handout-studio design build`) to rebuild `design/dist/` and `design/samples/`. Tests fail against a stale build.

## Pull requests

Open a pull request by following `.claude/skills/pull-request/SKILL.md`: run the checks above, take before/after screenshots when the screen changes, and write the body in the three sections of `.github/pull_request_template.md`.

## Style

- Write functionally: `const`, early returns, `map`. Avoid `let`, `switch`, `class`.
- Color, spacing, font size and corner radius live only in `design/tokens.json` and a theme (`design/themes/`). CSS under `design/` is a build output of `pnpm design:build` — don't hand-edit it, and don't write a hex color into a block component or `design/slide.css`.

## Template names

This applies to every kind of template (slide, sheet and document). A template's identifier is a single lowercase English word (e.g. `lumen`, `prism`, `cobalt`). A new slide template takes a proper noun drawn from light, material or tool imagery — never a descriptive or purpose-based name. Its display name (`label`) is always English: the identifier with the first letter capitalized, including the built-in `default` ("Default"). The schema rejects a label that isn't English. When you rename or remove a template, add the old name to `TEMPLATE_RENAMES` in `app/server/template-renames.ts` so saved handouts move to the new one.

## Don't leak product names

Don't put the name of an existing commercial product into code, UI strings, identifiers or template descriptions.
