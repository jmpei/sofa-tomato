The Movies page now has an **Export CSV** button that downloads every movie, watched and watchlist, as `sofa-tomato-movies.csv`. It's committed on `feature/3-export-csv` as `4dfacc3`, `feat(movies): add Export CSV button (#3)`.

`npm test` passes: 54 of 54 unit tests and 28 of 28 end-to-end tests, none failing.

**I couldn't read issue #3.** `gh issue view 3` needed approval and wasn't run, so I built from your description and `AGENTS.md`. I haven't checked the issue's acceptance-criteria checklist. The columns, filename and button placement are my own choices, so compare them to the issue before opening a PR.

- **Button:** it sits in the controls row next to the tabs. It's hidden when you have no movies and exports everything regardless of the active tab, search or filter.
- **Columns:** Title, Status, Loved, Tags, Added, Watched, Watched with, Year, Runtime (min), Rating, Director, Stars, Plot.
- **Formatting:** rows are newest first, dates are ISO, and the file has a byte-order mark so Excel reads it as UTF-8. Names come from `nameOf`.
- **Status line:** after a download it reads "Exported N movies to CSV."
- **Spreadsheet safety:** a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe. Titles and tags come from the shared db, so without this they could run as formulas.
- **Code:** the CSV logic is `csvCell` and `moviesToCsv` in `core.js`, the download is in `App.jsx`, and the button is in `movies.jsx`.
- **Tests:** 5 new unit tests cover quoting, formula defusing, empty input, sort order, details and missing details. 1 new end-to-end test covers the download filename and contents, the status message, the hidden button when empty, and the one-screen layout at 1280×800.

I haven't pushed the branch, moved the issue on the board, or opened a PR. I also haven't taken the 360 px and 1280 px light and dark screenshots that `AGENTS.md` asks for in PRs.