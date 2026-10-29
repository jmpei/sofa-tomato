// Unit tests for src/core.js. Run with: node --test tests/core.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TAGS, MAX_TITLE_LENGTH, MAX_TAG_LENGTH, VISIBLE_TAG_LIMIT, READY_WINDOW_MS,
  cleanTitle, normalizeTitle, validateTitle, validateTag, uniqueTags, toggleTag,
  tagLibrary, pickerTags, splitAtLimit, continues, localMatch,
  readInfo, infoLine, formatRuntime, imdbUrl,
  createMovie, markWatched, readMovie, movieBody, findByTitle, searchMovies, filterMovies,
  watchedWithCounts, recordWatched, connection, readLink, CLAUDE_ID, NIGHT_EXPIRES_MS,
  readSide, emptySide, claudeSide, seededRandom, nightPool, sharedWatchlist, pickFrom, deriveNight,
  newSamples, SAMPLE_MOVIES,
} from "../src/core.js";

let counter = 0;
const makeId = () => `id-${String(++counter).padStart(4, "0")}`;
const watched = (title, tags, extra = {}) =>
  createMovie({ title, status: "watched", tags, ...extra }, { now: extra.now ?? 1, makeId });
const later = (title, now = 1) => createMovie({ title, status: "watchlist" }, { now, makeId });

describe("titles and tags", () => {
  test("cleanTitle collapses and trims spaces", () => {
    assert.equal(cleanTitle("  The   Grand\tBudapest  "), "The Grand Budapest");
  });

  test("normalizeTitle ignores case, spaces and accents", () => {
    assert.equal(normalizeTitle("  AMÉLIE "), normalizeTitle("amelie"));
  });

  test("validateTitle and validateTag allow exactly the limit", () => {
    assert.equal(validateTitle("   "), "Enter a movie title.");
    assert.equal(validateTitle("x".repeat(MAX_TITLE_LENGTH)), null);
    assert.match(validateTitle("x".repeat(MAX_TITLE_LENGTH + 1)), /200 characters or fewer/);
    assert.equal(validateTag("x".repeat(MAX_TAG_LENGTH)), null);
    assert.match(validateTag("x".repeat(MAX_TAG_LENGTH + 1)), /40 characters or fewer/);
  });

  test("uniqueTags cleans and drops repeats in any letter case", () => {
    assert.deepEqual(uniqueTags([" Sci-fi ", "sci-FI", "", "Date  night"]), ["Sci-fi", "Date night"]);
  });

  test("toggleTag adds a missing tag and removes a present one in any case", () => {
    assert.deepEqual(toggleTag(["WTF"], "Sci-fi"), ["WTF", "Sci-fi"]);
    assert.deepEqual(toggleTag(["WTF", "Sci-fi"], "sci-fi"), ["WTF"]);
  });
});

describe("tag list grows with use", () => {
  test("a new log starts with the starter tags", () => {
    assert.deepEqual(tagLibrary([]).map((e) => e.label), DEFAULT_TAGS);
  });

  test("tags the person typed join the list, most-used first", () => {
    const lib = tagLibrary([watched("A", ["Date night", "WTF"]), watched("B", ["date night"]), watched("C", ["Nolan"])]);
    assert.deepEqual(lib.slice(0, 3), [
      { label: "Date night", count: 2 },
      { label: "WTF", count: 1 },
      { label: "Nolan", count: 1 },
    ]);
  });

  test("the picker puts just-typed tags first and folds after the limit", () => {
    const items = pickerTags(tagLibrary([]), ["Brand new", "WTF"]);
    assert.equal(items[0], "Brand new");
    assert.equal(items.filter((t) => t === "WTF").length, 1);
    const { visible, hidden } = splitAtLimit(Array.from({ length: 25 }, (_, i) => `t${i}`));
    assert.equal(visible.length, VISIBLE_TAG_LIMIT);
    assert.equal(hidden.length, 5);
  });

  test("the samples make more than 20 tags, so the fold shows", () => {
    const samples = newSamples([], SAMPLE_MOVIES, { now: 0, makeId });
    assert.ok(tagLibrary(samples).length > VISIBLE_TAG_LIMIT);
  });
});

