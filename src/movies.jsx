// Movies: everything this person has watched or saved for later, one row
// per movie in the style of an IMDb list: title, year · runtime · rating,
// tags, plot, director and stars. "More" opens IMDb.
import {
  searchMovies, filterMovies, findByTitle, watchedWithCounts, infoLine, imdbUrl,
  formatDate, hasTag, cleanTitle, WARN_TAG,
} from "./core.js";
import { TagChoices } from "./tags.jsx";

const { useState, useMemo, useRef, useEffect, useId } = React;

function Details({ movie, lookingUp, canLookUp, onLookUp }) {
  const { info } = movie;
  if (lookingUp) return <p className="row-meta">Looking up details…</p>;
  if (!info?.found) {
    return (
      <p className="row-meta">
        {info ? "No details found." : "No details yet."}{" "}
        {canLookUp && (
          <button type="button" className="link-button" onClick={() => onLookUp(movie)}>
            Ask Claude
          </button>
        )}
      </p>
    );
  }
  return (
    <>
      {infoLine(info) && <p className="row-meta">{infoLine(info)}</p>}
      {info.plot && <p className="row-plot">{info.plot}</p>}
      {(info.director.length > 0 || info.stars.length > 0) && (
        <p className="row-credits">
          {info.director.length > 0 && (
            <>
              <span className="credit-label">Director</span> {info.director.join(", ")}
            </>
          )}
          {info.stars.length > 0 && (
            <>
              <span className="credit-label">Stars</span> {info.stars.join(", ")}
            </>
          )}
        </p>
      )}
    </>
  );
}

function MovieRow({ movie, nameOf, lookingUp, canLookUp, onLookUp, onEdit, onWatchedIt }) {
  const lastVisit = movie.watchedWith[movie.watchedWith.length - 1];
  return (
    <li className="movie-row">
      <div className="row-main">
        <h2 className="row-title">
          {movie.title}
          {movie.loved && (
            <>
              <span className="row-star" aria-hidden="true"> ★</span>
              <span className="visually-hidden">, loved</span>
            </>
          )}
        </h2>
        <Details movie={movie} lookingUp={lookingUp} canLookUp={canLookUp} onLookUp={onLookUp} />
        {movie.tags.length > 0 && (
          <ul className="row-tags" aria-label="Tags">
            {movie.tags.map((t) => <li key={t} className="tag-pill">{t}</li>)}
          </ul>
        )}
        <p className="row-caption">
          {movie.status === "watched"
            ? `Watched ${formatDate(movie.watchedAt ?? movie.createdAt)}`
            : `Saved ${formatDate(movie.createdAt)}`}
          {lastVisit && ` · with ${nameOf(lastVisit.with)}`}
        </p>
      </div>
      <div className="row-side">
        <a className="btn btn-secondary btn-compact" href={imdbUrl(movie.title, movie.info)} target="_blank" rel="noopener noreferrer">
          More<span className="visually-hidden"> about {movie.title} on IMDb</span>
        </a>
        {movie.status === "watchlist" && (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => onWatchedIt(movie)}>
            Watched it
          </button>
        )}
        <button type="button" className="link-button" onClick={(e) => onEdit(movie, e.currentTarget)}>
          Edit<span className="visually-hidden"> {movie.title}</span>
        </button>
      </div>
    </li>
  );
}

