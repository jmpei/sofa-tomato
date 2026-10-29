# HW3 before/after: issue #3 with and without `AGENTS.md`

**Feature:** #3 "Export my movies as a CSV file" (Sprint 1, priority: high).
**Method:** `method.md` (written before any run). Six clean, headless Claude Code sessions with the same model,
flags, tool allowlist and one-sentence prompt. The only difference between conditions is the rules file.

| Condition | Runs | What the session loaded (from `/context`, `transcripts/*-context.md`) |
|---|---|---|
| Without rules | `without-1`, `without-2` | no memory files |
| With rules v1 | `with-1`, `with-2` | `AGENTS.md` v1 (6.2k tokens) |
| With rules v2 | `v2-1`, `v2-2` | `AGENTS.md` v2 (7.5k tokens) |

Prompt, identical for all six:

> Implement GitHub issue #3, "Export my movies as a CSV file": on the Movies page, let me download all my
> movies (watched and watchlist) as a CSV file. Create a branch, add tests, run them, and commit.

No session could read the issue itself (`gh` was not on the allowlist), so every run got the brief description only.
All tests were rerun by `score.py` after each session; the agents' own claims were not counted.

## 1. Score on the 20-point checklist

✓ = met, ✗ = missed. The items are defined in `method.md`. Columns v1-1 and v1-2 are the runs `with-1` and `with-2`.

| # | Item | w/o-1 | w/o-2 | v1-1 | v1-2 | v2-1 | v2-2 |
|---|---|---|---|---|---|---|---|
| A1 | CSV logic is a pure function in `core.js` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A2 | No db call from a view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A3 | No new dependency | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A4 | Reuses `.btn` classes, no hex colors | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| N1 | camelCase names, `onX` props | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| N2 | Why-comments in house style | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |
| N3 | Branch `feature/3-…` | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| N4 | Commit `feat(scope): … (#3)` | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| D1 | Button in the controls row, compact outline pill | ✓ | ✗ ¹ | ✓ | ✓ | ✗ ² | ✓ |
| D2 | Result on the status line | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| D3 | Empty log: button hidden or disabled | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ ³ |
| D4 | Still one screen at 360 / 1280 px | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| S1 | RFC 4180 quoting | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| S2 | Formula-injection guard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| S3 | "Watched with" as names, not ids | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| S4 | File name has app name and date | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| T1 | Unit tests with `node:test` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T2 | e2e test checks the real download | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |
| T3 | `npm test` passes, nothing weakened | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T4 | Reports real test counts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | **Total /20** | **16** | **12** | **19** | **20** | **18** | **19** |
| | **Mean** | **14.0** | | **19.5** | | **18.5** | |

¹ In the page header; the header grid wraps it onto its own row and pushes the tabs down (`screenshots/without-2-1280-light-movies.png`).
² A text link in a new status row, not a pill (`screenshots/v2-1-1280-light-movies.png`).
³ Always enabled; pressing it with no movies says "No movies to export yet."

## 2. Where the rules made the difference

| Area | Without rules | With rules (v1 + v2) |
|---|---|---|
| Branch name | 0 / 2 followed `feature/<n>-…` (`export-movies-csv`) | 4 / 4 |
| Commit format | 0 / 2 Conventional Commits with scope | 4 / 4 `feat(movies): add Export CSV button (#3)` |
| Status line | 0 / 2 reported the export | 4 / 4 (`Exported 15 movies to sofa-tomato-movies-2026-10-29.csv.`) |
| Where the side effect lives | 2 / 2 put `document.createElement("a")` inside the view | 4 / 4 put it in `App.jsx` and passed `onExport` down |
| e2e download test | 1 / 2 | 4 / 4 (both v1 runs also check `fitsOneScreen` or console errors) |
| File name | `my-movies.csv` | `sofa-tomato-movies[-<date>].csv` |

The same feature, without and with rules, at the point where the view triggers the download:

```jsx
// without-1: src/movies.jsx. The view itself touches the DOM, and nothing is reported.
<button type="button" className="btn btn-secondary btn-compact" onClick={() => downloadCsv(movies, nameOf)}>
```