describe("autocomplete", () => {
  test("a suggestion must continue exactly what was typed", () => {
    assert.equal(continues("Resident", "Resident Evil"), true);
    assert.equal(continues("resident", "Resident Evil"), true);
    assert.equal(continues("Resident Evil", "Resident Evil"), false);
    assert.equal(continues("Zombie", "Horror"), false);
    assert.equal(continues("x", null), false);
  });

  test("localMatch returns the first candidate that continues the text", () => {
    assert.equal(localMatch("par", ["Arrival", "Parasite", "Paddington 2"]), "Parasite");
    assert.equal(localMatch("", ["Parasite"]), null);
    assert.equal(localMatch("zz", ["Parasite"]), null);
  });
});

describe("movie details from Claude", () => {
  test("readInfo keeps good fields and drops bad ones", () => {
    const info = readInfo({
      found: true, year: 2010, runtimeMinutes: 148, certificate: "PG-13",
      plot: "  A thief   steals secrets through dreams. ", director: ["Christopher Nolan", 7], stars: ["A", "B", "C", "D", "E"],
    });
    assert.deepEqual(info, {
      found: true, year: 2010, runtimeMinutes: 148, certificate: "PG-13",
      plot: "A thief steals secrets through dreams.", director: ["Christopher Nolan"], stars: ["A", "B", "C", "D"],
    });
    assert.equal(readInfo({ found: true, year: "2010", runtimeMinutes: -3 }).found, false);
    assert.deepEqual(readInfo({ found: false }), { found: false });
    assert.deepEqual(readInfo("nonsense"), { found: false });
  });

  test("infoLine and formatRuntime read like IMDb", () => {
    assert.equal(formatRuntime(94), "1h 34m");
    assert.equal(formatRuntime(120), "2h");
    assert.equal(formatRuntime(45), "45m");
    assert.equal(infoLine(readInfo({ year: 2004, runtimeMinutes: 94, certificate: "R" })), "2004 · 1h 34m · R");
    assert.equal(infoLine(null), "");
  });

  test("imdbUrl searches by title and year", () => {
    assert.equal(imdbUrl("Resident Evil", { found: true, year: 2002 }), "https://www.imdb.com/find/?q=Resident%20Evil%202002");
    assert.equal(imdbUrl("Amélie", null), "https://www.imdb.com/find/?q=Am%C3%A9lie");
  });
});

