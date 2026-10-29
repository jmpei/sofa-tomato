# Sofa Tomato

A movie log you tag in your own words, a watchlist, and a Movie Night slot machine that picks
tonight's movie with the people you watch with. Built as a Claude web artifact (React 18).
The published artifact is `dist/index.html`. Requirements: `docs/PRD.md`. Mockups: `docs/mockups/`.

Live: https://claude.ai/artifact/XnKNQ4muagGSK2pQC7XefE

## How it works

- **Home**: type a title (grey suggestions; Tab or Enter takes one, Escape ignores it), pick tags
  in your own words or ★ Loved it, then **Mark as watched** or **Add to watchlist**.
- **Movies**: search, Watched / Watchlist, filter by tag, star or person. Each row has year,
  runtime, rating, plot, director and stars from Claude; **More** opens an IMDb search.
- **People**: everyone the page is shared with appears after opening it once. Connect, then group
  people as Friends, Family or a group you name. Claude is everyone's friend from the start.
- **Movie Night**: both press **What to watch tonight?** and Claude pulls the lever.
  A movie on both watchlists wins straight away. Otherwise one person's watchlist and loved movies
  (loved about 20% of the time) offer a pick and the other answers; a yes lands MATCH · MATCH · MATCH.
  With Claude, every spin matches. Afterwards home asks each person to tag tonight's movie.

## Project layout

- `src/core.js`: pure logic (tags, search, filters, links, Movie Night). No React, no DOM.
- `src/runtime.js`: connects to the artifact's `db`, `user` and `sample` capabilities, or falls back to this device.
- `src/localdb.js`: the on-device stand-in for the shared database (localStorage).
- `src/App.jsx` (shell and data), `home.jsx`, `movies.jsx`, `night.jsx` (Movie Night, People, dialogs),
  `slot.jsx` (slot machine and Claude), `tags.jsx`, `complete.jsx` (ghost-text autocomplete).
- `src/styles.css`, `src/slot.css`: design tokens on `:root`.
- `src/index.html`: page template (page content only; the publisher adds `<html>`, `<head>`, `<body>`).
- `scripts/build.cjs`: bundles with esbuild into `dist/index.html`.
- `tests/core.test.js`, `tests/localdb.test.js`: unit tests. `tests/e2e.test.cjs`: Playwright tests;
  shared-mode tests open two pages with a fake `window.claude`.
- `docs/PRD.md`: requirements. `docs/mockups/`: screenshots of every view.

## Run it

```bash
npm install
npx playwright install chromium   # first time only
npm test                          # unit tests, build, browser tests
```

## Data

Only ids are stored; names come from the `user` capability when the page renders.
Claude has no documents: its side of a night is worked out on the page.

| Path | Body |
|---|---|
| `members/<id>` | `{ joinedAt }` |
| `logs/<id>/movies/<movieId>` | `{ title, status: "watched" or "watchlist", tags, loved, createdAt, updatedAt, watchedAt, watchedWith: [{ with, at }], info }` |
| `links/<id>/to/<otherId>` | `{ want, at, relation }` — two `want: true` sides make a connection |
| `nights/<id>/with/<otherId>` | `{ ready, passed, answer, seen, rated, ended, tonight }` — both pages derive the night from both sides |

Access rules declared at publish: for each of `members`, `logs`, `links` and `nights`,
everyone on the page reads (`view`), only the owner writes the prefix, and each person writes
their own subtree (`<prefix>/{self}`, `interact`). So nobody can write someone else's movies,
links or nights.
