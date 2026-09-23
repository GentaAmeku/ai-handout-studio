# AI Handout Studio

A tool that turns AI-authored JSON into a finished handout: a 1280x720 slide deck (`deck.json`) or an HTML document (`document.json`), edited on screen and exported to PDF, PNG, HTML or PPTX.

## Commands

Scripts are defined in `package.json`. Before finishing a change, run:

```
pnpm typecheck && pnpm test && pnpm test:skills && pnpm lint && pnpm build && pnpm test:export
```

Run `pnpm exec playwright install chromium` once before the export tests.

## Where to make a change

- The API under `app/server/` is loaded when Vite reads its config; restart the dev server after editing it.
- Question-sheet markup is built in `app/server/sheet-render.ts` (it draws both the built-in sample and a saved sheet). Sample content lives in `sheet-sample.ts`. Only a saved sheet also ships a client script, `sheet-client.ts`, that moves between questions — editing it changes the CSP hash automatically.
- Handout (document) markup is built in `app/server/document-render.ts` (sample, on-screen preview and export all go through it). Sample content lives in `document-sample.ts`.
- The schema's source of truth is `app/src/schema/`; types are derived from Zod, not written by hand. After changing it, run `pnpm schema:export` to regenerate `skills/ai-handout-studio/*.schema.json`.
- There are two skills: `skills/ai-handout-studio` (handout authoring) and `skills/question-sheet` (question sheets). The question-sheet skill has no copy of the design system — it reads this repository's `design/dist` directly (`skills/question-sheet/scripts/design.mjs`).
- After changing anything under `design/` (JSON, CSS, `figure/`) or a sample generator (`app/server/design-samples.ts`, `sheet-sample.ts`, `sheet-render.ts`), run `pnpm design:build` (or `ai-handout-studio design build`) to rebuild `design/dist/` and `design/samples/`. Tests fail against a stale build.

## Style

- Write functionally: `const`, early returns, `map`. Avoid `let`, `switch`, `class`.
- Color, spacing, font size and corner radius live only in `design/tokens.json` and a theme (`design/themes/`). CSS under `design/` is a build output of `pnpm design:build` — don't hand-edit it, and don't write a hex color into a block component or `design/slide.css`.

## Slide template names

A slide template's identifier is a single lowercase English proper noun (e.g. `lumen`, `prism`) drawn from light, material or tool imagery — never a descriptive or purpose-based name. Its display name capitalizes the first letter. The one exception is the built-in default template (`default`), whose display name is "AI Handout Studio Design".

## Don't leak product names

Don't put the name of an existing commercial product into code, UI strings, identifiers or template descriptions.