describe("watched and watchlist", () => {
  test("a watched movie needs a tag or a star; a watchlist movie needs neither", () => {
    assert.throws(() => createMovie({ title: "Coco", status: "watched", tags: [] }));
    assert.equal(createMovie({ title: "Coco", status: "watched", tags: [], loved: true }).loved, true);
    const saved = later("Dune");
    assert.deepEqual([saved.status, saved.tags, saved.loved, saved.watchedAt], ["watchlist", [], false, null]);
  });

  test("markWatched moves a watchlist entry to watched and keeps its details", () => {
    const saved = { ...later("Dune", 5), info: { found: true, year: 2024 } };
    const done = markWatched(saved, { tags: ["Epic"], loved: false }, 9);
    assert.equal(done.status, "watched");
    assert.equal(done.watchedAt, 9);
    assert.deepEqual(done.info, saved.info);
  });

  test("readMovie keeps a good document and rejects bad ones", () => {
    const m = watched("Coco", ["Made me cry"]);
    assert.deepEqual(readMovie(m.id, movieBody(m)), m);
    assert.equal(readMovie("x", { title: "A", status: "watched", tags: [] }), null);
    assert.equal(readMovie("x", { title: "A", status: "maybe", tags: [] }), null);
    assert.equal(readMovie("x", { title: "", status: "watchlist", tags: [] }), null);
    assert.equal(readMovie("x", { title: "A", status: "watchlist", tags: [], info: { year: "soon" } }).info.found, false);
  });

  test("findByTitle returns the newest entry first", () => {
    const old = watched("Arrival", ["x"], { now: 1 });
    const fresh = watched("ARRIVAL", ["y"], { now: 5 });
    assert.equal(findByTitle([old, fresh], "arrival")[0].id, fresh.id);
  });

  test("search ranks exact, then starts-with, then contains", () => {
    const list = [watched("Alien", ["x"]), watched("Aliens", ["x"]), watched("The Alien Life", ["x"])];
    assert.deepEqual(searchMovies(list, "alien").map((m) => m.title), ["Alien", "Aliens", "The Alien Life"]);
  });

  test("filters by tag, star or the person watched with", () => {
    const a = watched("A", ["Sci-fi"], { loved: true });
    const b = { ...watched("B", ["Comfort"]), watchedWith: [{ with: "u_maya", at: 9 }] };
    assert.deepEqual(filterMovies([a, b], { tag: "sci-fi" }).map((m) => m.title), ["A"]);
    assert.deepEqual(filterMovies([a, b], { loved: true }).map((m) => m.title), ["A"]);
    assert.deepEqual(filterMovies([a, b], { with: "u_maya" }).map((m) => m.title), ["B"]);
    assert.deepEqual([...watchedWithCounts([a, b])], [["u_maya", 1]]);
  });

  test("recordWatched turns my watchlist entry into a watched one with my partner", () => {
    const saved = later("Past Lives");
    const m = recordWatched([saved], { title: "past lives", tags: ["Made me cry"], loved: true, partnerId: "u_b", info: null }, { now: 70 });
    assert.equal(m.id, saved.id);
    assert.equal(m.status, "watched");
    assert.deepEqual(m.watchedWith, [{ with: "u_b", at: 70 }]);
  });

  test("recordWatched copies the partner's details onto a new entry", () => {
    const info = { found: true, year: 2023 };
    const m = recordWatched([], { title: "Past Lives", tags: ["Quiet"], loved: false, partnerId: "u_b", info }, { now: 70, makeId: () => "n" });
    assert.equal(m.id, "n");
    assert.deepEqual(m.info, info);
  });
});

describe("people", () => {
  const link = (want, at) => readLink({ want, at });

  test("connection reads both sides", () => {
    assert.equal(connection(link(true, 1), link(true, 2)), "connected");
    assert.equal(connection(link(true, 1), null), "sent");
    assert.equal(connection(null, link(true, 1)), "received");
    assert.equal(connection(link(false, 2), link(true, 1)), "none");
    assert.equal(connection(link(true, 1), link(false, 2)), "declined");
    assert.equal(connection(null, null), "none");
  });

  test("a request newer than a decline asks again", () => {
    assert.equal(connection(link(true, 3), link(false, 2)), "sent");
    assert.equal(connection(link(false, 2), link(true, 3)), "received");
  });

  test("readLink defaults the group to Friends and rejects junk", () => {
    assert.equal(readLink({ want: true, at: 1 }).relation, "Friends");
    assert.equal(readLink({ want: true, at: 1, relation: " Book  club " }).relation, "Book club");
    assert.equal(readLink({ want: "yes" }), null);
  });
});

const sameTitleLocal = (x, y) => normalizeTitle(x) === normalizeTitle(y);

