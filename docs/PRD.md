# Sofa Tomato: Product Requirements Document (P2)

**Author:** Jiaming Pei · **Course:** CS6983 AI Coding · **Version:** P2 v1, 2026-10-29
**History:** ReelLog PRD (HW2, 2026-10-11) → Sofa Tomato P1 submission (2026-10-18) → this document.
**Live prototype:** <https://claude.ai/artifact/XnKNQ4muagGSK2pQC7XefE>

## 1. Problem

People who watch movies with friends, partners or family lose time deciding what to watch together.
In three Mom Test interviews (2026-10-09):

- Few people keep a record of what they watched, and nobody goes back to one.
- The pain shows up when choosing with other people. B recognized a disliked thriller 15 minutes in,
  after "we'd already spent time choosing it." Choosing alone already takes B 20 minutes or more.
- Movie talk happens between friends. B: "A friend asked me for a comedy recently. I couldn't remember many titles."

## 2. Users

**Primary:** students and young professionals who stream movies with someone else and do not keep a log.
**Not targeted:** enthusiasts who already log in Letterboxd or Douban, and review writers.

## 3. Solution

A Claude web artifact. Each person marks movies as watched with tags in their own words, or saves them
to a watchlist. People on the shared page connect as Friends, Family or a named group. For Movie Night,
both press one button; a movie on both watchlists wins at once, otherwise the app offers a pick from one
person's watchlist and loved movies and the other says yes or no. Claude is a built-in friend who likes
every movie, so one person can try Movie Night alone.

## 4. Goals and non-goals

| Goals | Non-goals |
|---|---|
| Log a movie in under 15 s | Crowd ratings, star scores |
| Answer "have I seen it?" in under 5 s | Public profiles, comments, a feed |
| Agree on tonight's movie in about 1 minute | Streaming links, posters |
| Every feature works at 360 px wide, on one screen | Accounts outside claude.ai |

## 5. Shipped in P1 (baseline)

| Story | Acceptance criteria (short) |
|---|---|
| US1 Mark a movie as watched | Title + at least one tag or ★; own-words tags; >20 tags fold under "All tags"; ghost-text autocomplete |
| US2 Save for later | "Add to watchlist" saves without tags; "Watched it" moves it to Watched |
| US3 Check before watching | Case-insensitive search; "You've seen it, and called it a waste of time."; Claude-filled details; IMDb link |
| US4 Connect | Everyone on the page appears in People; request/accept; Friends, Family or a named group; disconnect confirms |
| US5 Movie Night | Both press; shared watchlist wins at once; else vote; MATCH · MATCH · MATCH pop-up |
| US6 Tag tonight's movie | Home pre-fills tonight's title; "with <name>"; filter by who I watched with |
| US7 Edit or delete | Edit tags and ★, survives refresh; delete asks first |

## 6. P2 scope (Sprints 1–2)

Each row is a GitHub Issue with its full acceptance-criteria checklist.

| Story | Sprint | Why |
|---|---|---|
| US8 Export my movies as CSV | 1 | A log is only useful if I can take it with me; also a backup |
| US9 Sort Movies (newest, oldest, A–Z) | 1 | Half-remembered movies are found by date as often as by title |
| US10 Undo a delete for 5 seconds | 1 | Delete is final today; a mis-tap loses data |
| US11 Explain a re-spin | 1 | Evaluator round 2 #2: the slot machine re-spins with no words when the pick leaves the pool |
| US12 Import a Letterboxd CSV | 2 | Lets enthusiasts like C try the app without retyping |
| US13 Log a rewatch | 2 | A second viewing should add a date, not a duplicate row |
| US14 Movie Night for 3+ people | 2 | Families choose in groups |
| US15 Tag and month stats | 2 | Answers "what do I usually like?" |

## 7. Technical requirements

- One-page React 18 app, bundled by esbuild into `dist/index.html` and published as a Claude artifact.
- Data: the artifact's shared `db` capability; each person writes only their own subtree.
  Outside Claude it falls back to `localStorage` on this device ("solo" mode).
- Claude (`sample` capability) fills in year, runtime, rating, plot, director and stars.
- The page never scrolls at 360×640 or 1280×800; only lists and tag areas scroll inside their boxes.

## 8. Risks

- Logging habit is the biggest risk: two of three interviewees never kept a log.
- Movie details depend on Claude's knowledge; very new films return "No details found."
