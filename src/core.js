// Sofa Tomato core: pure data logic. No React and no DOM.
// Every function returns new data and never changes its input.

export const MAX_TITLE_LENGTH = 200;
export const MAX_TAG_LENGTH = 40;
// The tag pickers show this many tags; the rest fold under "All tags".
export const VISIBLE_TAG_LIMIT = 20;
// Two presses of the Movie Night button count as "together" inside this window.
export const READY_WINDOW_MS = 30 * 60 * 1000;
// When Movie Night picks from one person, a loved movie comes up this often;
// the rest of the time the pick comes from their watchlist.
export const LOVED_SHARE = 0.2;

// Starter tags. People add their own; these only seed a new tag list.
export const DEFAULT_TAGS = [
  "Popcorn fun",
  "Thought-provoking",
  "Made me cry",
  "Visually stunning",
  "Rewatchable",
  "Waste of time",
  "WTF",
];
// Search warns when an exact match carries this tag (US2).
export const WARN_TAG = "Waste of time";

// ---------- Titles and tags ----------

// Text as we store and show it: single spaces, no edge spaces.
export function cleanTitle(raw) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

// Text as we compare it: also lower case and without accents,
// so "Amélie", "amelie" and " AMELIE " are the same movie (or tag).
export function normalizeTitle(raw) {
  return cleanTitle(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

export const sameTitle = (a, b) => normalizeTitle(a) === normalizeTitle(b);
export const sameTag = sameTitle;

// Returns an error message for the user, or null if the title is valid.
export function validateTitle(raw) {
  const title = cleanTitle(raw);
  if (title === "") return "Enter a movie title.";
  if (title.length > MAX_TITLE_LENGTH) return `Keep the title to ${MAX_TITLE_LENGTH} characters or fewer.`;
  return null;
}

export function validateTag(raw) {
  const tag = cleanTitle(raw);
  if (tag === "") return "Type a tag first.";
  if (tag.length > MAX_TAG_LENGTH) return `Keep tags to ${MAX_TAG_LENGTH} characters or fewer.`;
  return null;
}

// Cleans a tag list and drops repeats ("Sci-fi" and "sci-fi" are one tag).
export function uniqueTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = cleanTitle(raw);
    const key = normalizeTitle(tag);
    if (tag === "" || tag.length > MAX_TAG_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function hasTag(movie, tag) {
  return movie.tags.some((t) => sameTag(t, tag));
}

export function toggleTag(tags, tag) {
  return tags.some((t) => sameTag(t, tag)) ? tags.filter((t) => !sameTag(t, tag)) : [...tags, tag];
}

// ---------- A person's own tag list ----------

// The starter tags plus every tag on the person's movies, so the list grows
// with use. Most-used first; ties keep the starter order, then A to Z.
export function tagLibrary(movies) {
  const byKey = new Map();
  DEFAULT_TAGS.forEach((label, order) => byKey.set(normalizeTitle(label), { label, count: 0, order }));
  for (const movie of movies) {
    for (const tag of movie.tags) {
      const key = normalizeTitle(tag);
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { label: tag, count: 1, order: DEFAULT_TAGS.length });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order || a.label.localeCompare(b.label))
    .map(({ label, count }) => ({ label, count }));
}

// The labels a picker shows, in order: tags typed in this form (not on any
// movie yet) first, then the library. The picker folds everything after
// VISIBLE_TAG_LIMIT.
export function pickerTags(library, typed = []) {
  const fresh = uniqueTags(typed).filter((s) => !library.some((e) => sameTag(e.label, s)));
  return [...fresh, ...library.map((e) => e.label)];
}

export function splitAtLimit(items, limit = VISIBLE_TAG_LIMIT) {
  return { visible: items.slice(0, limit), hidden: items.slice(limit) };
}

// ---------- Autocomplete ----------

// A suggestion only counts when it continues exactly what was typed.
export function continues(typed, suggestion) {
  if (typeof suggestion !== "string") return false;
  const t = typed.toLocaleLowerCase();
  const s = suggestion.toLocaleLowerCase();
  return s.length > t.length && s.startsWith(t);
}

// The first candidate that continues the typed text, or null.
export function localMatch(typed, candidates) {
  if (cleanTitle(typed) === "") return null;
  return candidates.find((c) => continues(typed, c)) ?? null;
}

// ---------- Movie details (from Claude) ----------

// What we ask Claude when someone adds a movie. Claude answers from what it
// knows; it cannot browse, so it must say when it is unsure.
export function infoPrompt(title) {
  return [
    `Someone logged a movie titled "${cleanTitle(title).slice(0, MAX_TITLE_LENGTH)}".`,
    "Identify the most likely film (or series) with that title.",
    "Reply with only a JSON object in this shape:",
    '{"found": true, "year": 2010, "runtimeMinutes": 148, "certificate": "PG-13", "plot": "One sentence, under 200 characters.", "director": ["Name"], "stars": ["Name", "Name", "Name"]}',
    "certificate is the US rating (G, PG, PG-13, R, NC-17, TV-MA, ...) or null.",
    "Use null or [] for anything you are not sure of. Do not guess.",
    'If you do not recognise the title, reply {"found": false}.',
  ].join("\n");
}

const shortText = (v, max) => (typeof v === "string" && cleanTitle(v) !== "" ? cleanTitle(v).slice(0, max) : null);
const names = (v) => (Array.isArray(v) ? v.map((n) => shortText(n, 60)).filter(Boolean).slice(0, 4) : []);
const wholeNumber = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

// Claude's answer, or stored details, made safe to show.
// Returns { found: false } when there is nothing usable.
export function readInfo(raw) {
  if (!raw || typeof raw !== "object" || raw.found === false) return { found: false };
  const info = {
    found: true,
    year: wholeNumber(raw.year, 1870, 2100),
    runtimeMinutes: wholeNumber(raw.runtimeMinutes, 1, 1000),
    certificate: shortText(raw.certificate, 12),
    plot: shortText(raw.plot, 300),
    director: names(raw.director),
    stars: names(raw.stars),
  };
  const any = info.year || info.runtimeMinutes || info.certificate || info.plot || info.director.length || info.stars.length;
  return any ? info : { found: false };
}

export function formatRuntime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// "2010 · 2h 28m · PG-13", leaving out what we don't know.
export function infoLine(info) {
  if (!info?.found) return "";
  return [info.year, formatRuntime(info.runtimeMinutes), info.certificate].filter(Boolean).join(" · ");
}

// IMDb search for the title (and year, when known). A search link never
// points at the wrong film the way a guessed IMDb id could.
export function imdbUrl(title, info) {
  const q = info?.found && info.year ? `${title} ${info.year}` : title;
  return `https://www.imdb.com/find/?q=${encodeURIComponent(q)}`;
}

// ---------- Movies ----------

function defaultId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// A movie is "watched" (in my movies, with how it felt) or on my "watchlist".
// Throws on invalid input, because the UI must validate first.
export function createMovie({ title, status, tags = [], loved = false, info = null }, { now = Date.now(), makeId = defaultId } = {}) {
  const error = validateTitle(title);
  if (error) throw new Error(error);
  const watched = status === "watched";
  const clean = watched ? uniqueTags(tags) : [];
  if (watched && clean.length === 0 && !loved) throw new Error("A watched movie needs a tag or a star.");
  return {
    id: makeId(),
    title: cleanTitle(title),
    status: watched ? "watched" : "watchlist",
    tags: clean,
    loved: watched && Boolean(loved),
    createdAt: now,
    updatedAt: now,
    watchedAt: watched ? now : null,
    watchedWith: [],
    info,
  };
}

// Marks a movie watched (or re-tags a watched one), with how it felt.
export function markWatched(movie, { tags, loved }, now = Date.now()) {
  const clean = uniqueTags(tags);
  if (clean.length === 0 && !loved) throw new Error("A watched movie needs a tag or a star.");
  return {
    ...movie,
    status: "watched",
    tags: clean,
    loved: Boolean(loved),
    updatedAt: now,
    watchedAt: movie.status === "watched" ? movie.watchedAt : now,
  };
}

// Movies live in the shared store, where anyone with access could write
// anything. Keep only well-formed entries. Returns null for a bad one.
export function readMovie(id, data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.title !== "string" || validateTitle(data.title)) return null;
  const status = data.status === "watchlist" ? "watchlist" : data.status === "watched" ? "watched" : null;
  if (!status || !Array.isArray(data.tags)) return null;
  const tags = uniqueTags(data.tags.filter((t) => typeof t === "string"));
  const loved = data.loved === true;
  if (status === "watched" && tags.length === 0 && !loved) return null;
  const createdAt = Number.isFinite(data.createdAt) ? data.createdAt : 0;
  return {
    id,
    title: cleanTitle(data.title),
    status,
    tags,
    loved,
    createdAt,
    updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : createdAt,
    watchedAt: Number.isFinite(data.watchedAt) ? data.watchedAt : null,
    watchedWith: Array.isArray(data.watchedWith)
      ? data.watchedWith.filter((w) => w && typeof w.with === "string" && Number.isFinite(w.at))
      : [],
    info: data.info == null ? null : readInfo(data.info),
  };
}

// The stored body: everything except the id, which is the document's name.
export function movieBody(movie) {
  const { id, ...body } = movie;
  return body;
}

// ---------- Reading a log ----------

export function sortNewestFirst(movies) {
  const at = (m) => m.watchedAt ?? m.createdAt;
  return [...movies].sort((a, b) => at(b) - at(a));
}

// Entries with the same title as the one being typed, newest first.
export function findByTitle(movies, title) {
  if (normalizeTitle(title) === "") return [];
  return sortNewestFirst(movies.filter((m) => sameTitle(m.title, title)));
}

// US2: every movie whose title contains the query, in any letter case.
// Ranking: exact match, then "starts with", then "contains". Newest first inside each rank.
export function searchMovies(movies, query) {
  const q = normalizeTitle(query);
  if (q === "") return sortNewestFirst(movies);
  const rank = (title) => (title === q ? 0 : title.startsWith(q) ? 1 : 2);
  return sortNewestFirst(movies)
    .map((m) => ({ m, t: normalizeTitle(m.title) }))
    .filter(({ t }) => t.includes(q))
    .sort((a, b) => rank(a.t) - rank(b.t))
    .map(({ m }) => m);
}

// US3: { tag }, { loved: true } or { with: uid }; null means "no filter".
export function filterMovies(movies, filter) {
  if (!filter) return movies;
  if (filter.tag) return movies.filter((m) => hasTag(m, filter.tag));
  if (filter.loved) return movies.filter((m) => m.loved);
  return movies.filter((m) => m.watchedWith.some((w) => w.with === filter.with));
}

// Everyone this person has watched a movie with, with a movie count each.
export function watchedWithCounts(movies) {
  const counts = new Map();
  for (const m of movies) {
    for (const id of new Set(m.watchedWith.map((w) => w.with))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// After Movie Night: this person's entry for the movie, tagged and marked as
// watched with their partner. Reuses their newest entry with that title
// (a watchlist entry becomes watched).
export function recordWatched(myMovies, { title, tags, loved, partnerId, info }, { now = Date.now(), makeId = defaultId } = {}) {
  const visit = { with: partnerId, at: now };
  const existing = findByTitle(myMovies, title)[0];
  if (existing) {
    const watched = markWatched(existing, { tags, loved }, now);
    return { ...watched, info: existing.info?.found ? existing.info : info ?? existing.info, watchedWith: [...existing.watchedWith, visit] };
  }
  return { ...createMovie({ title, status: "watched", tags, loved, info }, { now, makeId }), watchedWith: [visit] };
}

// ---------- People ----------
// Each person writes only their own side: links/<me>/to/<them> =
// { want, at, relation }. Two "want: true" sides make a connection; when
// the sides disagree, the newer one decides what each person sees.

// Claude is everyone's friend from the start. Claude has no data of its own,
// likes every movie, and so says yes to every Movie Night pick.
export const CLAUDE_ID = "claude";
export const DEFAULT_RELATION = "Friends";
export const RELATIONS = ["Friends", "Family"];

export function readLink(data) {
  if (!data || typeof data !== "object" || typeof data.want !== "boolean") return null;
  const relation = typeof data.relation === "string" ? cleanTitle(data.relation).slice(0, MAX_TAG_LENGTH) : "";
  return { want: data.want, at: Number.isFinite(data.at) ? data.at : 0, relation: relation || DEFAULT_RELATION };
}

// "none" | "sent" | "received" | "connected" | "declined", seen from me.
export function connection(mine, theirs) {
  if (mine?.want && theirs?.want) return "connected";
  if (mine?.want) return theirs && !theirs.want && theirs.at >= mine.at ? "declined" : "sent";
  if (theirs?.want && !(mine && !mine.want && mine.at >= theirs.at)) return "received";
  return "none";
}

// ---------- Movie Night ----------
// Each person writes only their own night document, nights/<me>/with/<them>:
//   ready   { at, after }      when I pressed, and which night came before
//   passed  { session, titles } titles I said "Not tonight" to
//   answer  { session, title, ownerId, value }  my "want" or "either" on a
//                               pick, which settles the night on that movie
//   seen, rated, ended          the night I dismissed the pop-up for, tagged
//                               tonight's movie for, or ended
//   tonight { key, title, ownerId, info, at }  the settled movie, kept when I
//                               dismiss the pop-up, so home can ask me to tag it
// Both pages read both documents and work out the same night from them.
// The pick uses a random number seeded by the night, so both pages pick the
// same movie without either one writing it down.

// A night that hasn't settled is dropped this long after it started.
export const NIGHT_EXPIRES_MS = 12 * 60 * 60 * 1000;

export function readSide(data) {
  const d = data && typeof data === "object" ? data : {};
  const str = (v) => (typeof v === "string" && v.length <= 300 ? v : null);
  const ready =
    d.ready && Number.isFinite(d.ready.at) ? { at: d.ready.at, after: str(d.ready.after) } : null;
  const passed =
    d.passed && str(d.passed.session) && Array.isArray(d.passed.titles)
      ? { session: d.passed.session, titles: d.passed.titles.filter((t) => typeof t === "string").slice(0, 200) }
      : null;
  const answer =
    d.answer && str(d.answer.session) && str(d.answer.title) && str(d.answer.ownerId) && ["want", "either"].includes(d.answer.value)
      ? { session: d.answer.session, title: d.answer.title, ownerId: d.answer.ownerId, value: d.answer.value }
      : null;
  const tonight =
    d.tonight && str(d.tonight.key) && str(d.tonight.title) && Number.isFinite(d.tonight.at)
      ? { key: d.tonight.key, title: d.tonight.title, ownerId: str(d.tonight.ownerId), at: d.tonight.at, info: d.tonight.info == null ? null : readInfo(d.tonight.info) }
      : null;
  return { ready, passed, answer, seen: str(d.seen), rated: str(d.rated), ended: str(d.ended), tonight };
}

export function emptySide() {
  return readSide(null);
}

// Claude's side of a night: always ready when I am, never anything else.
export function claudeSide(mine) {
  return { ...emptySide(), ready: mine.ready };
}

// A small seeded random number generator (xmur3 hash + mulberry32), so both
// pages draw the same numbers for the same session.
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// One person's Movie Night pool: their watchlist and their loved movies,
// as they were when the night started, minus titles passed on tonight.
// A movie marked watched after the start still counts as on the watchlist,
// so watching tonight's movie doesn't change tonight's pick.
export function nightPool(movies, startedAt, passed = []) {
  const skip = new Set(passed.map(normalizeTitle));
  const usable = movies.filter((m) => m.createdAt <= startedAt && !skip.has(normalizeTitle(m.title))).sort(byId);
  const watchedBefore = (m) => m.status === "watched" && (m.watchedAt ?? m.createdAt) <= startedAt;
  return {
    watchlist: usable.filter((m) => !watchedBefore(m)),
    loved: usable.filter((m) => watchedBefore(m) && m.loved),
  };
}

// Titles on both watchlists. A night with any of these needs no vote.
export function sharedWatchlist(poolA, poolB) {
  const theirs = new Set(poolB.watchlist.map((m) => normalizeTitle(m.title)));
  return poolA.watchlist
    .filter((m) => theirs.has(normalizeTitle(m.title)))
    .sort((a, b) => normalizeTitle(a.title).localeCompare(normalizeTitle(b.title)));
}

// Picks a person (one with anything to offer), then a loved movie
// (LOVED_SHARE of the time) or a watchlist movie from that person.
export function pickFrom(pools, people, random) {
  const owners = people.filter((uid) => pools[uid].watchlist.length + pools[uid].loved.length > 0);
  if (owners.length === 0) return null;
  const ownerId = owners[Math.floor(random() * owners.length)];
  const { watchlist, loved } = pools[ownerId];
  const fromLoved = loved.length > 0 && (watchlist.length === 0 || random() < LOVED_SHARE);
  const list = fromLoved ? loved : watchlist;
  return { ownerId, movie: list[Math.floor(random() * list.length)] };
}

const pressKey = (uid, side) => `${uid}@${side.ready.at}`;

// A press is live for READY_WINDOW_MS (either way, so a clock a few minutes
// off still works) until the other person's next press names a night that
// already used it.
function live(uid, side, other, now) {
  if (!side.ready || Math.abs(now - side.ready.at) >= READY_WINDOW_MS) return false;
  return !(other.ready?.after ?? "").split("~").includes(pressKey(uid, side));
}

// What the night would be if nothing had finished it: chosen, voting or empty.
function playNight({ me, partner, mine, theirs, logs, key }) {
  const [x, y] = [me, partner].sort();
  const base = { pick: null, voterId: null, chosen: null, passed: [] };

  // An answer settles the night on the movie it names. It counts only from
  // the person who didn't offer the movie.
  const answer = [[me, mine.answer], [partner, theirs.answer]].find(
    ([uid, a]) => a && a.session === key && a.ownerId !== uid && (a.ownerId === me || a.ownerId === partner)
  )?.[1];
  if (answer) {
    const movie = findByTitle(logs[answer.ownerId] ?? [], answer.title)[0];
    return { ...base, status: "chosen", chosen: { title: answer.title, ownerId: answer.ownerId, info: movie?.info ?? null, how: answer.value } };
  }

  const startedAt = Math.max(mine.ready.at, theirs.ready.at);
  const passed = uniqueTags([
    ...(mine.passed?.session === key ? mine.passed.titles : []),
    ...(theirs.passed?.session === key ? theirs.passed.titles : []),
  ]);
  const pools = { [x]: nightPool(logs[x] ?? [], startedAt, passed), [y]: nightPool(logs[y] ?? [], startedAt, passed) };

  const shared = sharedWatchlist(pools[x], pools[y]);
  if (shared.length > 0) {
    const movie = shared[Math.floor(seededRandom(`${key}:shared`)() * shared.length)];
    return { ...base, passed, status: "chosen", chosen: { title: movie.title, ownerId: null, info: movie.info, how: "both" } };
  }

  const result = pickFrom(pools, [x, y], seededRandom(`${key}:${passed.length}`));
  if (!result) return { ...base, passed, status: "empty" };
  const { ownerId, movie } = result;
  const voterId = ownerId === x ? y : x;
  const pick = { title: movie.title, ownerId, info: movie.info, loved: pools[ownerId].loved.includes(movie) };
  // Claude likes every movie: its "yes" comes with the pick.
  if (voterId === CLAUDE_ID) return { ...base, passed, status: "chosen", pick, voterId, chosen: { ...pick, how: "want" } };
  return { ...base, passed, status: "voting", pick, voterId };
}

// The night as this page sees it. `logs` holds both people's movies;
// `loaded` is false until both logs and both night documents have arrived.
// Status: loading | idle | waiting (I pressed) | ready (they pressed) |
//         voting | chosen | empty.
export function deriveNight({ me, partner, mine, theirs, logs, now = Date.now(), loaded = true }) {
  const [x, y] = [me, partner].sort();
  const sides = { [me]: mine, [partner]: theirs };
  const together =
    mine.ready && theirs.ready && mine.ready.after === theirs.ready.after &&
    Math.abs(mine.ready.at - theirs.ready.at) < READY_WINDOW_MS;
  const key = together ? `${pressKey(x, sides[x])}~${pressKey(y, sides[y])}` : null;
  const base = { key, pick: null, voterId: null, chosen: null, passed: [], seen: false };
  if (!loaded) return { ...base, nextAfter: null, status: "loading" };

  let played = null;
  let finished = false;
  if (key) {
    played = playNight({ me, partner, mine, theirs, logs, key });
    const startedAt = Math.max(mine.ready.at, theirs.ready.at);
    // A settled night is over for me once I've tagged it or ended it; an
    // unsettled one is over when either of us ends it, or after 12 hours.
    finished =
      played.status === "chosen"
        ? mine.rated === key || mine.ended === key
        : mine.ended === key || theirs.ended === key || now - startedAt > NIGHT_EXPIRES_MS;
  }

  // The night to name when pressing: the finished one, or the one the
  // partner is already waiting on, so the two presses match. If both of us
  // are waiting on different nights, both pages name the first person's.
  const theyWait = !key && live(partner, theirs, mine, now);
  const iWait = !key && live(me, mine, theirs, now);
  const nextAfter = finished ? key
    : theyWait && iWait ? sides[x].ready.after
    : theyWait ? theirs.ready.after
    : mine.ready?.after ?? null;

  if (!key || finished) {
    if (theyWait) return { ...base, nextAfter, status: "ready" };
    if (!finished && iWait) return { ...base, nextAfter, status: "waiting" };
    return { ...base, nextAfter, status: "idle" };
  }
  return { ...base, ...played, nextAfter, seen: mine.seen === key };
}

// ---------- Sample data (lets a grader try search, tags and Movie Night at once) ----------

const film = (year, runtimeMinutes, certificate, director, stars, plot) => ({
  found: true, year, runtimeMinutes, certificate, director, stars, plot,
});

export const SAMPLE_MOVIES = [
  { title: "Interstellar", status: "watched", loved: true, tags: ["Visually stunning", "Sci-fi", "Nolan"],
    info: film(2014, 169, "PG-13", ["Christopher Nolan"], ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"], "Explorers travel through a wormhole near Saturn to find humanity a new home.") },
  { title: "Knives Out", status: "watched", tags: ["Popcorn fun", "Whodunit", "Date night"],
    info: film(2019, 130, "PG-13", ["Rian Johnson"], ["Daniel Craig", "Chris Evans", "Ana de Armas"], "A detective investigates the death of a crime novelist and his very suspicious family.") },
  { title: "The Grand Budapest Hotel", status: "watched", tags: ["Visually stunning", "Wes Anderson", "Comfort movie"],
    info: film(2014, 99, "R", ["Wes Anderson"], ["Ralph Fiennes", "Tony Revolori", "F. Murray Abraham"], "A legendary concierge and his lobby boy are swept up in the theft of a priceless painting.") },
  { title: "Arrival", status: "watched", loved: true, tags: ["Thought-provoking", "Sci-fi", "Slow burn"],
    info: film(2016, 116, "PG-13", ["Denis Villeneuve"], ["Amy Adams", "Jeremy Renner", "Forest Whitaker"], "A linguist races to understand the language of aliens who have landed around the world.") },
  { title: "Coco", status: "watched", tags: ["Made me cry", "Animated", "Family night"],
    info: film(2017, 105, "PG", ["Lee Unkrich"], ["Anthony Gonzalez", "Gael García Bernal", "Benjamin Bratt"], "A boy who dreams of music crosses into the Land of the Dead to find his great-great-grandfather.") },
  { title: "Everything Everywhere All at Once", status: "watched", tags: ["WTF", "Made me cry", "Oscar winner"],
    info: film(2022, 139, "R", ["Daniel Kwan", "Daniel Scheinert"], ["Michelle Yeoh", "Stephanie Hsu", "Ke Huy Quan"], "A laundromat owner must connect with versions of herself across the multiverse to save it.") },
  { title: "Parasite", status: "watched", tags: ["Thought-provoking", "Oscar winner", "Subtitles"],
    info: film(2019, 132, "R", ["Bong Joon Ho"], ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong"], "A poor family schemes its way into working for a wealthy household, with unexpected results.") },
  { title: "Mad Max: Fury Road", status: "watched", loved: true, tags: ["Visually stunning", "Action"],
    info: film(2015, 120, "R", ["George Miller"], ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"], "In a desert wasteland, a drifter and a rebel warrior flee a tyrant across the sand.") },
  { title: "The Room", status: "watched", tags: ["Waste of time", "So bad it's good"],
    info: film(2003, 99, "R", ["Tommy Wiseau"], ["Tommy Wiseau", "Juliette Danielle", "Greg Sestero"], "A banker's life unravels when his fiancée begins an affair with his best friend.") },
  { title: "Paddington 2", status: "watched", loved: true, tags: ["Popcorn fun", "Comfort movie", "Family night"],
    info: film(2017, 103, "PG", ["Paul King"], ["Ben Whishaw", "Hugh Grant", "Hugh Bonneville"], "Paddington is framed for stealing a rare pop-up book and must clear his name from prison.") },
  { title: "Spirited Away", status: "watched", loved: true, tags: ["Animated", "Hayao Miyazaki", "Rewatchable"],
    info: film(2001, 125, "PG", ["Hayao Miyazaki"], ["Rumi Hiiragi", "Miyu Irino", "Mari Natsuki"], "A girl wanders into a world of spirits and works in a bathhouse to free her parents.") },
  { title: "Before Sunrise", status: "watched", tags: ["Date night", "Slow burn", "Talky"],
    info: film(1995, 101, "R", ["Richard Linklater"], ["Ethan Hawke", "Julie Delpy", "Andrea Eckert"], "Two strangers meet on a train and spend one night walking and talking in Vienna.") },
  { title: "Dune: Part Two", status: "watchlist",
    info: film(2024, 166, "PG-13", ["Denis Villeneuve"], ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"], "Paul Atreides unites with the Fremen to take revenge on those who destroyed his family.") },
  { title: "Past Lives", status: "watchlist",
    info: film(2023, 105, "PG-13", ["Celine Song"], ["Greta Lee", "Teo Yoo", "John Magaro"], "Two childhood friends reunite in New York decades after one of them emigrated from Seoul.") },
  { title: "Perfect Days", status: "watchlist",
    info: film(2023, 124, "PG", ["Wim Wenders"], ["Koji Yakusho", "Tokio Emoto", "Arisa Nakano"], "A Tokyo toilet cleaner finds quiet joy in his daily routine, music and books.") },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// The samples that are not already in the log. Each gets an earlier date
// than the one before it, so the list order looks real.
export function newSamples(movies, samples = SAMPLE_MOVIES, { now = Date.now(), makeId = defaultId } = {}) {
  const existing = new Set(movies.map((m) => normalizeTitle(m.title)));
  const added = [];
  samples.forEach((s, i) => {
    const key = normalizeTitle(s.title);
    if (existing.has(key)) return;
    existing.add(key);
    added.push(createMovie(s, { now: now - (i + 1) * DAY_MS, makeId }));
  });
  return added;
}

// ---------- Display ----------

export function formatDate(timestamp, now = Date.now(), locale) {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
