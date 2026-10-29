# AGENTS.md — Sofa Tomato

> Rules for any AI coding agent (Claude Code, Antigravity, Cursor, Codex) working in this repo.
> Read this file first, then the GitHub Issue you were given, then `docs/PRD.md`.
> Every rule has a **Why** so you can judge cases the rule does not cover.
> Version: v1 (2026-10-29). Changes are listed in §8 Changelog.

---

## 1. Project context

### 1.1 What this is

Sofa Tomato is a movie log you tag in your own words, a watchlist, and a Movie Night slot machine
that picks tonight's movie with the people you watch with. It ships as **one HTML file** published
as a Claude web artifact. Live prototype: <https://claude.ai/artifact/XnKNQ4muagGSK2pQC7XefE>.

### 1.2 Tech stack (pin these versions)

| Layer | Choice | Version |
|---|---|---|
| UI | React + ReactDOM, **UMD globals** from cdnjs (`const { useState } = React;`) | 18.3.1 |
| Language | Plain JavaScript (ES2020) + JSX. **No TypeScript** | — |
| Bundler | esbuild via `scripts/build.cjs` → `dist/index.html` (JS and CSS inlined) | 0.25.x |
| Unit tests | Node built-in `node:test` + `node:assert/strict` | Node 26 |
| Browser tests | Playwright (Chromium), driven from `node:test` | 1.64.x |
| Data | Artifact `db` capability (shared); `localStorage` fallback (`src/localdb.js`) | — |
| AI | Artifact `sample` capability (Claude fills in movie details and guesses) | — |

**Why UMD React:** a published artifact cannot import ES modules from a CDN; `src/index.html`
loads React with `<script>` tags. Never write `import React from "react"`.

### 1.3 Architecture

```
src/
  core.js        Pure logic: titles, tags, search, filters, Movie Night. No React, no DOM, no db.
  runtime.js     Connects to window.claude capabilities, or falls back to "solo" (this device).
  localdb.js     On-device stand-in for the shared db (same API: doc/collection/set/update/delete/onSnapshot).
  App.jsx        Shell + data: holds runtime, subscribes to collections, does every db write.
  home.jsx       Home view (log a movie) + useFlash status hook.
  movies.jsx     Movies view (search, tabs, filter, rows) + EditSheet dialog.
  night.jsx      Movie Night, People, NightDialog, Tutorial.
  slot.jsx       Slot machine + Claude's lever.
  tags.jsx       TagChoices picker (fold after 20 tags).
  complete.jsx   Ghost-text autocomplete.
  styles.css     All styles, design tokens on :root. slot.css: slot machine only.
  index.html     Page template (page content only; the publisher adds <html>/<head>/<body>).
tests/
  core.test.js   Unit tests for core.js.   localdb.test.js   Unit tests for localdb.js.
  e2e.test.cjs   Playwright: one describe per view or story; solo and two-person shared modes.
docs/
  PRD.md         Requirements (US1–US15).  mockups/   Screenshots of every view, both themes, 360 and 1280 px.
```

**Key patterns**

1. **Logic lives in `core.js` as pure, exported functions**; views call them. Anything you can test
   without a browser goes there. **Why:** 49 fast unit tests cover it; the UI layer stays thin.
2. **Only `App.jsx` writes to the db**, through `save(db.doc(paths.x(...)).set(...))`. Views receive
   data and `onSomething` callbacks as props. **Why:** one place handles refused writes and view-only users.
3. **Document paths come from `paths` in `runtime.js`.** Never build a path string by hand.
4. **Read stored data through a reader** (`readMovie`, `readLink`, `readSide`) that fills defaults
   and drops bad fields. **Why:** other people's pages write the shared db; treat it as untrusted input.
5. **Inject time and randomness** (`now = Date.now()`, `makeId`, `random`) as parameters so tests are deterministic.

### 1.4 Data model

