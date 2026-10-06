# Taking the README images

The images under `docs/images/en/` and `docs/images/ja/` are shot from a clean workspace with Playwright, so they can be retaken whenever the screen changes. Shoot the English set first, then the Japanese one; only the UI language and the sample handouts differ.

## 1. Prepare

```sh
pnpm install
pnpm exec playwright install chromium   # once
pnpm design:build                       # design/samples/*.html read ../dist
```

The owner's `workspace/` holds private handouts, so every CLI call below points `AI_HANDOUT_STUDIO_WORKSPACE` at a separate workspace. The port stays 5190, so `restart` replaces the running server; run `ai-handout-studio restart` without the variable when you are done to get your own workspace back.

```sh
export AI_HANDOUT_STUDIO_WORKSPACE=~/Documents/ai-handout-studio-shots/en
ai-handout-studio settings --set locale=en --set orgName="AI Handout Studio"
ai-handout-studio restart
```

A fresh workspace installs the bundled examples on the first start. For Japanese, use `~/Documents/ai-handout-studio-shots/ja` with `locale=ja`.

## 2. Sample handouts

Fill the list with neutral, fictional content so no client material appears. The workspace keeps them, so this is only needed once per language.

- One real deck for the editor shots. The 2026-09-26 sample is `Using AI agents in everyday work` (en: `deck_20260926_002`, ja: `AI エージェントを日々の仕事で使うには`, `deck_20260926_003`), 10 slides, template `cobalt`, tag `Study session` / `勉強会`.
- Seven more decks for the list, one per template, made from the bundled outlines:

  ```sh
  ai-handout-studio new --title "Kickoff: intranet refresh" --outline kickoff --template cobalt
  ai-handout-studio new --title "Proposal: a shared handout library" --outline proposal --template lumen
  ai-handout-studio new --title "Lightning talk: what we learned shipping handouts" --outline talk --template podium
  ai-handout-studio new --title "Kickoff: onboarding guide, second edition" --outline kickoff --template prism
  ai-handout-studio new --title "Proposal: a monthly review format" --outline proposal --template linen
  ai-handout-studio new --title "Study session: reading pull requests" --outline chalk --template chalk
  ai-handout-studio new --title "Talk: five habits for clear handouts" --outline talk --template crayon
  ```

  The outlines leave placeholders (`(Proposal title)`, `[[要確認]]`) on the cover, so edit each `decks/<id>/deck.json`: set the cover heading `text` to a one-line title (two lines only for the `talk` outline, whose heading block is tall enough), the `kicker` to the kind of handout, and the two cover `text` blocks to an audience and a date. Change the `chalk` sample's tag from `Sample` to `Study session` so the filter shows four chips (Kickoff, Proposal, Study session, Talk). The `chalk` deck is made from the chalk design sample rather than an outline because the outline covers have no image block and chalk draws an empty frame there.
- Favorites: `favorites.json` lists two decks (`deck_20260926_002` and the lumen proposal) plus the document and sheet sample.
- The question sheet with three mock-ups is the 2026-09-26 sample `Choose the look of the study-session page` (`sheet_20260926_002` in both workspaces). Its mock-ups are plain HTML pages drawn at 1200x520 and shot with `ai-handout-studio shot`; they live in the sheet's `assets/`.

## 3. Shoot

`scripts/readme-shots.mjs` takes everything that Playwright can take. It needs the server from step 1 running on the clean workspace.

```sh
node scripts/readme-shots.mjs --lang en --deck deck_20260926_002 --sheet sheet_20260926_002 --to lumen
node scripts/readme-shots.mjs --lang ja --deck deck_20260926_003 --sheet sheet_20260926_002 --to lumen
```

`--only hero,list,editor,switch,sheet,phone` retakes a subset; `--out` changes the folder (default `docs/images/<lang>`). Desktop shots are 1440x900 at 2x, the phone shot 390x844 at 2x.

