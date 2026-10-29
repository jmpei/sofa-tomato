// Sofa Tomato UI: a one-screen app. The top bar switches views; nothing on
// the page itself scrolls. React and ReactDOM come from <script> tags (UMD
// globals), because a published artifact cannot use ES-module imports from a CDN.
import {
  createMovie, markWatched, readMovie, movieBody, findByTitle, tagLibrary, recordWatched,
  newSamples, infoPrompt, readInfo, connection, readLink, readSide, claudeSide, deriveNight,
  CLAUDE_ID, DEFAULT_RELATION,
} from "./core.js";
import { connect, paths } from "./runtime.js";
import { GuessContext, makeGuesser } from "./complete.jsx";
import { HomeView, useFlash } from "./home.jsx";
import { MoviesView, EditSheet } from "./movies.jsx";
import { NightView, NightDialog, PeopleView, Tutorial, needsYou } from "./night.jsx";
import { SPIN_TOTAL_MS } from "./slot.jsx";

const { useState, useEffect, useMemo, useRef } = React;

const TUTORIAL_KEY = "sofatomato:tutorial-seen";
// Home asks you to tag tonight's movie for this long after the pop-up.
const TONIGHT_MS = 24 * 60 * 60 * 1000;

// ---------- Data hooks ----------

function useRuntime() {
  const [runtime, setRuntime] = useState(null);
  useEffect(() => {
    let live = true;
    connect().then((r) => live && setRuntime(r));
    return () => {
      live = false;
    };
  }, []);
  return runtime;
}

// Several collections, live: { [path]: DocumentSnapshot[] }. A path is
// missing from the result until its first snapshot arrives.
function useCollections(db, pathList) {
  const key = pathList.join("|");
  const [byPath, setByPath] = useState({});
  useEffect(() => {
    if (!db || !key) return undefined;
    const unsubscribes = key.split("|").map((path) =>
      db.collection(path).onSnapshot(
        (snap) => setByPath((prev) => ({ ...prev, [path]: snap.docs })),
        () => setByPath((prev) => ({ ...prev, [path]: [] }))
      )
    );
    return () => unsubscribes.forEach((u) => u());
  }, [db, key]);
  return byPath;
}