| Path | Body |
|---|---|
| `members/<id>` | `{ joinedAt }` |
| `logs/<id>/movies/<movieId>` | `{ title, status: "watched" \| "watchlist", tags, loved, createdAt, updatedAt, watchedAt, watchedWith: [{ with, at }], info }` |
| `links/<id>/to/<otherId>` | `{ want, at, relation }` |
| `nights/<id>/with/<otherId>` | `{ ready, passed, answer, seen, rated, ended, tonight }` |

Each person writes only under their own `<id>`. Only ids are stored; display names come from the
`user` capability at render time (`nameOf(id)`).

### 1.5 Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | lowercase, one short noun; `.js` for logic, `.jsx` for UI | `movies.jsx`, `core.js` |
| React components | PascalCase; a whole screen ends in `View` | `MoviesView`, `EditSheet`, `MovieRow` |
| Functions | camelCase, verb or plain noun phrase | `searchMovies`, `readMovie`, `infoLine` |
| Event props | `onVerb` / `onNoun` | `onEdit`, `onWatchedIt`, `onAddSamples` |
| Constants | UPPER_SNAKE_CASE, exported from `core.js` | `MAX_TITLE_LENGTH`, `WARN_TAG` |
| CSS classes | kebab-case, prefixed by the part they style | `view-movies`, `row-title`, `btn-compact` |
| Storage keys | `sofatomato:` prefix | `sofatomato:tutorial-seen` |
| Tests | `test("<what the user sees>")` in plain words | `"search answers before you press play"` |

### 1.6 Coding standards

- Each file opens with a 1–3 line comment saying what it is and why. Comment the *why*, not the *what*.
- Two-space indent, double quotes, semicolons, trailing commas in multi-line literals (match existing code).
- Keep functions small and pure where possible; no classes; no global mutable state outside React.
- User-facing copy: short, plain sentences, sentence case, curly apostrophe (`You’ve seen it.`).
- No `console.log` left in `src/`.

### 1.7 Testing strategy

| Level | Where | Rule |
|---|---|---|
| Unit | `tests/core.test.js` | Every new exported `core.js` function gets tests: normal case, edge case, bad input |
| Browser | `tests/e2e.test.cjs` | Every acceptance-criteria checkbox gets at least one assertion; reuse helpers (`openApp`, `openPage`, `markWatched`, `addSamples`, `fitsOneScreen`, `connectedPair`) |
| Layout | e2e "One screen" | New UI must not make the page scroll at 360×640 or 1280×800 |

- Run `npm test` (unit → build → e2e) before saying a task is done; paste the pass/fail counts.
- Coverage goal: 100% of exported `core.js` functions have a unit test; 100% of AC items have an e2e check.
- Never delete or weaken an existing test to make a change pass.

---

## 2. PRD and design references

### 2.1 Where the requirements are

- `docs/PRD.md`: problem, users, goals, shipped stories US1–US7, P2 stories US8–US15.
- GitHub Issues: each P2 story is an issue whose body holds the **acceptance-criteria checklist**.
  The checklist is the contract; if the PRD and the issue disagree, the issue wins and you say so.

### 2.2 The mockups (`docs/mockups/`)

Files are named `<width>-<theme>-<view>.png` (width 360 or 1280; theme light or dark).

| View | What it shows |
|---|---|
| Home | Lime block. Huge thin heading "Just finished a movie?", Movie title field, "How did you feel?" tag pills (★ Loved it first), "All tags N more" fold, own-word tag field, **Mark as watched** (black pill) and **Add to watchlist** (outline pill) |
| Movies | Navy block, white text. "Movies" heading + search pill on the right; Watched/Watchlist segmented tabs with counts; tag filter select; status line; IMDb-style rows (title + ★, year · runtime · rating, plot, Director/Stars, tag pills, mono caption "WATCHED OCT 22"); **More** outline pill and **Edit** link on the right |
| Movie Night | Lilac block, three-reel slot machine with a lever; "What to watch tonight?" button |
| People | Cream block; connections grouped Friends / Family / named group |
| Pop-up | Navy (or mint) dialog naming tonight's movie with OK |

