I added an **Export CSV** button to the Movies page and committed it on `feature/3-export-csv`. `npm test` passes, with 54 of 54 unit tests and 28 of 28 e2e tests passing.

```
Issue: #3 — could not read (gh needed approval, which I didn't get); assumed AC below
Branch: feature/3-export-csv   Commit: feat(movies): add Export CSV button (#3)
Tests: unit  ℹ tests 54 / pass 54 / fail 0
       e2e   ℹ tests 28 / pass 28 / fail 0
AC (assumed):
 - [x] Export button on Movies page — "Export CSV downloads watched and watchlist movies"
 - [x] Includes watched and watchlist, regardless of the active tab, filter or search — same e2e test (all 15 samples)
 - [x] File named sofa-tomato-movies-<local day>.csv — "the day and file name use the local day…" and the e2e filename check
 - [x] Columns: title, status, loved, tags, dates, watched with, year, runtime, rating, director, stars, plot — "details and who you watched with are included"
 - [x] Commas, quotes and line breaks are quoted — "commas, quotes and line breaks are quoted…"
 - [x] Status line reports the result, including "No movies to export yet." when empty — e2e test
Screenshots: tests/screenshots/{360,1280}-{light,dark}-movies.png (written by e2e; they show the new button)
Not done / open questions: I did not open a PR or move the board card. The columns and file name are my own choices, so compare them with the real issue.
```

- **Where it lives:** the CSV and file-name logic is in `src/core.js`. The download itself is in a handler in `src/App.jsx`, so `src/movies.jsx` only gets an `onExport` prop. The README "How it works" has one new line.
- **Spreadsheet safety:** cells that start with `=`, `+`, `-` or `@` get a leading apostrophe so Excel or Sheets won't run them as formulas. The file also has a UTF-8 BOM so Excel reads accented titles correctly.
- **Local day:** dates in the CSV and the file name use the local calendar day, per AGENTS.md.
- **Empty list:** the button always shows, and pressing it with no movies just reports "No movies to export yet."