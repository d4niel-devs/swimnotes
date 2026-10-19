# SwimNotes

A report-card helper for swim instructors. Pick a class level, choose two
strengths and one area for growth (the "sandwich method"), and the app assembles a
comment by mixing and matching pre-written praise and critique sentences for each
skill. Everything runs in the browser: no accounts, no server, no API keys, and no data leaves the device.

Live site: https://daniel-mend0nca.github.io/swimnotes/

## How comments are built

`intro, praise (Strength 1), critique (Area for growth), praise (Strength 2), closing`

- Every skill has 10 praise and 10 critique variants; intros and closings have 8 variants per voice.
- Variants are picked at random; **Regenerate** and **Generate all comments** avoid repeating wording.
- Sentences that open with the swimmer's first name (or "you") are sometimes given a short linking phrase ("In addition,", "To keep improving,") so the comment flows like a paragraph.
- Optional note fields under Strength 1, Strength 2, and Area for growth are appended to the end of that part of the comment.
- Voice follows the level: Parent & Tot (parent and child), Preschool / Swim For Life 1-8 (child by name), Swim For Life 9-11 and Youth & Adult (addressed as "you").
- Student names are always capitalized, and comments use the first name only.
- Each student has an optional **Gender** choice (shown for levels whose comments name the swimmer). Leave it as *Not specified* for neutral wording ("their"), or choose *Female* or *Male* to use "her" or "his".

## Generated comments and PDF

**Generate all comments** scrolls to a "Generated comments" section (`Name:` then the comment).
**Download PDF** saves those comments on A4 pages as dashed-border slots (389 pt wide, at least 170 pt tall, Times 12 pt,
1.5 line spacing, four per page), matching the Word report-card template. A comment longer than a slot makes that slot taller.

## Multiple classes

Use **Add another class** to work on several classes in one session. Each class has its own level and students (choose its level with the level buttons while its tab is selected) and an optional name, such as "Tuesday 5 pm". **Generate all comments** writes every student in every class, and the Generated comments section groups them by class.

- **Copy all** includes each class name as a heading; each class also has its own **Copy** and **PDF** buttons.
- **Download PDF** with several classes makes one file where each class starts on a new page, with the class name printed small in the top margin above the first slot. A class's own **PDF** button makes the exact single-class layout.

## File structure

```
index.html            page markup
styles.css            styling (design tokens, light and dark themes)
script.js             interface logic (classes, students, results, copy, PDF)
generate.js           connects the UI to the comment engine
compose.js            comment-assembly engine (no DOM)
pdf.js                PDF export (no libraries), laid out like the Word report-card template
data/phrases.js       intro, closing and linking-phrase pools
data/*.js             per-level skills with praise/critique variants
fonts/                self-hosted DM Sans and DM Serif Display (OFL licence)
```

## Editing the phrase bank

Each skill looks like:

```js
{ label: "Tread water (15 sec.)",
  praise:   ["...", "...", "..."],   // 10 variants
  critique: ["...", "...", "..."] }  // 10 variants
```

Tokens available in name-voice sentences: `{S}` (subject), `{their}`, `{is}`, `{has}`, `{name}`.
Youth & Adult and Patrol files are written directly in second person.
Writing rules: no pass/fail, good/bad or "worked hard"; critiques must say how to improve using test-sheet technique.
Plain language for parents: say "lifejacket" (not PFD), "blowing bubbles" (not exhalation), "upright in the water" (not vertical body position), and so on.
In each skill, at least 3 praise and 4 critique variants should start with `{S}` (or "You"/"Your" in second-person files) so linking phrases can be placed in front of them.
The skill `label`s are the exact curriculum test-sheet wording (they still say "PFD") because they drive the dropdowns; only the comment sentences are plain-language.

## Design notes

- One accent (pool blue), cool neutrals, light and dark themes from the same tokens
  (`prefers-color-scheme`). Reduced-motion preferences are respected.
- Icons are inlined from [Phosphor Icons](https://phosphoricons.com) (MIT licence).
- Fonts are self-hosted: DM Sans and DM Serif Display (SIL Open Font Licence).
- Accessibility: labelled form controls, keyboard-operable level buttons, visible
  focus rings, inline error messages, live-region announcements, and undo when
  removing a student.

## Security, privacy and licence

- [SECURITY.md](SECURITY.md): how to report a problem, and what the application does and does not do.
- [PRIVACY.md](PRIVACY.md): where student names and notes go (nowhere: they stay in the browser) and how to verify it.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): the fonts and icons included, and their licences.
- [LICENSE](LICENSE): all rights reserved.

The page ships with a strict Content-Security-Policy: scripts, styles, fonts and images only from the site itself, and no outgoing connections.

## Run locally

Open `index.html` in a browser, or serve the folder (`python -m http.server`).
Works as-is on GitHub Pages.
