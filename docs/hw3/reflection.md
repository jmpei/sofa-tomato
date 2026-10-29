# HW3 Reflection: Context Engineering for Sofa Tomato

**Author:** Jiaming Pei · **Course:** CS6983 AI Coding · **Date:** 2026-10-29

## What the test showed

I gave six clean Claude Code sessions the same one-sentence request, to implement issue #3 (export my movies as
CSV). Two had no rules file, two had `AGENTS.md` v1, and two had v2. On a 20-point checklist I wrote before the
first run, sessions without rules averaged 14.0 and sessions with rules averaged 19.0.

The surprise was *where* the points came from. Without rules, every session still put the CSV logic in `core.js`
as a pure function, quoted cells correctly and blocked spreadsheet formula injection. The code itself is context:
`core.js` opens by saying it holds pure logic with no DOM, and the README names every file's job. A strong model
reads that and copies it. What the code cannot show is how my team works and what the product should feel like.
Without rules, no session used my branch or commit format. Neither reported the result on the status line, and
both put DOM code inside a view. With rules, all four followed the branch and commit format, all four used the
status line, and all four kept side effects in `App.jsx`. So a rules file is most useful for the decisions the
code can't show: conventions, intent, and what the reviewer needs to see.

## How the rules file bridges the PRD and mockups to code

My PRD and mockups were written in Claude Web for people. The IDE agent can't see that chat, so `AGENTS.md` does
three things. It points to the sources (`docs/PRD.md`, the 20 screenshots in `docs/mockups/`, the live artifact).
It translates them into terms the agent can act on: "Movies = navy block, tabs with counts, outline pill buttons
on the right". And it states the rules a picture can't, such as "one screen, only lists scroll" and "every action
reports on the status line". The two user-flow lists in §2.5 mattered most. Both with-rules runs put the export
button in the Movies controls row and reported "Exported 15 movies". One no-rules run put the button in the
header, where it wrapped onto its own row and pushed the tabs down. Every test still passed,
because no test knew what the mockup looked like.

## How the Scrum setup helps AI-assisted development

The GitHub issue is the unit of work I can hand to an agent. Each issue has acceptance criteria as a checklist,
so "done" has a definition the agent and I share, and the PR has to tick each box with a test name. Labels and
milestones keep scope small. One issue, one branch (`feature/3-export-csv`) and one commit
(`feat(movies): add Export CSV button (#3)`) make every AI change traceable and easy to revert. The board's
In Review column is where I review the AI's work. The tests and evaluator reports from Project 1 showed me that
AI is too generous when it grades its own work, so that review step should never be skipped.

The test also exposed a gap in this setup. No session could read the issue (the `gh` tool was blocked), so each
one invented its own columns, file name and empty-state behavior. v2's points dropped in exactly those places.
**A rules file can't replace the spec.** The issue's checklist has to reach the agent.

## What I changed (v1 → v2), and what happened

I read the four v1 diffs and final reports and made nine changes (listed with evidence in `AGENTS.md` §8):

- **Dates:** all four v1 runs used `toISOString().slice(0, 10)`, which gives the UTC day, so a movie logged at
  9 pm in Boston shows as tomorrow. v2 requires a local-day helper.
- **File names:** v2 fixes the pattern `sofa-tomato-<what>-<date>`, built by a pure `core.js` function.
- **Evidence:** v2 requires running the full `npm test` and copying the counts into a fixed report template.
- **Missing issue:** v2 says to run `gh issue view` first, and if that fails, to list the acceptance criteria assumed.
- **Small fixes:** where screenshots come from, a README line per feature, side effects only in `App.jsx`, and no
  `#3` comment stamped on every function.

Both v2 runs followed all eight behaviors I measured, against at most 3 of 8 before. Both wrote and tested a
`localDay()` helper. Both opened their report with "could not read the issue; assumed AC below", which is exactly
what a reviewer needs. The overall score did not go up (18.5 vs 19.5, noise with two runs each). The remaining
misses were spec details, which confirmed the gap above.

## What surprised me most

My first four runs were contaminated. Claude Code walked up the parent folders from the test copies, found my
personal `~/.claude/CLAUDE.md`, and loaded it as project memory. When I asked the model whether it saw any user
instructions, it said "no". Only the `/context` command showed the real list. Context engineering is not only
writing good rules. I also have to check what context the agent actually loaded, with a tool, not by asking the
model.

## What I would add or change for Sprint 2

1. **Let the agent read the issue.** Allow `gh issue view` (read-only), or paste the acceptance criteria into the
   prompt. This is the biggest remaining gap.
2. **Turn rules into checks.** A rule the agent can skip is only a suggestion. CI (#1) should run `npm test`, and a
   lint rule should flag `toISOString().slice(0, 10)` and DOM calls in view files.
3. **A visual check against the mockups.** Compare e2e screenshots with `docs/mockups/`, so a button that breaks
   the header layout fails a test.
4. **Keep `AGENTS.md` short.** v2 is 7.5k tokens. Move rarely used sections (data model, component table) into
   `docs/` with one-line pointers, and keep only rules that change behavior, each with its reason.
5. **More runs, another model.** Two runs per condition can't separate a one-point difference from noise.
   For Sprint 2 I would run five per condition, and also test Antigravity with Gemini, to see whether a weaker
   model leans on the rules more for architecture and security.