describe("Movie Night", () => {
  const A = "u_alex";
  const M = "u_maya";
  const logs = () => ({
    [A]: [watched("Interstellar", ["Sci-fi"], { loved: true }), later("Dune"), later("Perfect Days"), watched("Coco", ["Cried"])],
    [M]: [later("Amélie"), watched("Arrival", ["Slow"], { loved: true })],
  });
  const side = (patch = {}) => ({ ...emptySide(), ...patch });
  const press = (at, after = null) => ({ ready: { at, after } });
  const view = (me, mine, theirs, l = logs(), now = 1000) =>
    deriveNight({ me, partner: me === A ? M : A, mine, theirs, logs: l, now });

  test("seededRandom repeats for the same seed", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
    assert.notEqual(seededRandom("y")(), seededRandom("x")());
  });

  test("a pool is the watchlist plus loved movies, as of the night's start", () => {
    const pool = nightPool([...logs()[A], later("Brand new", 5000)], 1000, ["dune"]);
    assert.deepEqual(pool.watchlist.map((m) => m.title), ["Perfect Days"]);
    assert.deepEqual(pool.loved.map((m) => m.title), ["Interstellar"]);
  });

  test("pickFrom takes loved movies about 20% of the time", () => {
    const pools = { [A]: nightPool(logs()[A], Infinity), [M]: { watchlist: [], loved: [] } };
    const random = seededRandom("share");
    let loved = 0;
    for (let i = 0; i < 2000; i += 1) if (pickFrom(pools, [A, M], random).movie.loved) loved += 1;
    assert.ok(loved > 300 && loved < 500, `loved ${loved} of 2000`);
  });

  test("one press: I'm waiting, they see my press", () => {
    assert.equal(view(A, side(press(900)), side()).status, "waiting");
    assert.equal(view(M, side(), side(press(900))).status, "ready");
    assert.equal(view(A, side(press(900)), side(), logs(), 900 + READY_WINDOW_MS).status, "idle");
  });

  test("both press: both pages work out the same pick, and the other person votes", () => {
    const a = side(press(900));
    const m = side(press(950));
    const fromAlex = view(A, a, m);
    const fromMaya = view(M, m, a);
    assert.equal(fromAlex.status, "voting");
    assert.deepEqual(fromAlex.pick, fromMaya.pick);
    assert.equal(fromAlex.voterId, fromAlex.pick.ownerId === A ? M : A);
  });

  test("a movie on both watchlists is chosen with no vote", () => {
    const l = logs();
    l[M].push(later("dune"));
    const night = view(A, side(press(900)), side(press(950)), l);
    assert.equal(night.status, "chosen");
    assert.equal(night.chosen.how, "both");
    assert.equal(night.chosen.title, "Dune");
  });

  test("Not tonight picks again without repeating; a yes settles it", () => {
    let a = side(press(900));
    let m = side(press(950));
    const first = view(A, a, m);
    const voter = first.voterId;
    const pass = { passed: { session: first.key, titles: [first.pick.title] } };
    if (voter === A) a = { ...a, ...pass };
    else m = { ...m, ...pass };
    const second = view(A, a, m);
    assert.equal(second.status, "voting");
    assert.notEqual(normalizeTitle(second.pick.title), normalizeTitle(first.pick.title));

    const yes = { answer: { session: second.key, title: second.pick.title, ownerId: second.pick.ownerId, value: "either" } };
    if (second.voterId === A) a = { ...a, ...yes };
    else m = { ...m, ...yes };
    const done = view(M, m, a);
    assert.equal(done.status, "chosen");
    assert.equal(done.chosen.how, "either");
    assert.equal(done.chosen.title, second.pick.title);
  });

  test("a settled movie stays settled when its owner marks it watched", () => {
    const l = logs();
    const a = side(press(900));
    let m = side(press(950));
    const night = view(A, a, m, l);
    const voterIsMaya = night.voterId === M;
    const yes = { answer: { session: night.key, title: night.pick.title, ownerId: night.pick.ownerId, value: "want" } };
    const settled = voterIsMaya ? view(A, a, { ...m, ...yes }, l) : view(A, { ...a, ...yes }, m, l);
    const owner = night.pick.ownerId;
    l[owner] = l[owner].map((x) => (sameTitleLocal(x.title, night.pick.title) ? markWatched(x, { tags: ["Done"], loved: false }, 5000) : x));
    const after = voterIsMaya ? view(A, a, { ...m, ...yes }, l) : view(A, { ...a, ...yes }, m, l);
    assert.equal(settled.status, "chosen");
    assert.equal(after.chosen.title, settled.chosen.title);
  });

  test("a shared watchlist pick stays put after one person marks it watched", () => {
    const l = logs();
    l[M].push(later("dune"));
    const a = side(press(900));
    const m = side(press(950));
    l[A] = l[A].map((x) => (x.title === "Dune" ? markWatched(x, { tags: ["Epic"], loved: false }, 5000) : x));
    assert.equal(view(A, a, m, l).chosen.title, "Dune");
  });

  test("an answer from the wrong person or an old session does nothing", () => {
    const a = side(press(900));
    const m = side(press(950));
    const night = view(A, a, m);
    const owner = night.pick.ownerId === A ? a : m;
    owner.answer = { session: night.key, title: night.pick.title, ownerId: night.pick.ownerId, value: "want" };
    assert.equal(view(A, a, m).status, "voting");
  });

  test("passing on everything leaves the night empty", () => {
    const l = { [A]: [later("Dune")], [M]: [] };
    const a = side(press(900));
    const night = view(A, a, side(press(950)), l);
    assert.equal(night.voterId, M); // only Alex has anything, so Maya decides
    const m = side({ ...press(950), passed: { session: night.key, titles: ["Dune"] } });
    assert.equal(view(A, a, m, l).status, "empty");
  });

  test("a settled night ends for each person when they tag it", () => {
    const a = side(press(900));
    const m = side(press(950));
    const night = view(A, a, m);
    const yes = { answer: { session: night.key, title: night.pick.title, ownerId: night.pick.ownerId, value: "want" } };
    const [a1, m1] = night.voterId === A ? [{ ...a, ...yes }, m] : [a, { ...m, ...yes }];
    assert.equal(view(A, { ...a1, rated: night.key }, m1).status, "idle");
    assert.equal(view(M, m1, { ...a1, rated: night.key }).status, "chosen"); // Maya still gets to tag it
  });

  test("an unsettled night expires after 12 hours", () => {
    const night = view(A, side(press(900)), side(press(950)), logs(), 950 + NIGHT_EXPIRES_MS + 1);
    assert.equal(night.status, "idle");
  });

  test("nothing is decided until both sides have loaded", () => {
    const night = deriveNight({ me: A, partner: M, mine: side(press(900)), theirs: side(press(950)), logs: logs(), now: 1000, loaded: false });
    assert.equal(night.status, "loading");
  });

  test("with Claude: one press, and Claude says yes to the pick", () => {
    const mine = side(press(900));
    const night = deriveNight({ me: A, partner: CLAUDE_ID, mine, theirs: claudeSide(mine), logs: { ...logs(), [CLAUDE_ID]: [] }, now: 1000 });
    assert.equal(night.status, "chosen");
    assert.equal(night.chosen.how, "want");
    assert.equal(night.chosen.ownerId, A);
  });

  test("two waiting presses on different nights meet on the next press", () => {
    const a = side(press(900, "old~x"));
    const m = side(press(950, "other~y"));
    const fromA = view(A, a, m);
    const fromM = view(M, m, a);
    assert.equal(fromA.status, "ready");
    assert.equal(fromA.nextAfter, fromM.nextAfter);
  });

  test("either ending an unsettled night ends it, and a new press waits for the other", () => {
    const a = side(press(900));
    const m = side(press(950));
    const key = view(A, a, m).key;
    assert.equal(view(A, a, { ...m, ended: key }).status, "idle");

    // After the night, Alex presses again: Alex waits, Maya sees "your turn".
    const a2 = side(press(1200, key));
    const m2 = { ...m, ended: key };
    assert.equal(view(A, a2, m2, logs(), 1300).status, "waiting");
    const maya = view(M, m2, a2, logs(), 1300);
    assert.equal(maya.status, "ready");
    assert.equal(maya.nextAfter, key);
    // Maya presses, naming the same finished night: a new night starts.
    assert.equal(view(A, a2, side(press(1250, maya.nextAfter)), logs(), 1300).status, "voting");
  });

  test("both press at the same moment for the first time: the night starts", () => {
    assert.equal(view(A, side(press(1000)), side(press(1000))).status, "voting");
  });

  test("a clock a few minutes off still counts as together", () => {
    const night = view(A, side(press(1000)), side(press(1000 + 4 * 60 * 1000)), logs(), 1000);
    assert.equal(night.status, "voting");
  });

  test("readSide drops malformed fields", () => {
    const s = readSide({ ready: { at: "soon" }, answer: { session: "k", title: "T", ownerId: "u", value: "maybe" }, seen: 5 });
    assert.deepEqual(s, emptySide());
  });

  test("sharedWatchlist matches titles in any letter case", () => {
    const shared = sharedWatchlist(nightPool([later("DUNE")], Infinity), nightPool([later("dune")], Infinity));
    assert.equal(shared.length, 1);
  });
});
