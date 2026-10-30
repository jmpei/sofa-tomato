# Before/after test: method

Written 2026-10-29, **before** any run. The checklist below is fixed; results go in `comparison.md`.

## Feature

Issue #3 "Export my movies as a CSV file" (Sprint 1, priority: high).

## Conditions

| | Without rules | With rules |
|---|---|---|
| Code | `main` @ `99d913d` (P1 code, `docs/PRD.md`, `docs/mockups/`) | same + `AGENTS.md` v1 |
| Tool | Claude Code 2.1.312, headless `claude -p`, model `claude-sonnet-5-5` | same |
| Context isolation | clone **outside the home folder**, `--setting-sources project,local` (no user settings, hooks, plugins), `--strict-mcp-config` with no servers, fresh path (no auto-memory), no git remote; verified by `/context` | same |
| Permissions | `acceptEdits` + Bash allowlist (npm, npx, node, git, ls, cat, grep, find, sed, head, tail, wc, mkdir) | same |
| Prompt | identical (below) | identical |
| Runs | 2 (`without-1`, `without-2`) | 2 (`with-1`, `with-2`) |

Canary check before the runs: with these flags a session reports no user CLAUDE.md, and a codeword placed in
`AGENTS.md` is visible (Claude Code reads `AGENTS.md` natively).

**Pilot (discarded, kept in `pilot-runs/`, `pilot-logs/`).** The first four runs lived under the home folder.
Their final messages said "per your CLAUDE.md" and followed the owner's personal rules: Claude Code walks up the
parent folders, reached `~/.claude/CLAUDE.md`, and loaded it as a *Project* memory file. `--setting-sources`
does not stop that, and the canary's "no" (the model asked about its own context) was wrong.
**Fix:** the scored runs live outside the home folder, and each run's `/context` report
(`logs/<run>.context.md`) proves what was loaded: without-rules runs list no memory files; with-rules runs list
only `AGENTS.md` (6.2k tokens). The pilot still matters: the same leak affected both conditions, and it is
evidence for the reflection (hidden context sources beat written rules).

### Prompt (brief description only)

> Implement GitHub issue #3, "Export my movies as a CSV file": on the Movies page, let me download all my
> movies (watched and watchlist) as a CSV file. Create a branch, add tests, run them, and commit.

## Scoring checklist (1 point each, 20 total)

Each item is checked by reading the diff or running a command, not by asking the model.

**Architecture and patterns (A)**
- A1 CSV building is a pure exported function in `src/core.js` (no DOM, no React)
- A2 No db call added in a view file; no db write added at all (export is read-only)
- A3 No new runtime dependency in `package.json`; React still used as UMD global
- A4 New UI reuses existing classes (`.btn` family); no new hex colors in CSS

**Naming and conventions (N)**
- N1 New functions camelCase verb/noun phrases; any new prop is `onX`
- N2 File-header / why-comments match the existing style; no `console.log` left in `src/`
- N3 Branch named `feature/3-<kebab>`
- N4 Commit message `feat(<scope>): … (#3)` (Conventional Commits + issue number)

**Design intent (D)**
- D1 Button lives in the Movies controls row/header (where the mockup puts actions), styled as a compact outline pill
- D2 The result is reported on the existing status line (`aria-live`), e.g. "Exported N movies."
- D3 Empty log: button disabled or hidden, no empty file
- D4 Page still fits one screen at 360 px and 1280 px (e2e "One screen" passes)

**Correctness and security (S)**
- S1 RFC 4180 quoting of commas, quotes, line breaks
- S2 Spreadsheet formula-injection guard (cells starting `=`, `+`, `-`, `@`)
- S3 `watched_with` exported as display names, not raw ids
- S4 File name includes the app name and the date

**Tests (T)**
- T1 Unit tests added in `tests/core.test.js` with `node:test` (count them)
- T2 An e2e test checks the actual download in Playwright
- T3 `npm test` passes, no existing test removed or weakened
- T4 Agent pasted / reported real test counts (evidence, not a claim)

## Extra measures (not scored)

Files touched, lines added, unit and e2e tests added, wall time, cost (USD), turns.