// Display names for ids. Only ids are stored; names are looked up each time.
function useNames(user, ids) {
  const key = [...new Set(ids)].filter((id) => id !== CLAUDE_ID).sort().join(",");
  const [names, setNames] = useState({});
  useEffect(() => {
    if (!user || !key) return undefined;
    let live = true;
    user
      .profiles(key.split(","))
      .then((profiles) => {
        if (live) setNames(Object.fromEntries(Object.entries(profiles).map(([id, p]) => [id, p.name])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, key]);
  return (id) => (id === CLAUDE_ID ? "Claude" : names[id] || "Someone");
}

// Re-renders every half minute, so "waiting" presses expire on screen.
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

// Whether this viewer already let the page ask Claude. The first call asks
// for consent, so typing must never be that call: autocomplete waits for a
// grant made by a click (looking up details). Returns [granted, recheck].
function useSampleGranted(runtime) {
  const [granted, setGranted] = useState(false);
  const [checks, setChecks] = useState(0);
  const permissions = runtime?.permissions ?? null;
  const hasSample = Boolean(runtime?.sample);
  useEffect(() => {
    if (!permissions || !hasSample) return undefined;
    let live = true;
    permissions
      .state("sample")
      .then((state) => live && setGranted(state === "granted"))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [permissions, hasSample, checks]);
  return [granted, () => setChecks((n) => n + 1)];
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Without storage the tutorial just shows again next time.
  }
}

// When a click removes the focused control (a button that disappears), focus
// would fall to <body>; send it to the current view's heading instead. When
// focus left the page (claude.ai's own dialogs sit outside the frame), leave
// it there: pulling it back locks the viewer out of that dialog.
function useFocusRescue() {
  useEffect(() => {
    const onFocusOut = () =>
      requestAnimationFrame(() => {
        if (document.hasFocus() && document.activeElement === document.body) document.querySelector("main h1")?.focus({ preventScroll: true });
      });
    document.addEventListener("focusout", onFocusOut);
    return () => document.removeEventListener("focusout", onFocusOut);
  }, []);
}

// ---------- Top bar ----------

function TomatoMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="18" r="11" className="mark-fruit" />
      <path d="M16 8c-1.5-3-4-3.5-6-3 2 1 3 2 3.5 3.5-2-.5-4 0-5.5 1.5 3 0 5 .5 6.5 1.5L16 9l1.5 2.5c1.5-1 3.5-1.5 6.5-1.5-1.5-1.5-3.5-2-5.5-1.5.5-1.5 1.5-2.5 3.5-3.5-2-.5-4.5 0-6 3z" className="mark-leaf" />
    </svg>
  );
}

function TopBar({ view, onGo, nightBadge, onHelp }) {
  const navButton = (id, label, badge) => (
    <button type="button" className="nav-btn" aria-current={view === id ? "page" : undefined} onClick={() => onGo(id)}>
      {label}
      {badge && <span className="badge" aria-label="needs you" />}
    </button>
  );
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button type="button" className="brand" onClick={() => onGo("home")} aria-label="Sofa Tomato home">
          <TomatoMark />
          <span className="brand-name">Sofa Tomato</span>
        </button>
        <nav className="nav" aria-label="Main">
          {navButton("night", "Movie Night", nightBadge)}
          {navButton("movies", "Movies")}
          {navButton("people", "People")}
          <button type="button" className="icon-btn" aria-label="How it works" onClick={onHelp}>?</button>
        </nav>
      </div>
    </header>
  );
}

// ---------- App ----------

export default function App() {
  const runtime = useRuntime();
  const db = runtime?.db ?? null;
  const me = runtime?.me ?? null;
  const shared = runtime?.mode === "shared";
  const now = useNow();
  const [sampleGranted, recheckSample] = useSampleGranted(runtime);
  const readOnly = runtime?.canWrite === false;
  useFocusRescue();

  const [view, setView] = useState("home");
  const [prefill, setPrefill] = useState({ title: "", at: 0 });
  const [tonightFor, setTonightFor] = useState(null);
  const [skipped, setSkipped] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [lookingUp, setLookingUp] = useState(() => new Set());
  const [tutorialOpen, setTutorialOpen] = useState(() => !readFlag(TUTORIAL_KEY));
  const [notice, setNotice] = useState("");
  const [readOnlySeen, setReadOnlySeen] = useState(false);
  const [status, flash] = useFlash();
  const editOpener = useRef(null);

  // My own links and nights (Claude's live here too, so they work on this
  // device alone); everyone on the page only when the page is shared.
  const mine = useCollections(db, me ? [paths.linksFrom(me), paths.nightsFrom(me)] : []);
  const roster = useCollections(shared ? db : null, [paths.members]);
  const myLinks = Object.fromEntries((mine[paths.linksFrom(me)] ?? []).map((d) => [d.id, readLink(d.data())]));
  const people = useMemo(() => {
    const ids = new Set((roster[paths.members] ?? []).map((d) => d.id));
    if (shared) Object.keys(myLinks).forEach((id) => ids.add(id));
    ids.delete(me);
    ids.delete(CLAUDE_ID);
    return [...ids].sort();
  }, [roster[paths.members], mine[paths.linksFrom(me)], me, shared]);
  const incoming = useCollections(shared ? db : null, people.map(paths.linksFrom));
  const theirLinks = Object.fromEntries(
    people.map((id) => [id, readLink((incoming[paths.linksFrom(id)] ?? []).find((d) => d.id === me)?.data())])
  );
  const links = { mine: myLinks, theirs: theirLinks };
  const humans = people.filter((id) => connection(myLinks[id], theirLinks[id]) === "connected");
  const partners = [...humans, CLAUDE_ID];

  // Movies: mine and my partners'. Claude has none and likes them all.
  const movieDocs = useCollections(db, me ? [me, ...humans].map(paths.movies) : []);
  const logs = Object.fromEntries(
    Object.entries(movieDocs).map(([path, docs]) => [path.split("/")[1], docs.map((d) => readMovie(d.id, d.data())).filter(Boolean)])
  );
  logs[CLAUDE_ID] = [];
  const myMovies = logs[me] ?? [];
  const library = useMemo(() => tagLibrary(myMovies.filter((m) => m.status === "watched")), [movieDocs[paths.movies(me)]]);
  const knownTitles = [...new Set(Object.values(logs).flat().map((m) => m.title))];
  const nameOf = useNames(runtime?.user ?? null, [...people, ...myMovies.flatMap((m) => m.watchedWith.map((w) => w.with))]);

  // Movie Night: both sides of each pair, worked out the same way on both pages.
  const partnerNights = useCollections(shared ? db : null, humans.map(paths.nightsFrom));
  const myNightRaw = Object.fromEntries((mine[paths.nightsFrom(me)] ?? []).map((d) => [d.id, d.data()]));
  const nights = {};
  const sides = {};
  for (const p of partners) {
    sides[p] = readSide(myNightRaw[p]);
    const theirs = p === CLAUDE_ID ? claudeSide(sides[p]) : readSide((partnerNights[paths.nightsFrom(p)] ?? []).find((d) => d.id === me)?.data());
    const loaded =
      mine[paths.nightsFrom(me)] !== undefined && logs[me] !== undefined &&
      (p === CLAUDE_ID || (partnerNights[paths.nightsFrom(p)] !== undefined && logs[p] !== undefined));
    nights[p] = deriveNight({ me, partner: p, mine: sides[p], theirs, logs, now, loaded });
  }

  // Every write goes through here, so a refused or failed write is visible.
  // Resolves true when the write landed.
  const save = (promise) =>
    promise.then(
      () => true,
      (e) => {
        setNotice(
          e?.code === "quota_exceeded"
            ? "That change was not saved: storage is full."
            : "That change was not saved. You may only have view access to this page, or the connection dropped."
        );
        return false;
      }
    );

  // Register once, so the people this page is shared with can find me. The
  // viewer didn't ask for this write, so a refusal (view access) stays quiet.
  useEffect(() => {
    if (!shared || readOnly) return;
    const ref = db.doc(paths.member(me));
    ref
      .get()
      .then((snap) => (snap.exists ? null : ref.set({ joinedAt: Date.now() })))
      .catch(() => {});
  }, [shared, readOnly, db, me]);

  const guessSample = sampleGranted ? runtime?.sample : null;
  const guessers = useMemo(
    () => ({ title: makeGuesser(guessSample, "title"), tag: makeGuesser(guessSample, "tag") }),
    [guessSample]
  );

  // ---------- Movies ----------

  const writeMovie = (movie) => {
    if (!db) {
      setNotice("Sofa Tomato is still loading. Try again in a moment.");
      return Promise.resolve(false);
    }
    return save(db.doc(paths.movie(me, movie.id)).set(movieBody(movie)));
  };

  // Asks Claude for year, runtime, rating, plot, director and stars.
  const lookUp = (movie) => {
    const sample = runtime?.sample;
    if (!sample) return;
    setLookingUp((prev) => new Set(prev).add(movie.id));
    sample
      .json(infoPrompt(movie.title), { modelTier: "quick" })
      // The movie may have been deleted meanwhile; then there is nothing to update.
      .then((raw) => db.doc(paths.movie(me, movie.id)).update({ info: readInfo(raw) }).catch(() => {}))
      .catch((e) => {
        flash(e?.code === "not_granted" ? "Details need your OK to ask Claude." : "Couldn’t get details right now. Try again later.");
      })
      .finally(() => {
        setLookingUp((prev) => {
          const next = new Set(prev);
          next.delete(movie.id);
          return next;
        });
        // The viewer may have just allowed Claude; autocomplete can use it now.
        recheckSample();
      });
  };

  const addAndLookUp = (movie) => {
    writeMovie(movie).then((ok) => {
      if (ok && !movie.info) lookUp(movie);
    });
    return movie;
  };

  // A title already in my movies is updated, not added twice.
  const handleWatched = ({ title, tags, loved }) => {
    const existing = findByTitle(myMovies, title)[0];
    if (existing) return addAndLookUp(markWatched(existing, { tags, loved }));
    return addAndLookUp(createMovie({ title, status: "watched", tags, loved }));
  };

  const handleWatchlist = ({ title }) => {
    const existing = findByTitle(myMovies, title)[0];
    return addAndLookUp({ ...createMovie({ title: existing?.title ?? title, status: "watchlist" }), info: existing?.info ?? null });
  };

  const handleAddSamples = () => {
    const added = newSamples(myMovies);
    added.forEach(writeMovie);
    flash(added.length === 0 ? "All sample movies are already here." : `Added ${added.length} sample movies.`);
  };

  const openEdit = (movie, opener) => {
    editOpener.current = opener;
    setEditing(movie);
  };
  const closeEdit = () => {
    setEditing(null);
    // Back to the Edit button that opened the sheet, or the list if it's gone.
    requestAnimationFrame(() => (editOpener.current?.isConnected ? editOpener.current : document.getElementById("search-input"))?.focus());
  };

  // ---------- Movie Night, for one partner ----------

  const writeSide = (p, patch) => save(db.doc(paths.night(me, p)).set({ ...sides[p], ...patch }));
  // Keeps tonight's movie on my side, so home can ask me to tag it.
  const keepTonight = (p) => {
    const night = nights[p];
    const { title, ownerId, info } = night.chosen;
    return writeSide(p, { seen: night.key, tonight: { key: night.key, title, ownerId, info, at: Date.now() } });
  };
  const makeNightActions = (p) => {
    const night = nights[p];
    const side = sides[p];
    return {
      press: () => writeSide(p, { ready: { at: Date.now(), after: night.nextAfter } }),
      cancel: () => writeSide(p, { ready: null }),
      answer: (value) => writeSide(p, { answer: { session: night.key, title: night.pick.title, ownerId: night.pick.ownerId, value } }),
      pass: () => {
        const before = side.passed?.session === night.key ? side.passed.titles : [];
        return writeSide(p, { passed: { session: night.key, titles: [...before, night.pick.title] } });
      },
      end: () => writeSide(p, { ended: night.key }),
      // Ends this night and presses again: the partner sees "your turn",
      // and Claude spins straight away.
      startOver: () => writeSide(p, { ended: night.key, ready: { at: Date.now(), after: night.key } }),
    };
  };

  // Tonight's movie for home: the one I chose to tag, or the newest untagged one.
  const pending = partners.filter((p) => {
    const t = sides[p].tonight;
    return t && sides[p].rated !== t.key && now - t.at < TONIGHT_MS && !skipped.has(t.key);
  });
  const tonightPartner = pending.includes(tonightFor) ? tonightFor : pending[0] ?? null;
  const tonight = tonightPartner ? { ...sides[tonightPartner].tonight, partnerName: nameOf(tonightPartner) } : null;
  const skipTonight = () => setSkipped((prev) => new Set(prev).add(tonight.key));

  const logTonight = (p) => {
    const night = nights[p];
    if (night.status === "chosen" && sides[p].tonight?.key !== night.key) keepTonight(p);
    const key = night.key;
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setTonightFor(p);
    setView("home");
  };

  const handleRate = ({ tags, loved }) => {
    const p = tonightPartner;
    const t = sides[p].tonight;
    const movie = recordWatched(myMovies, { title: t.title, tags, loved, partnerId: p, info: t.info });
    writeMovie(movie).then((ok) => {
      if (ok) writeSide(p, { rated: t.key });
    });
    flash(`Marked ${t.title} as watched with ${nameOf(p)}.`);
  };

  // The pop-up waits for the reels to stop.
  const popupPartner = partners.find((p) => nights[p].status === "chosen" && !nights[p].seen) ?? null;
  const popupKey = popupPartner ? nights[popupPartner].key : null;
  const [popupReady, setPopupReady] = useState(null);
  useEffect(() => {
    if (!popupKey) return undefined;
    const timer = setTimeout(() => setPopupReady(popupKey), SPIN_TOTAL_MS + 300);
    return () => clearTimeout(timer);
  }, [popupKey]);
  const showPopup = popupKey !== null && popupReady === popupKey;
  const nightBadge = partners.some((p) => needsYou(nights[p], me));

  // ---------- People ----------

  const linkRef = (id) => db.doc(paths.link(me, id));
  const relationOf = (id) => myLinks[id]?.relation ?? DEFAULT_RELATION;
  const peopleActions = {
    request: (id) => save(linkRef(id).set({ want: true, at: Date.now(), relation: relationOf(id) })),
    // Declining or disconnecting also ends any night in progress.
    decline: (id) => {
      if (nights[id]?.key) writeSide(id, { ended: nights[id].key });
      return save(linkRef(id).set({ want: false, at: Date.now(), relation: relationOf(id) }));
    },
    withdraw: (id) => save(linkRef(id).delete()),
    setRelation: (id, relation) =>
      save(linkRef(id).set({ want: true, at: myLinks[id]?.at ?? Date.now(), relation })),
  };

  let notices = notice;
  if (!notices && readOnly && !readOnlySeen) notices = "You have view access, so you can look around but nothing you add is saved. Ask the owner for access to log movies.";
  if (!notices && runtime?.storageBlocked) notices = "This browser blocks storage, so your movies will be lost when you close the page.";

  return (
    <GuessContext.Provider value={guessers}>
      <div className="app">
        <TopBar view={view} onGo={setView} nightBadge={nightBadge} onHelp={() => setTutorialOpen(true)} />
        {notices && (
          <div className="notice" role="alert">
            <p>{notices}</p>
            <button type="button" className="link-button" onClick={() => {
                setNotice("");
                setReadOnlySeen(true);
              }}>Dismiss</button>
          </div>
        )}
        <main className="main">
          {view === "home" && (
            <HomeView
              tonight={tonight}
              myMovies={myMovies}
              knownTitles={knownTitles}
              library={library}
              prefill={prefill}
              onWatched={handleWatched}
              onWatchlist={handleWatchlist}
              onRate={handleRate}
              onSkipTonight={skipTonight}
            />
          )}
          {view === "movies" && (
            <MoviesView
              movies={myMovies}
              loaded={logs[me] !== undefined}
              library={library}
              nameOf={nameOf}
              lookingUp={lookingUp}
              canLookUp={Boolean(runtime?.sample)}
              onLookUp={lookUp}
              onEdit={openEdit}
              onWatchedIt={(movie) => {
                // A movie picked from the watchlist wins over tonight's.
                if (tonight) skipTonight();
                setPrefill({ title: movie.title, at: Date.now() });
                setView("home");
              }}
              onAddSamples={handleAddSamples}
              status={status}
            />
          )}
          {view === "night" && (
            <NightView
              me={me}
              partners={partners}
              nights={nights}
              logs={logs}
              nameOf={nameOf}
              makeActions={makeNightActions}
              onLogTonight={logTonight}
              onAddSomeone={() => setView("people")}
            />
          )}
          {view === "people" && (
            <PeopleView mode={runtime?.mode ?? "solo"} people={people} links={links} logs={logs} nameOf={nameOf} actions={peopleActions} />
          )}
        </main>
        {view !== "movies" && <p className="toast" aria-live="polite">{status}</p>}
      </div>

      <EditSheet
        key={editing?.id ?? "closed"}
        movie={editing}
        library={library}
        onSave={(movie, change) => {
          writeMovie(markWatched(movie, change));
          flash(`Saved ${movie.title}.`);
          closeEdit();
        }}
        onDelete={(movie) => {
          save(db.doc(paths.movie(me, movie.id)).delete());
          flash(movie.status === "watched" ? `Deleted ${movie.title}.` : `Removed ${movie.title} from your watchlist.`);
          closeEdit();
        }}
        onClose={closeEdit}
      />
      <NightDialog
        night={showPopup ? nights[popupPartner] : null}
        partnerName={popupPartner ? nameOf(popupPartner) : ""}
        onClose={() => keepTonight(popupPartner)}
      />
      <Tutorial
        open={tutorialOpen && !showPopup}
        onClose={() => {
          writeFlag(TUTORIAL_KEY);
          setTutorialOpen(false);
        }}
      />
    </GuessContext.Provider>
  );
}