// The edit sheet: change tags and the star, or delete. Escape closes it.
export function EditSheet({ movie, library, onSave, onDelete, onClose }) {
  const ref = useRef(null);
  const headingId = useId();
  const [tags, setTags] = useState(movie?.tags ?? []);
  const [loved, setLoved] = useState(movie?.loved ?? false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (movie && !dialog.open) dialog.showModal();
    if (!movie && dialog.open) dialog.close();
  }, [movie]);
  const watched = movie?.status === "watched";
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={headingId} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {movie && (
        <div className="sheet-body">
          <p className="eyebrow">{watched ? "Edit" : "Watchlist"}</p>
          <h2 id={headingId} className="sheet-title">{movie.title}</h2>
          {watched && (
            <div className="sheet-scroll">
              <TagChoices legend="How did you feel?" library={library} selected={tags} onChange={setTags} loved={loved} onLovedChange={setLoved} />
            </div>
          )}
          {confirming ? (
            <div className="sheet-actions" role="group" aria-label={`Confirm delete ${movie.title}`}>
              <p className="confirm-text">{watched ? `Delete ${movie.title} from your movies?` : `Remove ${movie.title} from your watchlist?`}</p>
              <button type="button" className="btn btn-danger" onClick={() => onDelete(movie)} autoFocus>
                {watched ? "Delete" : "Remove"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          ) : (
            <div className="sheet-actions">
              {watched && (
                <button type="button" className="btn btn-primary" disabled={tags.length === 0 && !loved} onClick={() => onSave(movie, { tags, loved })}>
                  Save
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="link-button link-danger" onClick={() => setConfirming(true)}>
                {watched ? "Delete" : "Remove from watchlist"}
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function MoviesView({ movies, loaded, library, nameOf, lookingUp, canLookUp, onLookUp, onEdit, onWatchedIt, onAddSamples, status }) {
  const [tab, setTab] = useState("watched");
  const [query, setQuery] = useState("");
  // "" (all), "loved", "tag:<label>" or "with:<id>"
  const [filterValue, setFilterValue] = useState("");
  const watched = movies.filter((m) => m.status === "watched");
  const watchlist = movies.filter((m) => m.status === "watchlist");
  const together = useMemo(() => [...watchedWithCounts(watched)], [movies]);
  const usedTags = library.filter((e) => e.count > 0);

  // A filter whose option has gone (its last movie deleted) falls back to all.
  const options = new Set(["", "loved", ...usedTags.map((e) => `tag:${e.label}`), ...together.map(([id]) => `with:${id}`)]);
  const activeFilter = options.has(filterValue) ? filterValue : "";
  // Forget a filter whose option went away, so it doesn't switch back on later.
  useEffect(() => {
    if (filterValue !== activeFilter) setFilterValue("");
  }, [filterValue, activeFilter]);
  const filter = activeFilter === "loved" ? { loved: true }
    : activeFilter.startsWith("tag:") ? { tag: activeFilter.slice(4) }
    : activeFilter.startsWith("with:") ? { with: activeFilter.slice(5) }
    : null;

  const list = tab === "watched" ? filterMovies(watched, filter) : watchlist;
  const visible = searchMovies(list, query);
  const hasQuery = cleanTitle(query) !== "";
  const exact = hasQuery ? findByTitle(movies, query) : [];

  let answer = "";
  if (hasQuery) {
    if (exact.some((m) => m.status === "watched" && hasTag(m, WARN_TAG))) answer = "You’ve seen it, and called it a waste of time.";
    else if (exact.some((m) => m.status === "watched")) answer = "You’ve seen it.";
    else if (exact.length > 0) answer = "It’s on your watchlist.";
    else if (visible.length === 0 && searchMovies(movies, query).length > 0) answer = "Not in this filter.";
    else if (visible.length === 0) answer = "Not in your movies.";
  }

  return (
    <section className="view view-movies" aria-labelledby="movies-heading">
      <div className="view-inner">
        <header className="view-header view-header-row">
          <h1 id="movies-heading" className="view-title" tabIndex={-1}>Movies</h1>
          <div className="search-field">
            <label htmlFor="search-input" className="visually-hidden">Search your movies by title</label>
            <input
              id="search-input"
              className="text-input search-input"
              type="search"
              placeholder="Seen it already? Search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </header>

        <div className="movies-controls">
          <div className="tabs" role="group" aria-label="Which movies">
            <button type="button" className="tab" aria-pressed={tab === "watched"} onClick={() => setTab("watched")}>
              Watched <span className="tab-count">{watched.length}</span>
            </button>
            <button type="button" className="tab" aria-pressed={tab === "watchlist"} onClick={() => setTab("watchlist")}>
              Watchlist <span className="tab-count">{watchlist.length}</span>
            </button>
          </div>
          {tab === "watched" && watched.length > 0 && (
            <div className="filter-field">
              <label htmlFor="filter-select" className="visually-hidden">Filter</label>
              <select id="filter-select" className="select" value={activeFilter} onChange={(e) => setFilterValue(e.target.value)}>
                <option value="">All tags</option>
                <option value="loved">★ Loved it</option>
                {usedTags.map((e) => (
                  <option key={e.label} value={`tag:${e.label}`}>{e.label} ({e.count})</option>
                ))}
                {together.length > 0 && (
                  <optgroup label="Watched with">
                    {together.map(([id, count]) => (
                      <option key={id} value={`with:${id}`}>{nameOf(id)} ({count})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
        </div>

        <p className="search-answer" aria-live="polite">{answer || status}</p>

        <div className="list-scroll">
          {!loaded ? (
            <p className="empty">Loading your movies…</p>
          ) : movies.length === 0 ? (
            <div className="empty">
              <p className="empty-title">Nothing here yet.</p>
              <p>Log a movie on the home page, or load samples to try search, tags and Movie Night.</p>
              <button type="button" className="btn btn-secondary" onClick={onAddSamples}>Add sample movies</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="empty">{tab === "watchlist" && !hasQuery ? "Your watchlist is empty. Save movies from the home page." : "No movies match."}</p>
          ) : (
            <ul className="movie-list" aria-label={tab === "watched" ? "Watched movies" : "Watchlist"}>
              {visible.map((m) => (
                <MovieRow
                  key={m.id}
                  movie={m}
                  nameOf={nameOf}
                  lookingUp={lookingUp.has(m.id)}
                  canLookUp={canLookUp}
                  onLookUp={onLookUp}
                  onEdit={onEdit}
                  onWatchedIt={onWatchedIt}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
