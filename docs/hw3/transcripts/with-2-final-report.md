The Movies page now has an **Export CSV** button, and it's committed as `511d312` on `feature/3-export-csv`. I couldn't read issue #3, so I haven't checked it against the issue's acceptance criteria.

`gh issue view 3` needed an approval that wasn't granted. I built from the PRD's US8 entry instead. AGENTS.md says the issue wins over the PRD, so please compare the issue's checklist with what's below. Anything it adds, such as specific columns or a file name, may need a follow-up.

**What it does**
- **Export:** Clicking the button downloads one CSV with every movie, watched and watchlist, newest first.
- **Columns:** Title, Status, Loved, Tags, Date, Watched with, Year, Runtime (min), Rating, Director, Stars and Plot.
- **File name:** `sofa-tomato-movies-YYYY-MM-DD.csv`.
- **Status line:** After the download it says "Exported N movies to <file>."
- **Empty state:** The button is hidden until there's at least one movie.
- **Formula safety:** Cells starting with `=`, `+`, `-` or `@` get a leading `'` so Excel or Sheets won't run them as formulas. I added this because titles are free text.
- **Code layout:** The CSV logic is in `src/core.js`. `src/App.jsx` builds the file and triggers the download, and `src/movies.jsx` holds the button.

**Tests**
- Unit: 7 new tests in `tests/core.test.js`.
- Browser: 2 new tests in `tests/e2e.test.cjs`. One downloads the file and checks the contents, and one checks the button is absent when there are no movies.
- `npm test` passes: unit 56/56, e2e 29/29, no failures. The existing "One screen" no-scroll checks still pass.
- I didn't take 360/1280 px screenshots, which AGENTS.md asks for in UI pull requests.

I haven't pushed the branch or opened a PR. I can do either once you've confirmed the issue's criteria.