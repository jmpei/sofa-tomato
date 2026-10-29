I added an "Export CSV" button to the Movies page, and the change is committed on branch `export-movies-csv` (b0ae91c). I couldn't read issue #3, because `gh issue view` was denied. I worked from your description, so check the columns and filename against the issue's acceptance criteria.

- **Button:** it sits in the page header, shows only when you have at least one movie, and downloads `my-movies.csv`. The file contains every movie, watched and watchlist, whatever tab or filter is active.
- **Columns:** Title, Status, Loved, Tags, Year, Runtime (minutes), Rating, Director, Stars, Plot, Added, Watched. Movies are sorted newest first.
- **Escaping:** commas, quotes and line breaks are quoted properly. Titles or tags starting with `=`, `+`, `-` or `@` get a leading `'` so spreadsheets don't run them as formulas. The file starts with a UTF-8 BOM so Excel reads accents correctly.
- **Code:** the CSV is built by `moviesToCsv` in `src/core.js`, and the download itself is in `src/movies.jsx`.

I added 3 unit tests in `tests/core.test.js`: header-only for an empty list, a watched and a watchlist movie with details, and the quoting and formula escaping. `npm run test:unit` passes (52 of 52), and `npm run build` succeeds.

I did not run the end-to-end tests (`npm run test:e2e`), and the button has not been clicked in a browser. I haven't pushed the branch or opened a PR.