### 2.3 Design language (tokens are in `src/styles.css :root`)

- Black-and-white frame; **one pastel block per view** (`--block-lime`, `--block-navy`, `--block-lilac`, `--block-cream`).
- Pill buttons: `.btn .btn-primary` (black), `.btn-secondary` (outline), `.btn-danger` (magenta), `.btn-compact` in rows; `.link-button` for low-weight actions.
- Inter for text (`--font-sans`); JetBrains Mono uppercase for small captions (`--font-mono`).
- Spacing and radius only from tokens: `--space-xxs … --space-xxl`, `--rounded-sm … --rounded-full`.
- Light and dark themes both come from tokens; **never hard-code a hex color in a component rule**.
- **One screen:** a 56 px top bar, then the view fills the rest; only `.list-scroll` and tag areas scroll.

### 2.4 Key UI components and expected behavior

| Component | File | Behavior |
|---|---|---|
| Top bar | `App.jsx` | Name (goes home) + Movie Night, Movies, People, ?; current view is the black pill |
| `TagChoices` | `tags.jsx` | Toggle pills; ★ Loved it first; >20 tags fold under "All tags" |
| Ghost autocomplete | `complete.jsx` | Grey suggestion; Tab/Enter accepts; Escape ignores |
| `MovieRow` | `movies.jsx` | One row per movie as in the mockup; Edit opens `EditSheet` |
| `EditSheet` | `movies.jsx` | Native `<dialog>`; Delete asks first ("Keep it" cancels); Escape closes |
| Status line | `useFlash` / `.search-answer` | `aria-live="polite"` message, clears after 4 s; every action reports its result here |
| Slot machine | `slot.jsx` | Three reels; MATCH · MATCH · MATCH on a yes; respects reduced motion |

### 2.5 User flows to follow

1. **Log:** Home → type title (ghost suggestion) → pick tags or ★ → Mark as watched → status line "Saved …" → row appears in Movies newest first.
2. **Check before watching:** Movies → type in search → answer line ("You’ve seen it, and called it a waste of time.") → rows.
3. **Movie Night:** both press "What to watch tonight?" → shared watchlist wins, or one votes → pop-up → Home asks both to tag it.
4. **Edit / delete:** Movies → Edit → change tags or ★ → Save; or Delete → confirm.

A new feature should slot into one of these flows at the place the issue names, reuse the components
above, and report its result on the status line.

---

## 3. Scrum and Git workflow

### 3.1 Board

GitHub Project "Sofa Tomato P2": **Backlog → Sprint Todo → In Progress → In Review → Done**.
Milestones: **Sprint 1** (due 2026-11-07), **Sprint 2** (due 2026-11-21).
Work only on an issue that is in Sprint Todo or In Progress. Move it to In Progress when you start.

### 3.2 Branches

`<type>/<issue-number>-<short-kebab-description>` from an up-to-date `main`.

| Type | Use for | Example |
|---|---|---|
| `feature/` | a new user-visible capability | `feature/3-export-csv` |
| `fix/` | a bug | `fix/6-explain-respin` |
| `chore/` | tooling, CI, refactors | `chore/1-ci-tests` |
| `docs/` | documentation only | `docs/2-agents-md` |

### 3.3 Commits — Conventional Commits with the issue number

```
<type>(<scope>): <imperative summary, ≤ 72 chars> (#<issue>)

<optional body: why, not what>
```

- `type`: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `style`.
- `scope`: the area: `core`, `movies`, `home`, `night`, `people`, `slot`, `ci`, `docs`.
- Example: `feat(movies): add Export CSV button (#3)`.
- One logical change per commit; tests in the same commit as the code they test.

### 3.4 Pull requests

