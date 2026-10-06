# The demo video

A 40-second video for the top of the README and the blog post, plus the 5-second template-switch GIF under "15 templates, switched in one click". Eight scenes: handouts scatter across folders, ask from a terminal, answer a question sheet and paste the answers back, the list, fixing a slide on screen, switching the template, exporting, and the two lines to start. The screen scenes are Playwright recordings of the real app; the rest is drawn with Remotion. The captions are English; the Japanese version swaps only the captions (`src/captions.ja.json`).

This folder is its own npm project (not part of the pnpm workspace). Recordings, the BGM and the rendered files are not committed; the four steps below rebuild them in about ten minutes.

## 1. Workspace and server

Follow steps 1 and 2 of [docs/screenshots.md](../docs/screenshots.md): the recordings use the same clean English workspace and the same sample handouts as the README images, and the server on port 5190 must be running on it.

```sh
export AI_HANDOUT_STUDIO_WORKSPACE=~/Documents/ai-handout-studio-shots/en
ai-handout-studio restart
```

## 2. Record the screen scenes

From the repository root (it needs the root `pnpm install` and `pnpm exec playwright install chromium`):

```sh
node scripts/demo-record.mjs --deck deck_20260926_002 --sheet sheet_20260926_002
```

It writes `video/public/clips/<scene>.mp4` (1280x720, 30 fps, no audio) and `<scene>.json` (length, the position of the elements it clicked, and when) for the five scenes `sheet`, `list`, `editor`, `switch` and `export`. `--only switch,export` retakes a subset. A round cursor is injected into the page so it shows in the recording; the overflow banner and the overflow lines of the export notice are hidden while recording because their text is not localized yet, and the home directory in the export path is shown as `~`.

## 3. Music and render

```sh
cd video
npm install                 # once
node scripts/bgm.mjs        # Tone.js, rendered offline in Chromium, loudness-normalized to -16 LUFS -> public/bgm.wav
node scripts/render.mjs     # out/ai-handout-studio-demo.en.mp4 and .ja.mp4 (H.264, 1280x720, 30 fps) + a .jpg of the first frame
node scripts/gif.mjs        # docs/images/en/template-switch.gif and docs/images/ja/template-switch.gif (960 px, 12 fps, palettegen)
```

`npm run dev` opens Remotion Studio to preview the compositions `demo-en`, `demo-ja`, `switch-en` and `switch-ja`. `render.mjs` prints `ffprobe` for each file; keep the mp4 under 10 MB (the GitHub upload limit) and the GIF under 5 MB.

## 4. Publish

- README: upload the mp4 to a GitHub issue or pull request comment, copy the `user-attachments` URL it gets, and paste that URL on its own line where the `<!-- 172 -->` comment sits in `README.md` and `README.ja.md`. Replacing the video later means uploading again and changing the line again.
- Blog: copy `out/ai-handout-studio-demo.en.mp4` and the `.jpg` next to it into the article's `public/videos/`.
- The GIFs are committed; the README embeds them with `<img>`.

## Where things are

| Path | What |
| --- | --- |
| `src/timeline.ts` | Scene order and lengths; how each recording is used (start offset, playback rate); the GIF window |
| `src/captions.en.json`, `src/captions.ja.json` | Every caption, callout and terminal line, by scene |
| `src/Desk.tsx` | The white-and-blue desk, the heading, the window frame and the callouts (ring, line and label pointing at a recorded element) |
| `src/scenes/` | `Scatter` (scene 1), `Ask` (2), `Sheet` (3, with the pasted Markdown), `Screen` (4 to 7, a recording in the window), `End` (8) |
| `src/Switch.tsx` | The GIF composition: scene 6 full-frame with a caption bar |
| `src/theme.ts` | Colors from `design/tokens.json`, fonts, size and fps |
| `scripts/` | `bgm.mjs`, `render.mjs`, `gif.mjs` |