| File | URL and state | What it shows (alt text) |
| --- | --- | --- |
| `hero-templates.png` | `design/samples/<en/>slide.<template>.html`, first `.ds-slide` of each (chalk, cobalt, crayon, linen, lumen, podium, prism) at 1280x720, laid out 4 + 3 on a grey ground | The same cover drawn by the seven built-in templates: one deck, seven looks |
| `social-preview.png` | Same covers at 276x155 under the app name, 1280x640 (English only, saved to `docs/images/`) | Social preview: the app name over the seven template covers |
| `list.png` | `/slides`, nine decks, two of them under Favorites, four tag chips | The deck list: every handout your agents made, with favorites and tag filters |
| `editor.png` | `/decks/<deck>`, the cover heading selected, Properties tab, text appended in the Heading field | Editing a slide on screen: the heading is selected and its text is being changed in the Properties panel |
| `template-switch-01.png` | `/decks/<deck>` before the switch (cobalt) | The editor before switching templates |
| `template-switch-02.png` | Template button in the top bar clicked: the Choose a template dialog with the current slide drawn in every template | Choosing a template: the current slide previewed in every built-in look |
| `template-switch-03.png` | `lumen` picked in the dialog (marked In use); the canvas behind already uses it | The deck re-drawn in the chosen template while the dialog is still open |
| `template-switch-04.png` | Dialog closed, overflow banner dismissed, top bar says Unsaved changes | The same deck in a new template, ready to save |
| `sheet.png` | `/api/sheets/<sheet>/preview`, question 1 with option B chosen, scrolled so the three mock-ups and the answer sit in view | A question sheet comparing three mock-ups side by side, with the recommended one chosen |
| `sheet-answers.png` | Last question answered; the Copy answers button replaces Next question | The last question of a sheet: every answer is in and Copy answers turns them into Markdown for the chat |
| `phone.png` | Same sheet at 390x844 with the question list closed, scrolled to the mock-ups | The same question sheet read on a phone |

The template-switch frames double as the key frames of the 5-second GIF. The GIF itself and the demo video are recorded from the same workspace by `scripts/demo-record.mjs` and composed in `video/`; see [video/README.md](../video/README.md).

## 4. Architecture diagram

`how-it-works.png` is drawn by archify from the spec next to it (`docs/images/<lang>/how-it-works.archify.json`). The spec passes the showcase checks; keep it that way when you edit it.

```sh
node ~/.agents/skills/archify/bin/archify.mjs validate architecture docs/images/en/how-it-works.archify.json --quality showcase --json
ai-handout-studio diagram architecture docs/images/en/how-it-works.archify.json --out docs/images/en/how-it-works.png
sips --resampleWidth 2440 docs/images/en/how-it-works.png
```

Alt text: How it works: an AI agent follows the skill, the CLI saves JSON to the workspace, the local server shows it in the browser, and the browser exports it or sends answers back as Markdown.

## 5. Shots only the owner can take

These need a real agent session, so they are not scripted. Take them at 2x (Retina), crop as described, and save under `docs/images/<lang>/`.

- `mod.png`: in Claude Code with the `handout-watch` mod installed (setup section 9), ask for any handout in a conversation. When the CLI saves it, a band appears above the prompt: `Handouts in this conversation: 1` with the handout's title. Crop the band plus the prompt line below it, about 1200x200 px. Alt: The Claude Code mod: a band above the prompt lists the handouts made in this conversation.
- `sheet-markdown.png`: open a question sheet, answer every question and press Copy answers on the last one. Paste the clipboard into the agent's chat and send it; the agent replies with what it will do next. Crop from the pasted Markdown (the `## <sheet title>` heading and the `- question: answer` lines) to the first line of the reply, about 1200x700 px. Alt: Answers copied from the sheet as Markdown, pasted into the chat, and the agent carrying on.
- `pptx.png` (optional): export a deck as PPTX and open it in a presentation app. Click into a title so the text cursor and the selected text are visible. Crop the slide with its text selection, about 1400x800 px. Alt: An exported PPTX opened in a presentation app, with its text selectable and editable.

## 6. Clean up

```sh
unset AI_HANDOUT_STUDIO_WORKSPACE
ai-handout-studio restart
```
