import type { MessageKey } from "./ja.ts";

// 英語辞書。キーは日本語と一致させる(漏れは型検査で落ちる)

export const en: Record<MessageKey, string> = {
  "common.loading": "Loading…",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.creating": "Creating…",
  "common.backToList": "Decks",
  "api.localOnly": "Do this from the screen on the computer that runs the app.",
  "unit.pages": "{n} pages",
  "unit.slides": "{n} slides",
  "unit.slidesParen": "({n} slides)",
  "unit.slidesSlash": " / {n} slides",
  "unit.sections": "{n} sections",
  "unit.sectionsSlash": " / {n} sections",
  "unit.issues": "{n}",
  "unit.questions": "{n} questions",

  "nav.main": "Main",
  "nav.decks": "Decks",
  "nav.templates": "Templates",
  "nav.help": "Help",
  "nav.settings": "Settings",
  "nav.section.slide": "Slides",
  "nav.section.sheet": "Question sheets",
  "nav.section.document": "HTML documents",
  "sections.sheet.listTitle": "Question sheets",
  "sections.document.listTitle": "HTML documents",
  "sections.sheet.lead":
    "Question sheets your agent saved here. Swap the design and export a single HTML file.",
  "sections.document.lead":
    "HTML documents your agent saved here. Swap the design and export a single HTML file.",
  "sections.sheet.howTo":
    "No question sheets yet. Ask your agent to make one with the question-sheet skill and it will appear here.",
  "sections.document.howTo":
    "No HTML documents yet. Ask your agent to make one with the ai-handout-studio skill and it will appear here.",
  "handouts.unreadable": "Cannot read the content",
  "handouts.answered": "Answered",
  "handouts.backToList": "Handouts",
  "handouts.template": "Design",
  "handouts.editTemplate": "Edit this design",
  "handouts.layout": "Layout",
  "handouts.openFull": "Open at full size",
  "handouts.export": "Export a single HTML file",
  "handouts.exporting": "Exporting…",
  "handouts.exported": "Exported. The file is here",
  "handouts.copyPath": "Copy path",
  "handouts.pathCopied": "Copied",
  "handouts.pathCopyFailed":
    "Could not copy. Select the text shown and copy it.",
  "handouts.copyOpenCommand": "Copy command to open the folder",
  "handouts.share": "Copy the sharing request",
  "handouts.sharing": "Building the bundle…",
  "handouts.shareCopied":
    "✓ Copied the sharing request. Paste it into your Claude Code conversation.",
  "handouts.shareCopyFailed":
    "Couldn't copy it. Long-press the field below, choose “Select all,” then “Copy.”",
  "handouts.shared": "Shared",
  "handouts.shareFallback": "Sharing request",

  "nav.notFound": "Page not found.",
  "nav.notFoundBack": "Back to decks",

  "decks.title": "Slides",
  "decks.lead":
    "Decks your agent made are listed here. Swap the template and export to PDF or PPTX.",
  "decks.empty":
    "No decks yet. Ask your agent to make one with the ai-handout-studio skill and it will appear here.",
  "decks.noMatch": "No decks match the current filter.",
  "decks.filterLegend": "Filter by tag",
  "decks.filterAll": "All",

  // サイト内検索。Search の字はどちらの言語でも同じ
  "search.label": "Search",
  "search.noMatch": "No matches",
  "search.loadError": "Couldn't load: {names}",
  "search.hintMove": "Select",
  "search.hintOpen": "Open",
  "search.hintClose": "Close",

  "deckCard.delete": "Delete",
  "deckCard.editNamed": "Edit {title}",
  "deckCard.openNamed": "Open {title}",
  "deckCard.deleteNamed": "Delete {title}",
  "deckCard.deleting": "Deleting…",
  "deckCard.favorite": "Add to favorites",
  "deckCard.unfavorite": "Remove from favorites",
  "deckCard.favoriteNamed": "Favorite {title}",
  "list.favorites": "Favorites",
  "deckCard.deleteConfirm": "Delete “{title}”? This cannot be undone.",
  "deckCard.invalidTitle": "Cannot load",
  "deckCard.noSlides": "No slides",
  "deckCard.statusDraft": "Draft",
  "deckCard.statusDone": "Done",

  // Help. `…` in the text is rendered as <code>
  "help.title": "Help",
  "help.lead":
    "You create handouts by asking your local agent (Claude, for example) in a conversation. This app is where you read, fix, export, and share what it made. This page explains what happens after you ask and what you get, for each kind of handout.",
  "help.toc": "Contents",
  "help.sub.ask": "How to ask",
  "help.sub.agent": "What the agent does",
  "help.sub.result": "What you get",
  "help.sub.edit": "Editing on screen",
  "help.sub.ai": "Asking AI for edits",
  "help.sub.export": "Exporting",
  "help.sub.share": "Sharing",

  "help.flowTitle": "From request to handout",
  "help.flowLead":
    "Slides, question sheets, and HTML documents all follow the same flow.",
  "help.flow1":
    "In a conversation in any folder, ask the agent to make a handout. The agent follows the ai-handout-studio skill.",
  "help.flow2":
    "If something is unclear from the conversation, you get a question sheet URL before the agent starts. The sheet asks everything at once: audience, length, title, and whether screenshots or generated images are needed. It does not ask about templates.",
  "help.flow3":
    "When you finish answering, press “Copy answers” (回答をコピー) and paste them into the conversation.",
  "help.flow4":
    "The agent makes the handout, fixes it until it passes the checks, and saves it.",
  "help.flow5":
    "You get URLs back: one to open on your computer, and one to open on a phone on the same Wi-Fi. The handout also appears under Decks in the left menu.",
  "help.tipsTitle": "Tips for asking",
  "help.tip1":
    "State the audience, length, and key message up front, and the question sheet gets shorter or is skipped. Say “don't ask, just make it” and the agent skips the sheet and tells you what it decided at the end.",
  "help.tip2":
    "To use a specific template, name it (for example, “make it with Lumen”). Otherwise the default template is used. You can switch templates on screen later.",
  "help.tip3":
    "Numbers, prices, dates, and proper nouns come only from the conversation and the materials you provide. Anything without a source is written as `[[要確認]]`; fill it in on screen or in the conversation.",
  "help.tip4":
    "You can also fix a finished handout through the conversation (for example, “shorten slide 3”). Small wording fixes are quicker on screen.",
  "help.tip5":
    "If you are on shared Wi-Fi, say so. The agent then hands over the handout without the phone URL.",

  "help.slideTitle": "Slides",
  "help.slideAsk":
    "Ask like “make proposal slides for next week's meeting” or “ten slides for a study session for new hires.” For slides you will present (talks, lightning talks, lectures), ask for talk slides; they are made as described under “Talk slides” below.",
  "help.slideAgent1":
    "The question sheet asks for the purpose, audience, number of slides, and title. If the topic involves an app's screens, it asks about screenshots; for introductions and study sessions, it asks whether to generate a cover or illustrations.",
  "help.slideAgent2":
    "The agent starts from the closest outline (proposal, study session, self-introduction, kickoff, talk) and puts one message on each slide.",
  "help.slideAgent3":
    "The agent takes screenshots or creates images and puts them in the handout. If it can't, it leaves a placeholder and tells you.",
  "help.slideAgent4":
    "It fixes the deck until it passes the checks, then returns the URLs.",
  "help.slideResult":
    "A deck of 1280x720 slides. Cover, section, content, and closing slides hold parts such as headings, text, bullets, cards, figures, side-by-side comparisons, steps, tables, and images. The default template supplies colors, fonts, and decoration, so the agent writes only the content. Click a card in Decks to open the editor.",
  "help.talkTitle": "Talk slides",
  "help.talkLead":
    "The question sheet also asks for the event page URL, your time slot, the key message, and the audience. If there is an event page, the official title and abstract come from it.",
  "help.talk1":
    "Before writing, the agent discusses an outline with you: the heading of each slide in order.",
  "help.talk2":
    "The talk template, Podium, is used. Text is large and each slide carries little of it.",
  "help.talk3":
    "The agent estimates whether the talk fits your time slot and trims slides with too much text.",
  "help.talk4":
    "What you will say goes into each slide's Notes as a script. When exported to PPTX, it becomes the speaker notes.",
  "help.slideEditLead":
    "The editor has the slide list on the left, the canvas in the middle, and the edit panel (Properties, Parts, AI, JSON) on the right.",
  "help.slideEdit1":
    "Edit text by double-clicking it on the canvas, or in Properties on the right. Position and size are also on the right.",
  "help.slideEdit2":
    "Add parts from Parts. Add, duplicate, delete, and reorder slides (by dragging) in the list on the left.",
  "help.slideEdit3":
    "Notes are for what you will say aloud. They do not appear on the slide.",
  "help.slideEdit4": "“Check overflow” finds text that runs outside its box.",
  "help.slideEdit5":
    "Press “Template: …” at the top to change only the look. The content stays the same.",
  "help.slideEdit6":
    "Save with ⌘S. Besides undo and redo, History lets you go back to a version kept on each save (the last 30).",
  "help.slideAi":
    "In AI on the right, choose the scope (this slide or the whole deck), write an instruction, and press “Create proposal.” Press “Launch agent” to start it from the screen, or paste the command shown into a terminal. When the proposal arrives, review it, press “Apply this proposal,” and save if you like it.",
  "help.slideExportLead":
    "Export from the top right of the editor. Save first.",
  "help.slideExport1": "PDF: one page per slide",
  "help.slideExport2": "PNG: one 1280x720 image per slide",
  "help.slideExport3":
    "PPTX: opens in presentation apps. Notes go into the speaker notes",
  "help.slideExport4": "HTML: a single HTML file for sharing",
  "help.slideExportNote":
    "Exported files go into `exports/` in the handout's folder. If any text overflows, you can check it before exporting.",
  "help.slideShareNote":
    "Sharing (showing a handout at a URL) doesn't work for slides yet. It works for question sheets and HTML documents already.",

  "help.sheetTitle": "Question sheets",
  "help.sheetLead":
    "A question sheet is a page where the agent gathers what it needs to confirm with you. The question-sheet skill makes it and keeps it as a handout.",
  "help.sheetWhenTitle": "When it appears",
  "help.sheetWhen1":
    "When you ask for a handout, as the questions before the agent starts.",
  "help.sheetWhen2":
    "When you ask the agent to use a question sheet or to lay out options for you, or when the agent needs you to pick a direction or a candidate. One or two quick questions may be handled in the conversation instead.",
  "help.sheetAgent1":
    "For each question, the agent adds the explanation, comparison table, and cautions you need to decide. Where there are options, the recommended answer is filled in.",
  "help.sheetAgent2":
    "It saves the sheet after it passes the checks and returns the URL of the answer page (and the phone URL).",
  "help.sheetResult1":
    "By default you read one question at a time. On a wide screen the question list starts open so you can see your progress. Press “Close question list” (質問一覧を閉じる) for a wider reading area.",
  "help.sheetResult2":
    "There are also layouts that show all questions on one page and a print layout for writing on paper.",
  "help.sheetAnswerTitle": "Answering",
  "help.sheetAnswer1":
    "Pick an option or write in the field. The recommended answer is already filled in, so move on if it is fine.",
  "help.sheetAnswer2":
    "Your answers in progress stay in the browser and survive a reload.",
  "help.sheetAnswer3":
    "On the last question (or in the bottom bar when all questions are shown), a “Copy answers” (回答をコピー) button appears. It copies your answers as Markdown; paste them into the conversation. Nothing is sent to the server from the page.",
  "help.sheetAnswer4":
    "The agent saves the pasted answers into the handout. When you open it later, your answers are filled in.",
  "help.sheetEditLead": "Click a card in Decks to open the handout's page.",
  "help.sheetEdit1": "Change the template. You can also pick the preview zoom.",
  "help.sheetEdit2": "“Open at full size” opens the answer page.",
  "help.sheetEdit3":
    "“Export a single HTML file” (the down arrow) turns it into one file you can share. From the notice under the bar you can copy the path where it was saved, or a command that opens its folder. Paste the command into a terminal to open the folder with the file selected (the command differs on Mac and Windows and matches the computer the app runs on).",
  "help.sheetEdit4":
    "The handout info shows the layout and whether answers are saved (Answered / No answers).",
  "help.sheetEditNote":
    "To change questions, options, or the layout (one at a time, all questions, print), ask the agent in the conversation. They can't be changed on screen.",
  "help.sheetShare1":
    "To show it to someone at a URL, ask the agent in the conversation: “Share this question sheet.” The agent builds a sharing bundle, publishes it privately as a Claude Artifact, and returns the URL. Whether it becomes a public link is your call, from Share on the Artifact's page. Names in the handout (such as a signature) can be read by anyone once it's a public link.",
  "help.sheetShare2":
    "For a sheet you find later in the list, press “Copy the sharing request” in the top bar of its page. The request is copied and a notice appears below the button; paste it into your Claude Code conversation. Anything to watch for, such as a remaining `[[要確認]]`, appears under the notice and is included in the request.",
  "help.sheetShare3":
    "Once it's published, reopening the page shows “Shared” and the URL in the top bar. Sharing it again updates the same URL with a new version.",
  "help.sheetShare4":
    "Answers from the people you share it with don't reach the server. As before, they send you the Markdown from “Copy answers,” and you paste it into the conversation. The shared page doesn't show “Save as file.”",

  "help.documentTitle": "HTML documents",
  "help.documentAsk":
    "Documents meant to be read, such as design docs, requirements, research findings, PR descriptions, and ADRs, become HTML documents. Ask like “turn these findings into something I can hand to people” or “make the design doc into HTML.”",
  "help.documentAgent1":
    "The question sheet asks for the purpose, audience, and title, and whether screenshots are needed if the topic involves an app's screens. It does not ask about length or generated images.",
  "help.documentAgent2":
    "The agent picks one reader and chooses the outline (order of sections) that fits the kind of document.",
  "help.documentAgent3":
    "It saves the document after it passes the checks and returns the editor URL and the full-size reading URL (and the phone URL).",
  "help.documentResult":
    "A single HTML page you read top to bottom. The title, lede, summary, and table of contents are followed by sections built from parts: text, bullets, steps, tables, cards, notices, notes, alerts, open items, quotes, code, and figures. A glossary may sit alongside. The full-size page also reads well at phone width.",
  "help.documentEditLead":
    "Click a card in Decks to open the editor. Sections and blocks are on the left, the preview in the middle, and the edit panel (Properties, Parts, AI) on the right.",
  "help.documentEdit1":
    "Select, delete, and reorder (by dragging) sections and blocks on the left. Add a section with “Add a section” on the left. Edit the selected item in Properties on the right.",
  "help.documentEdit2":
    "Add parts from Parts on the right; they go after the selected block.",
  "help.documentEdit3":
    "Edit the title, lede, summary, table of contents, signature, glossary, and footer line by selecting Front matter on the left.",
  "help.documentEdit4":
    "The preview always fits the screen. Hover a button in the top bar to see its name. The right panel can be collapsed.",
  "help.documentEdit5":
    "Change the template in the field at the top. Each save keeps a version you can restore from History.",
  "help.documentAi":
    "In AI on the right, pick one section, write an instruction, and press “Create proposal.” Paste the command shown into a terminal and the agent makes a proposal. Compare Before / Proposal, press “Import this proposal,” then save.",
  "help.documentExport":
    "“Export a single HTML file” (the down arrow) in the editor produces one file with the CSS embedded. From the notice under the bar you can copy the path where it was saved, or a command that opens its folder. Paste the command into a terminal to open the folder with the file selected. If you need a PDF, open that file in a browser and print it to PDF.",
  "help.documentShare1":
    "To show it to someone at a URL, ask the agent in the conversation: “Share this HTML document.” The agent builds a sharing bundle (one HTML file plus image files), publishes it privately as a Claude Artifact, and returns the URL. Whether it becomes a public link is your call, from Share on the Artifact's page.",
  "help.documentShare2":
    "From the screen, press “Copy the sharing request” in the editor's top bar and paste the copied request into your Claude Code conversation. The bundle is built from what's saved, so the button is disabled while you have unsaved changes, the same as exporting.",
  "help.documentShare3":
    "Once it's published, reopening the screen shows “Shared” and the URL in the top bar. Sharing it again updates the same URL with a new version.",

  "help.templateTitle": "Templates",
  "help.templateLead":
    "Templates hold colors, fonts, spacing, and decoration. For each kind, compare samples under Templates in the left menu. The one marked ★ is the default and is applied to handouts you ask for without naming a template.",
  "help.template1": "Hover over a card to show “Make default” and “Edit.”",
  "help.template2":
    "Editing changes only the text size (scale) and, for question sheets and HTML documents, the layout. Press “Save and build CSS” to apply.",
  "help.template3":
    "To change the look of a single handout, switch its template on that handout's screen. A template set on the handout takes priority over the default.",
  "help.template4":
    "Ask the agent which templates exist and it will list them.",

  "help.listTitle": "Decks and search",
  "help.list1":
    "Each kind has its own Decks list, shown as photo cards of the covers. Hover over a card to show the title and actions (open, ☆, delete). Deleting cannot be undone.",
  "help.list2":
    "Press ☆ to add a favorite; favorites are listed separately under Favorites at the top.",
  "help.list3": "The slide list can be filtered by tag.",
  "help.list4":
    "The magnifying glass at the right end of the header opens search. It looks through the titles of all three kinds and template names at once. Pick with ↑↓ and open with Enter; Esc closes it.",

  "help.phoneTitle": "Reading on a phone",
  "help.phoneLead":
    "When the agent hands over a handout, it also gives a URL you can open on a phone on the same Wi-Fi. For that, it opens the app to the LAN for that run only.",
  "help.phone1":
    "Question sheets and HTML documents can be read as full-size pages. You can answer a question sheet on your phone and send the answers back.",
  "help.phone2":
    "On a phone, “Copy answers” may fail to copy. In that case a field appears with the answers selected; copy from there.",
  "help.phone3":
    "Slides have no full-size page; you get the editor URL, which is laid out for a computer screen.",
  "help.phone4":
    "While the app is open to the LAN, anyone on the same network can read your handouts. On shared Wi-Fi, tell the agent so.",

  "help.filesTitle": "Files and commands",
  "help.files1":
    "Each handout gets its own folder, `workspace/<kind>/<handout id>/`. The kinds are decks, sheets, and documents. The source file is deck.json for slides, questions.json for question sheets, and document.json for HTML documents. Images go in `assets/`, exports in `exports/`, and sharing bundles in `share/`.",
  "help.files2":
    "If a file is changed outside the app, it is reloaded when you return to the screen. If you have unsaved changes, you can choose to reload or keep editing. A file with an invalid shape is left untouched and the reason is shown.",
  "help.files3":
    "The agent uses the `ai-handout-studio` command to create, check, and save handouts. To open the app yourself, run `ai-handout-studio open` in a terminal.",

  "help.settingsTitle": "Settings",
  "help.settings1":
    "Enter your organization name. It appears on the cover and closing slides and above the title of HTML documents and question sheets, not stored per handout. The screen language follows the `locale` setting. To change it, run `ai-handout-studio settings --set locale=en`, then reopen the screen.",

  "profile.title": "Settings",
  "profile.lead":
    "The organization name shown in handouts. Not stored per handout.",
  "profile.orgName": "Organization",
  "profile.orgHint":
    "Shown small on cover and closing slides and above the title of HTML documents and question sheets. Hidden when empty.",
  "profile.saved": "Saved. Open a deck to see the changes.",
  "profile.saving": "Saving…",
  "profile.save": "Save",

  "design.new.noLabel": "Enter a display name",
  "design.new.label": "Display name",
  "design.copyOf": "Copy of {label}",
  "design.surfacePanel": "{surface} settings",
  "design.sample.pages": "Sample pages",
  "design.sample.page": "Page {n} of {total}",
  "design.zoom": "Zoom",
  "design.zoom.fit": "Fit",
  "design.zoom.actual": "100%",
  "design.zoom.zoom": "200%",
  "design.checks.frame": "Extends past the right edge of the screen",
  "design.section.textScale": "Text size",
  "design.textScale.label": "Text size scale",
  "design.textScale.value": "{n}%",
  "design.textScale.reset": "Reset to 100%",
  "design.textScale.hint":
    "Headings, body text and notes grow or shrink by the same ratio.",
  "design.textScale.floor":
    "This template sets its smallest text to {px}px, so it cannot go below {n}%.",
  "design.leaveConfirm": "You have unsaved changes. Leave this page?",
  "design.saving": "Saving…",
  "design.save": "Save and build CSS",
  "design.loadFail": "Cannot load templates",
  "design.area.main": "Body",
  "design.area.toc": "Contents",
  "design.area.aside": "Aside",
  "design.sample.slide": "Slide",
  "design.sample.sheet": "Question sheet",
  "design.sample.document": "Document",
  "design.sample.pending": "No sample. Run pnpm design:build to create it",
  "design.layout.focus": "One at a time",
  "design.layout.overview": "With list",
  "design.layout.all": "All questions",
  "design.layout.print": "For print",
  "design.checks": "Checks on save",
  "design.checks.overflow": "Overflow",
  "design.checks.overflowOk": "No overflow in the sample",
  "design.checks.measuring": "Measuring…",

  "editor.leaveConfirm": "You have unsaved changes. Leave this page?",
  "editor.overflowConfirm": "There are {n} overflow issues. Export anyway?",
  "editor.openFail": "Cannot open deck",
  "editor.loadFail": "Cannot load {deckId}",

  "editorBar.undo": "Undo",
  "editorBar.undoTitle": "Undo (⌘Z)",
  "editorBar.redo": "Redo",
  "editorBar.redoTitle": "Redo (⇧⌘Z)",
  "editorBar.template": "Template: {template}",
  "editorBar.inspect": "Check overflow",
  "editorBar.inspecting": "Checking…",
  "editorBar.templateTitle": "Change the template",
  "templateSwitch.title": "Choose a template",
  "templateSwitch.hint":
    "Only the look changes; the content stays. Save to write it to the deck.",
  "templateSwitch.current": "In use",
  "templateSwitch.edit": "Edit this template",
  "templateSwitch.done": "Close",
  "templates.backToDeck": "Back to deck",
  "editorBar.history": "History",
  "editorBar.exportDisabled": "Save before exporting",
  "editorBar.shareDisabled": "Save before sharing",
  "editorBar.save": "Save",
  "editorBar.saveTitle": "Save (⌘S)",
  "editorBar.saving": "Saving…",
  "editorBar.dirty": "Unsaved changes",
  "editorBar.saved": "Saved",
  "editorBar.conflict":
    "deck.json was changed outside. Reloading discards unsaved changes.",
  "editorBar.saveFail": "Could not save: {message}",
  "editorBar.reload": "Reload file",
  "editorBar.keepEditing": "Keep editing",

  "export.exported": "Exported {format} ({n} files)",
  "export.warnings": "{n} overflow warnings.",
  "export.exporting":
    "Exporting… (first run takes a few seconds to launch the browser)",
  "export.fail": "Could not export: {message}",
  "export.closeNotice": "Dismiss notice",

  "history.title": "History",
  "history.lead":
    "Older versions are kept on every save (latest 30). Restoring also keeps a new version.",
  "history.empty": "No older versions yet.",
  "history.sourceGenerated": "Draft",
  "history.sourceSave": "Save",
  "history.unknownDate": "Unknown date",
  "history.restoreConfirm":
    "You have unsaved changes. Restoring discards them. Continue?",
  "history.restore": "Restore this version",
  "history.restoring": "Restoring…",

  "overflow.none": "No overflow found.",
  "overflow.some": "{n} overflow issues",
  "overflow.close": "Close results",

  "json.lead":
    "JSON of the selected slide. Press “Apply” to validate before reflecting changes.",
  "json.aria": "Slide JSON",
  "json.reset": "Revert",
  "json.apply": "Apply",

  "props.tabs": "Edit panel tabs",
  "props.collapse": "Collapse panel",
  "props.expand": "Open panel",
  "props.tabProperties": "Properties",
  "props.tabParts": "Parts",
  "props.tabAi": "AI",
  "props.tabJson": "JSON",
  "props.panel": "Edit panel",
  "props.slide": "Slide",
  "props.layout": "Layout",
  "props.layoutCover": "Cover",
  "props.layoutSection": "Divider",
  "props.layoutContent": "Body",
  "props.layoutClosing": "Closing",
  "props.notes": "Notes",
  "props.notesHint": "Notes to speak aloud. Not shown on slides.",
  "props.pickBlockHint": "Select a block on the canvas to edit its properties.",
  "props.deleteBlock": "Delete this block",
  "props.deleteTitle": "Delete",
  "props.rect": "Position and size (px)",
  "props.content": "Content",
  "props.unknownBlock": "Unsupported block. Edit it in the JSON tab.",
  "props.partHint": "Edit properties of the selected part.",

  "field.kicker": "Kicker",
  "field.heading": "Heading",
  "field.size": "Size",
  "field.sizeLarge": "Large (level 1)",
  "field.sizeMedium": "Medium (level 2)",
  "field.body": "Body",
  "field.align": "Align",
  "field.alignLeft": "Left",
  "field.alignCenter": "Center",
  "field.alignRight": "Right",
  "field.items": "Items",
  "field.itemsHint": "One line per item.",
  "field.marker": "Marker",
  "field.markerDisc": "Bullet",
  "field.markerNumber": "Number",
  "field.columns": "Columns",
  "field.columns2": "2 columns",
  "field.columns3": "3 columns",
  "field.columns4": "4 columns",
  "field.cards": "Cards",
  "field.title": "Title",
  "field.icon": "Icon",
  "field.noIcon": "None",
  "field.figures": "Figures",
  "field.value": "Value",
  "field.valueHint": "Leave [[to confirm]] for numbers without a source.",
  "field.label": "Label",
  "field.note": "Note",
  "field.leftColumn": "Left column",
  "field.rightColumn": "Right column",
  "field.steps": "Steps",
  "field.headers": "Headers",
  "field.headersHint": "Separate with “|”.",
  "field.rows": "Rows",
  "field.rowsHint": "One line per row. Separate cells with “|”.",
  "field.imageSrc": "Image path",
  "field.imageSrcHint": "Path relative to the deck folder’s assets/.",
  "field.fit": "Fit",
  "field.fitCover": "Fill frame (crop)",
  "field.fitContain": "Fit whole image",
  "field.caption": "Caption",
  "field.showPage": "Show page number",
  "field.deleteItem": "Delete {label} {index}",
  "field.addItem": "Add {label}",

  "part.heading.label": "Heading",
  "part.heading.note": "One message per slide",
  "part.text.label": "Body",
  "part.text.note": "Supporting text",
  "part.bullets.label": "Bullets",
  "part.bullets.note": "Parallel points",
  "part.card-grid.label": "Card columns",
  "part.card-grid.note": "2–4 parallel concepts",
  "part.kpi-row.label": "KPI tiles",
  "part.kpi-row.note": "Metric numbers",
  "part.two-col.label": "Two columns",
  "part.two-col.note": "E.g. now vs target",
  "part.process.label": "Steps",
  "part.process.note": "Ordered procedure",
  "part.table.label": "Table",
  "part.table.note": "Compare rows and columns",
  "part.image.label": "Image",
  "part.image.note": "Image in assets/",
  "part.footer.label": "Footer",
  "part.footer.note": "Page number",
  "parts.hint": "Adds to the center of the selected slide.",

  // Document editor (stage K, ticket 51)
  "doc.backToList": "Documents",
  "doc.outline": "Sections and blocks",
  "doc.front": "Front matter",
  "doc.frontHint":
    "Parts outside the sections. The template decides where they sit.",
  "doc.noHeading": "(no heading)",
  "doc.addSection": "Add a section",
  "doc.sectionDrag": "Reorder section {n}",
  "doc.sectionDelete": "Delete section",
  "doc.blockDrag": "Reorder block {n}",
  "doc.blockDelete": "Delete block",
  "doc.section": "Section",
  "doc.sectionHeading": "Heading",
  "doc.level": "Level",
  "doc.level2": "Section (h2)",
  "doc.level3": "Sub-heading (h3)",
  "doc.levelHint":
    "A sub-heading joins the section above it and stays out of the contents.",
  "doc.pickBlockHint": "Pick a block on the left to edit it here.",
  "doc.partsHint": "Adds after the selected block.",
  "docai.tab": "AI",
  "docai.lead":
    "Pick one section and describe the change. Compare the proposal in the preview before importing it.",
  "docai.needSection": "Pick a section or block on the left first.",
  "docai.target": "Section",
  "docai.instruction": "Instruction",
  "docai.instructionPlaceholder":
    "e.g. Turn the bullets into a table and cut repetition",
  "docai.create": "Create proposal",
  "docai.creating": "Creating…",
  "docai.handoffBefore": "Once the agent writes ",
  "docai.handoffAfter": ", the proposal appears here.",
  "docai.waiting": "Waiting for a proposal (checked every 3 seconds)",
  "docai.invalid": "The proposal did not validate. It appears here once fixed.",
  "docai.ready": "Proposal received (section {section})",
  "docai.viewBefore": "Before",
  "docai.viewAfter": "Proposal",
  "docai.comparing": "Comparing: {view} (includes unsaved edits)",
  "docai.changedWarn":
    "This section changed after the request. Importing replaces it with the proposal.",
  "docai.apply": "Import this proposal",
  "docai.applyNote":
    "Importing goes into the draft. Saving adds a version, and Undo reverts it.",
  "docai.cancel": "Drop this request",
  "doc.partsNeedSection": "Pick a section on the left first.",
  "doc.previewStale": "Save to bring this preview up to date.",
  "doc.conflict":
    "document.json was changed outside. Reloading discards unsaved changes.",
  "doc.head": "Title",
  "doc.headTitle": "Document title",
  "doc.headLede": "Lede",
  "doc.headLedeHint": "One or two lines under the title.",
  "doc.summary": "Summary",
  "doc.useSummary": "Show the summary",
  "doc.summaryLabelHint": "Left empty, it reads \u201cSummary\u201d.",
  "doc.toc": "Contents",
  "doc.tocLabel": "Contents",
  "doc.tocAuto": "Build from section headings",
  "doc.tocNone": "Hide",
  "doc.signature": "Signature line",
  "doc.useSignature": "Show the signature line",
  "doc.org": "Organisation",
  "doc.signatureNote": "Extra line",
  "doc.signatureNoteHint": "Kind of document, date, and so on.",
  "doc.signatureOrgHint": "When empty, the organization from Settings is used.",
  "doc.aside": "Side glossary",
  "doc.useAside": "Show the side glossary",
  "doc.glossary": "Terms",
  "doc.term": "Term",
  "doc.termDescription": "Description",
  "doc.foot": "Footer line",
  "doc.useFoot": "Show the footer line",
  "doc.field.textHint": "A line break starts a new paragraph.",
  "doc.field.why": "Reason",
  "doc.field.whyHint": "Shown small under the step. Empty means none.",
  "doc.field.rowLabel": "Use the first column as a row heading",
  "doc.field.numeric": "Numeric columns",
  "doc.field.numericHint": "Columns to align right, counted from 0.",
  "doc.field.kind": "Kind",
  "doc.field.kindInfo": "Info",
  "doc.field.kindSuccess": "Success",
  "doc.field.kindWarning": "Warning",
  "doc.field.noticeLabelHint": "Left empty, the kind is used.",
  "doc.field.source": "Source",
  "doc.field.code": "Code",
  "doc.field.figureHtml": "Figure contents",
  "doc.field.figureHtmlHint":
    "Output of the figure generator. Only ds- classes are allowed.",
  "doc.field.alt": "Alt text",
  "doc.field.altHint": "Read aloud, and shown when the image cannot load.",
  "doc.field.imageSrc": "File: {src}. Ask the agent to add or replace images.",
  "doc.field.html": "HTML",
  "doc.field.htmlHint":
    "Fallback for migration and exceptions. Only ds- classes are allowed.",
  "doc.part.text.label": "Body",
  "doc.part.text.note": "Paragraph text",
  "doc.part.bullets.label": "Bullets",
  "doc.part.bullets.note": "Parallel items",
  "doc.part.ordered.label": "Steps",
  "doc.part.ordered.note": "Ordered items",
  "doc.part.table.label": "Table",
  "doc.part.table.note": "Compare rows and columns",
  "doc.part.cards.label": "Cards",
  "doc.part.cards.note": "2\u20133 parallel ideas",
  "doc.part.notice.label": "Notice",
  "doc.part.notice.note": "Conditions not to miss",
  "doc.part.note.label": "Note",
  "doc.part.note.note": "An aside",
  "doc.part.alert.label": "Alert",
  "doc.part.alert.note": "Warning about breakage",
  "doc.part.open.label": "Open",
  "doc.part.open.note": "Not decided yet",
  "doc.part.quote.label": "Quote",
  "doc.part.quote.note": "A sourced passage",
  "doc.part.code.label": "Code",
  "doc.part.code.note": "Commands and settings",
  "doc.part.figure.label": "Figure",
  "doc.part.figure.note": "Output of the figure generator",
  "doc.part.image.label": "Image",
  "doc.part.image.note": "A screenshot or generated picture",
  "doc.part.html.label": "HTML",
  "doc.part.html.note": "Fallback for migration",

  "slides.list": "Slide list",
  "slides.head": "Slides",
  "slides.select": "Select slide {n}",
  "slides.ops": "Actions for slide {n}",
  "slides.duplicate": "Duplicate",
  "slides.drag": "Reorder slide {n}",
  "slides.delete": "Delete",
  "slides.add": "Add slide",

  "canvas.stage": "Selected slide",
  "canvas.zoom": "Zoom",
  "canvas.fit": "Fit",
  "canvas.editText": "Edit text (Esc to cancel)",
  "canvas.block": "{type} block {id}",

  "side.width": "Sidebar width",

  "dialog.close": "Close",

  "ai.title": "Polish a slide with AI",
  "ai.lead": "Describe the change. Review the proposal before applying it.",
  "ai.scope": "Target",
  "ai.scopeSlide": "This slide",
  "ai.scopeDeck": "Entire deck",
  "ai.instruction": "Instruction",
  "ai.instructionPlaceholder":
    "E.g. shorten the heading without losing meaning",
  "ai.quickShort": "Shorten text",
  "ai.quickVisual": "Visual structure",
  "ai.quickLayout": "Tidy spacing",
  "ai.creating": "Creating…",
  "ai.create": "Create proposal",
  "ai.handoffBefore":
    "Launch from the panel, or run the following command in a terminal. Once the agent writes ",
  "ai.handoffAfter": ", the proposal appears here.",
  "ai.waiting": "Waiting for a proposal (checked every 3 seconds)",
  "ai.invalid": "The proposal did not validate. It appears here once fixed.",
  "ai.ready": "Proposal received ({slides})",
  "ai.changedWarn":
    "You edited this content after requesting. Applying replaces it with the requested proposal.",
  "ai.apply": "Apply this proposal",
  "ai.noSaveNote": "Applying does not save. Undo reverts it.",
  "ai.cancelRequest": "Drop this request",

  "commandBox.agentLegend": "Agent to use",

  "run.agentLegend": "Agent to launch",
  "run.confirmBefore": "Target: {target}. Output: ",
  "run.confirmAfter": ". deck.json is never edited directly.",
  "run.starting": "Starting…",
  "run.launch": "Launch agent",
  "run.running": "Agent running ({time})",
  "run.stopping": "Stopping…",
  "run.stop": "Stop",
  "run.done": "The agent finished. Review the proposal below.",
  "run.cancelled": "Stopped.",
  "run.failed": "Failed.",
  "run.retry": "Launch again",
  "run.targetSlide": "This slide ({id})",
  "run.targetDeck": "Entire deck",
  "templates.title.slide": "Slide templates",
  "templates.title.sheet": "Sheet templates",
  "templates.title.document": "HTML document templates",
  "templates.lead.slide":
    "Hover over a card to see its name and the Make default and Edit buttons. The one with ★ is the default. When you ask the agent for slides, name a template (for example, “make it with Lumen”) to use it. Otherwise the default template is used.",
  "templates.lead.sheet":
    "Hover over a card to see its name and the Make default and Edit buttons. The one with ★ is the default. When you ask the agent, name a template to use it for the question sheet. Otherwise the default template is used.",
  "templates.lead.document":
    "Hover over a card to see its name and the Make default and Edit buttons. The one with ★ is the default. When you ask the agent, name a template to use it for the HTML document. Otherwise the default template is used.",
  "templates.isDefault": "Default",
  "templates.makeDefault": "Make default",
  "templates.makeDefaultNamed": "Make {label} the default",
  "templates.edit": "Edit",
  "templates.editNamed": "Edit {label}",
  "design.back": "Back",
  "design.section.layout": "Layout",
  "design.skeleton.hint.sheet":
    'One at a time starts with the question list open. Press "Close question list" or "Open question list" in the sample to open and close it.',
  "design.skeleton.hint.document":
    "Pick the layout of body, contents and side column from the miniature cards.",
  "design.skeleton.base": "Layout",
  "design.skeleton.listSide": "List position",
  "design.skeleton.side.left": "Left",
  "design.skeleton.side.right": "Right",
  "design.skeleton.printCurrent":
    "The current layout is for print. Choose one at a time or all questions to switch.",
  "design.skeleton.document": "Arrangement",
  "design.skeleton.document.standard":
    "Standard (contents on top, side column on the right)",
  "design.skeleton.document.single": "Single column",
  "design.skeleton.document.side-toc": "Contents on the left",
  "design.skeleton.document.current": "Current arrangement",
  "handouts.id": "ID",
  "handouts.questions": "Questions",
  "handouts.answers": "Answers",
  "handouts.notAnswered": "No answers",
  "handouts.createdAt": "Created",
  "handouts.updatedAt": "Updated",
  "handouts.slideCount": "Slides",
  "handouts.status": "Status",
  "handouts.info": "Handout info",
};
