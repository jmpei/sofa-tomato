// Home: log a movie you just watched, or save one for later. On a settled
// Movie Night, home shows tonight's movie with the title already filled in.
import { validateTitle, findByTitle, infoLine, formatDate, hasTag, WARN_TAG } from "./core.js";
import { TagChoices } from "./tags.jsx";
import { GhostInput, useGuessers } from "./complete.jsx";

const { useState, useRef, useEffect } = React;

// Clears itself after a few seconds. Screen readers read it out (aria-live).
export function useFlash() {
  const [message, setMessage] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 4000);
  };
  return [message, flash];
}

function DuplicateNote({ entry }) {
  if (!entry) return null;
  if (entry.status === "watchlist") {
    return <p className="field-warning">It’s on your watchlist. Mark as watched moves it to your movies.</p>;
  }
  const warn = hasTag(entry, WARN_TAG);
  return (
    <p className={warn ? "field-warning field-warning-strong" : "field-warning"}>
      You watched it on {formatDate(entry.watchedAt ?? entry.createdAt)}
      {entry.tags.length > 0 && ` and tagged it ${entry.tags.join(", ")}`}.
      {warn && " You called it a waste of time."}
    </p>
  );
}

function LogForm({ myMovies, knownTitles, library, prefill, onWatched, onWatchlist }) {
  const guessers = useGuessers();
  const [title, setTitle] = useState(prefill);
  const [tags, setTags] = useState([]);
  const [loved, setLoved] = useState(false);
  const [errors, setErrors] = useState({});
  const [formKey, setFormKey] = useState(0);
  const [status, flash] = useFlash();
  const titleRef = useRef(null);
  const entry = findByTitle(myMovies, title)[0];

  function reset(message) {
    flash(message);
    setTitle("");
    setTags([]);
    setLoved(false);
    setErrors({});
    setFormKey(formKey + 1);
    titleRef.current?.focus();
  }

  function checkTitle() {
    const error = validateTitle(title);
    if (error) {
      setErrors({ title: error });
      titleRef.current?.focus();
    }
    return !error;
  }

  function markWatched(event) {
    event.preventDefault();
    if (!checkTitle()) return;
    if (tags.length === 0 && !loved) {
      setErrors({ tags: "Pick a tag or ★ Loved it." });
      return;
    }
    const saved = onWatched({ title, tags, loved });
    reset(`Marked ${saved.title} as watched.`);
  }

  function addToWatchlist() {
    if (!checkTitle()) return;
    if (entry?.status === "watchlist") {
      flash(`${entry.title} is already on your watchlist.`);
      return;
    }
    const saved = onWatchlist({ title });
    reset(`Added ${saved.title} to your watchlist.`);
  }

  return (
    <form className="home-form" onSubmit={markWatched} noValidate>
      <div className="field">
        <label htmlFor="title-input" className="field-label">Movie title</label>
        <GhostInput
          id="title-input"
          ref={titleRef}
          type="text"
          autoComplete="off"
          maxLength={250}
          placeholder="Inception"
          value={title}
          candidates={knownTitles}
          ask={guessers.title}
          aria-invalid={errors.title ? "true" : "false"}
          aria-describedby="title-help"
          onChange={(next) => {
            setTitle(next);
            if (errors.title) setErrors({});
          }}
        />
        <div id="title-help" aria-live="polite">
          {errors.title && <p className="field-error">{errors.title}</p>}
          <DuplicateNote entry={entry} />
        </div>
      </div>

      <div className="home-tags">
        <TagChoices
          key={formKey}
          legend="How did you feel?"
          library={library}
          selected={tags}
          onChange={(next) => {
            setTags(next);
            if (errors.tags) setErrors({});
          }}
          loved={loved}
          onLovedChange={(next) => {
            setLoved(next);
            if (errors.tags) setErrors({});
          }}
        />
      </div>
      {errors.tags && <p className="field-error" role="alert">{errors.tags}</p>}

      <div className="home-actions home-actions-pair">
        <button type="submit" className="btn btn-primary">Mark as watched</button>
        <button type="button" className="btn btn-secondary" onClick={addToWatchlist}>Add to watchlist</button>
      </div>
      <p className="toast" aria-live="polite">{status}</p>
    </form>
  );
}

function TonightForm({ tonight, myMovies, library, onRate, onSkip }) {
  const { partnerName } = tonight;
  const chosen = tonight;
  const mine = findByTitle(myMovies, chosen.title)[0];
  const [tags, setTags] = useState(mine?.tags ?? []);
  const [loved, setLoved] = useState(mine?.loved ?? false);
  const [error, setError] = useState(null);

  return (
    <form
      className="home-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (tags.length === 0 && !loved) {
          setError("Pick a tag or ★ Loved it.");
          return;
        }
        onRate({ tags, loved });
      }}
    >
      <div className="tonight">
        <p className="eyebrow">Movie Night with {partnerName}</p>
        <p className="tonight-title">{chosen.title}</p>
        {infoLine(chosen.info) && <p className="row-meta">{infoLine(chosen.info)}</p>}
        {chosen.info?.plot && <p className="tonight-plot">{chosen.info.plot}</p>}
      </div>
      <div className="home-tags">
        <TagChoices
          legend="How did you feel?"
          library={library}
          selected={tags}
          onChange={(next) => {
            setTags(next);
            setError(null);
          }}
          loved={loved}
          onLovedChange={(next) => {
            setLoved(next);
            setError(null);
          }}
        />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="home-actions">
        <button type="submit" className="btn btn-primary">Mark as watched</button>
        <button type="button" className="link-button" onClick={onSkip}>Log a different movie</button>
      </div>
    </form>
  );
}

export function HomeView({ tonight, myMovies, knownTitles, library, prefill, onWatched, onWatchlist, onRate, onSkipTonight }) {
  const showTonight = Boolean(tonight);
  return (
    <section className="view view-home" aria-labelledby="home-heading">
      <div className="view-inner view-narrow">
        <header className="view-header">
          <h1 id="home-heading" className="view-title" tabIndex={-1}>{showTonight ? "Tonight’s movie" : "Just finished a movie?"}</h1>
          <p className="view-lead">
            {showTonight ? "Watched it? Tag how it felt." : "Log it, or save it to watch later."}
          </p>
        </header>
        {showTonight ? (
          <TonightForm
            key={tonight.key}
            tonight={tonight}
            myMovies={myMovies}
            library={library}
            onRate={onRate}
            onSkip={onSkipTonight}
          />
        ) : (
          <LogForm key={prefill.at} myMovies={myMovies} knownTitles={knownTitles} library={library} prefill={prefill.title} onWatched={onWatched} onWatchlist={onWatchlist} />
        )}
      </div>
    </section>
  );
}
