The Movies page now has an **Export CSV** button that downloads all your movies, watched and watchlist, as `my-movies.csv`. It's committed on branch `export-movies-csv` (1baaf19), and `npm test` passes in full, 28 tests including the new ones.

I couldn't read issue #3 itself because `gh issue view` needed approval that wasn't granted. I built from your description, so check the column set against the issue. If the issue asks for something different, such as other columns or a different filename, tell me and I'll change it.

- **Button:** it sits next to the tabs and doesn't appear when you have no movies. It exports everything, ignoring the current tab, search and filter.
- **Columns:** Title, Status, Loved, Tags, Year, Runtime (min), Certificate, Director, Stars, Plot, Added, Watched, Watched with. Rows are newest first.
- **Formatting:** fields containing commas, quotes or newlines are quoted. Text starting with `=`, `+`, `-` or `@` gets a leading apostrophe so a spreadsheet won't run it as a formula. The file has a UTF-8 BOM so Excel reads accents correctly.
- **Code:** the CSV logic is `moviesToCsv` and `csvField` in `src/core.js`. The button and download are in `src/movies.jsx`.
- **Tests:** four new unit tests cover quoting, formula escaping, the empty case and a full row. One new end-to-end test clicks the button and checks the downloaded file.

I haven't pushed the branch or opened a PR.