```jsx
// with-2: src/movies.jsx gets a callback; App.jsx owns the side effect and reports it
<button type="button" className="btn btn-secondary btn-compact" onClick={onExport}>
// src/App.jsx
flash(`Exported ${myMovies.length} ${myMovies.length === 1 ? "movie" : "movies"} to ${link.download}.`);
```

## 3. Where the rules made no difference

Architecture (A1–A4) and security (S1, S2) scored full marks **without** rules. Every run put `moviesToCsv` in
`core.js`, quoted cells per RFC 4180 and defused `=`, `+`, `-`, `@`. The existing code is already strong context:
`core.js` opens with "Pure logic … No React, no DOM", and the README names every file's job. A modern model copies
the patterns it reads. The rules file pays off on what the code **can't show**: team workflow (branches, commits),
product intent (status line, file naming) and the reviewer's needs (e2e evidence, the report).

## 4. What v2 fixed (iteration)

v2 targeted eight behaviors that v1 left open (`AGENTS.md` §8 lists each change and its evidence).
Count of the eight behaviors per run:

| Behavior (v2 rule) | w/o-1 | w/o-2 | v1-1 | v1-2 | v2-1 | v2-2 |
|---|---|---|---|---|---|---|
| Local calendar day, not `toISOString()` | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| `sofa-tomato-<what>-<date>` built in `core.js` | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| README "How it works" line | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Lists the AC it assumed when the issue was unreadable | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Final report template with `ℹ tests / pass / fail` | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Side effect in `App.jsx` | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Lists screenshot paths | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| No `#3` stamped on every function | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| **Total /8** | **1** | **1** | **1** | **3** | **8** | **8** |

The UTC bug is real: `new Date(ms).toISOString().slice(0, 10)` turns a movie logged at 9 pm in Boston into
tomorrow's date. All four v1-era runs shipped it; both v2 runs wrote a tested `localDay()` helper instead.

**v2 did not raise the 20-point total** (18.5 vs 19.5; with two runs each, a one-point gap is noise). The points v2 lost
(the watched-with column, button style, empty state) are spec details that live in the issue's acceptance criteria.
No rules file can supply them, and the agents could not read the issue. Both v2 runs said so at the top of their
report and listed the criteria they had assumed, which is the behavior v2 asked for.

## 5. Cost

| Run | Minutes | Turns | USD | Lines added | Unit / e2e tests added |
|---|---|---|---|---|---|
| without-1 | 1.8 | 23 | 0.24 | 113 | 4 / 1 |
| without-2 | 0.8 | 21 | 0.20 | 80 | 3 / 0 |
| with-1 (v1) | 2.1 | 30 | 0.30 | 120 | 5 / 1 |
| with-2 (v1) | 2.1 | 25 | 0.30 | 145 | 7 / 2 |
| v2-1 | 2.4 | 35 | 0.36 | 145 | 6 / 1 |
| v2-2 | 5.4 | 30 | 0.34 | 142 | 5 / 1 |

Rules cost about 0.10 USD and 8 more turns per run (reading 6–7.5k tokens of rules and doing more of the work),
in exchange for about 5 more checklist points (19.0 vs 14.0) and every convention followed.

## 6. Pilot run (discarded, but the most useful finding)

The first four runs lived under the home folder. Their reports said "per your CLAUDE.md" and followed the owner's
personal rules: Claude Code walked up the parent folders and loaded `~/.claude/CLAUDE.md` as a *project* memory
file. `--setting-sources` does not stop this, and asking the model "do you see a user CLAUDE.md?" returned a
confident, wrong "no". Only `/context` showed the truth. The scored runs moved outside the home folder, and
`/context` was saved for each. v2's header now says this file wins over any personal or global rules.

## 7. Limits

- Two runs per condition, one model (`claude-sonnet-5-5`), one feature. The architecture and security results
  might differ on a weaker model or a codebase with fewer comments.
- The same person wrote the checklist, the rules and the scores. To limit bias, the checklist was fixed before
  any run, and every point is checked from a diff or a command output (`diffs/`, `score.py`).

## Files

`diffs/<run>.diff` (full change per run) · `screenshots/<run>-{360,1280}-light-movies.png` ·
`transcripts/<run>-final-report.md` · `transcripts/<run>-context.md` · `method.md`