- Title = the main commit summary. Body starts with `Closes #<issue>`.
- Copy the issue's acceptance-criteria checklist into the PR and tick each item with evidence
  (test name or screenshot).
- Paste the `npm test` summary (tests / pass / fail).
- UI changes: attach 360 px and 1280 px screenshots, light and dark.
- At least **one review** before merge (the human owner reviews AI-written PRs). Squash-merge; delete the branch.

### 3.5 Referencing issues in code

- Commits and PRs always reference the issue (`(#3)`, `Closes #3`).
- In code, reference an issue only where the reason is not obvious from the code:
  `// #6: say why the reels spin again (evaluator round 2 #2).`
- No `TODO` without an issue number: `// TODO(#12): …`.

---

## 4. Do's and don'ts

### 4.1 Patterns

| Do | Don't |
|---|---|
| Put logic in `core.js` as pure functions with injected `now`/`random` | Put logic in JSX event handlers |
| Write through `App.jsx` with `paths.*` and `save(...)` | Call `db` from a view, or hand-build a path |
| Read db data through `readMovie`/`readLink`/`readSide` | Trust fields from the shared db |
| Reuse `.btn`, `.tag-pill`, `.link-button`, `TagChoices`, `useFlash` | Invent a new button style or toast |
| Use tokens (`var(--space-md)`, `var(--ink)`) | Hard-code px spacing or hex colors in new rules |
| Keep the page to one screen | Add a section that makes the page scroll |
| Report every action's result on the status line | Fail silently |

### 4.2 Dependencies

- **Runtime:** none beyond React 18.3.1 from cdnjs. Do not add runtime npm packages: the build inlines
  everything into one file and the artifact may only load scripts from approved CDNs.
- **Dev:** esbuild, Playwright, React (for tests). Ask before adding any other dev dependency.
- Prefer browser and Node built-ins: `Intl`, `crypto.randomUUID`, `Blob`, `URL`, `node:test`.

### 4.3 Security

- Never use `dangerouslySetInnerHTML`, `innerHTML`, or `eval`. React text rendering only.
- Treat everything from the shared db and from Claude (`sample`) as untrusted: parse, clamp lengths
  (`MAX_TITLE_LENGTH`, `MAX_TAG_LENGTH`), drop unknown fields.
- A person may write only their own subtree; never write under another person's id.
- External links: `target="_blank" rel="noopener noreferrer"`, built with `encodeURIComponent`.
- No secrets, tokens, or personal data in code, tests, or commits.

### 4.4 Accessibility (WCAG 2.2 AA)

- Every control is a real `<button type="button">`, `<a>`, `<input>` or `<select>` with a visible
  label or a `.visually-hidden` one.
- Touch targets ≥ 40 px high (`.btn-compact` minimum).
- Results and errors go to an `aria-live="polite"` region (the status line).
- Dialogs are native `<dialog>` with `aria-labelledby`; Escape closes; focus returns to the opener.
- Contrast ≥ 4.5:1 in both themes; check dark mode too.
- Motion: anything animated respects `prefers-reduced-motion`.

---

## 5. Definition of Done

- [ ] Every acceptance-criteria checkbox in the issue is met and has a test.
- [ ] `npm test` passes (paste counts); no existing test removed or weakened.
- [ ] Works at 360 and 1280 px, light and dark, without page scroll.
- [ ] Branch, commits and PR follow §3.
- [ ] README or `docs/` updated if behavior or data changed.

---

## 6. Commands

```bash
npm install && npx playwright install chromium   # first time
npm run test:unit                                 # fast: core + localdb
npm run build                                     # dist/index.html
npm test                                          # unit, build, e2e (the gate)
```

---

## 7. When unsure

Name the gap and ask instead of guessing. Do not change the data model, the access rules, or
Movie Night logic without saying so in the PR.

---

## 8. Changelog

- **v1 (2026-10-29):** first version, written from `docs/PRD.md`, the mockups, and the existing code.
