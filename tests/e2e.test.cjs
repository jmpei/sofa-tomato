// End-to-end tests: open dist/index.html in headless Chromium and run each user story.
// Run with: npm run test:e2e  (builds first). Screenshots go to tests/screenshots/.
//
// Solo tests run the page with no window.claude, as a saved copy would.
// Shared tests open pages in one browser context, each with a fake
// window.claude: db is the on-device store (shared through the context's
// localStorage), user is Alex or Maya, and sample answers like Claude would.
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const APP_URL = "https://sofatomato.test/";
// claude.ai shows the page in a cross-origin iframe and opens its own
// dialogs (like the "Use Claude" consent) over it, in the host document.
const HOST_URL = "https://host.test/";
const hostHtml =
  `<!doctype html><body style="margin:0"><iframe id="app" src="${APP_URL}" style="width:1200px;height:760px;border:0"></iframe>` +
  '<dialog id="consent"><p>Use Claude</p><button id="continue">Continue</button></dialog></body>';
// The artifact publisher wraps the page in a document skeleton; do the same here.
const html =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' +
  fs.readFileSync(path.join(root, "dist/index.html"), "utf8") +
  "</body></html>";
const vendor = {
  "react.production.min.js": fs.readFileSync(path.join(root, "test-vendor/react.js"), "utf8"),
  "react-dom.production.min.js": fs.readFileSync(path.join(root, "test-vendor/react-dom.js"), "utf8"),
};
const localDbScript = fs.readFileSync(path.join(root, "test-vendor/localdb.js"), "utf8");
const shots = path.join(__dirname, "screenshots");
fs.mkdirSync(shots, { recursive: true });

const PEOPLE = { u_alex: "Alex", u_maya: "Maya" };

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function newContext({ width = 1280, height = 800, colorScheme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url === APP_URL) return route.fulfill({ contentType: "text/html", body: html });
    if (url === HOST_URL) return route.fulfill({ contentType: "text/html", body: hostHtml });
    const file = Object.keys(vendor).find((name) => url.startsWith("https://cdnjs.cloudflare.com/") && url.endsWith(name));
    if (file) return route.fulfill({ contentType: "application/javascript", body: vendor[file] });
    return route.abort(); // fonts and anything else: no network in tests
  });
  return context;
}

// The fake window.claude for one person. sample.json answers the three
// prompts the page sends: movie details, a title guess and a tag guess.
// `sampleState` is what permissions.state("sample") answers; `canWrite` is
// what user.can("data.write") answers (false: view access, writes refused).
function fakeClaude({ uid, people, sampleState = "granted", canWrite = null }) {
  const db = ReelLogTestDb.createLocalDb(localStorage, "sofatomato:shared:");
  const profile = (id) => ({ id, name: people[id] || "", isMe: id === uid, guest: false, email: null });
  const user = {
    id: async () => uid,
    me: async () => profile(uid),
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, profile(id)])),
    isOwner: async () => uid === "u_alex",
    canEdit: async () => uid === "u_alex",
    can: async (name) => (name === "data.write" ? canWrite : null),
  };
  if (canWrite === false) {
    const refuse = () => Promise.reject(Object.assign(new Error("not allowed"), { code: "permission_denied" }));
    const doc = db.doc.bind(db);
    db.doc = (path) => Object.assign(doc(path), { set: refuse, update: refuse, delete: refuse });
  }
  window.sampleCalls = 0;
  let granted = sampleState === "granted";
  const permissions = { state: async (name) => (name === "sample" ? (granted ? "granted" : sampleState) : "unavailable") };
  const typed = (prompt) => (prompt.match(/typed: "([^"]*)"/) || [])[1] || "";
  const sample = async () => ({ text: "" });
  sample.json = async (prompt) => {
    window.sampleCalls += 1;
    granted = true; // the first call is where the viewer would allow it
    await new Promise((r) => setTimeout(r, 50));
    if (prompt.includes("Identify the most likely film")) {
      if (prompt.includes('"Resident Evil"')) {
        return { found: true, year: 2002, runtimeMinutes: 100, certificate: "R", plot: "A special forces team fights the undead in an underground lab.", director: ["Paul W.S. Anderson"], stars: ["Milla Jovovich", "Michelle Rodriguez"] };
      }
      return { found: false };
    }
    if (prompt.includes("movie title")) return { title: "resident".startsWith(typed(prompt).toLowerCase()) ? "Resident Evil" : null };
    if (prompt.includes("short tag")) return { tag: "zombie horror".startsWith(typed(prompt).toLowerCase()) ? "Zombie horror" : null };
    return null;
  };
  window.claude = { use: async (name) => ({ db, user, sample, permissions })[name] ?? null };
}

async function openPage(context, { as, initScript, tutorial = false, sampleState, canWrite } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (!tutorial) await page.addInitScript(() => localStorage.setItem("sofatomato:tutorial-seen", "1"));
  if (initScript) await page.addInitScript(initScript);
  if (as) {
    await page.addInitScript(localDbScript);
    await page.addInitScript(fakeClaude, { uid: as, people: PEOPLE, sampleState, canWrite });
  }
  await page.goto(APP_URL);
  await page.getByRole("banner").waitFor();
  return { page, errors };
}

async function openApp(options = {}) {
  const context = await newContext(options);
  const { page, errors } = await openPage(context, options);
  return { page, context, errors };
}

// A nav button's name gains "needs you" while its badge shows.
const nav = (page, name) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: new RegExp(`^${name}( needs you)?$`) });
const goHome = (page) => page.getByRole("button", { name: "Sofa Tomato home" }).click();
const feelings = (page) => page.getByRole("group", { name: "How did you feel?" });
const chip = (scope, label) => scope.locator("label.chip").filter({ hasText: new RegExp(`^(★ ?)?${label}$`) });
const rows = (page) => page.locator(".movie-row");
const row = (page, title) => rows(page).filter({ has: page.getByRole("heading", { name: new RegExp(`^${title}(\\W+loved)?$`) }) });

async function pickTags(page, scope, tags) {
  for (const tag of tags) {
    if (await chip(scope, tag).count()) await chip(scope, tag).click();
    else {
      await scope.getByLabel("New tag").fill(tag);
      await scope.getByRole("button", { name: "Add tag" }).click();
    }
  }
}

async function markWatched(page, title, tags) {
  await page.getByLabel("Movie title").fill(title);
  await pickTags(page, feelings(page), tags);
  await page.getByRole("button", { name: "Mark as watched" }).click();
  await page.getByText(`Marked ${title} as watched.`).waitFor();
}

async function addSamples(page) {
  await nav(page, "Movies").click();
  await page.getByRole("button", { name: "Add sample movies" }).click();
  await page.getByText("Added 15 sample movies.").waitFor();
}

// The page never scrolls; only boxes inside it do.
async function fitsOneScreen(page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollHeight <= window.innerHeight && el.scrollWidth <= window.innerWidth;
  });
}

describe("First visit", () => {
  test("shows the tutorial once; ? opens it again", async () => {
    const { page, context } = await openApp({ tutorial: true });
    const dialog = page.getByRole("dialog", { name: "Sofa Tomato in four steps" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "OK, I got it" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    await page.getByRole("banner").waitFor();
    await page.waitForTimeout(200);
    assert.equal(await dialog.isVisible(), false);
    await page.getByRole("button", { name: "How it works" }).click();
    await dialog.waitFor();
    await context.close();
  });
});

describe("Home: log it or save it", () => {
  test("Mark as watched with tags and a star; still there after a refresh", async () => {
    const { page, context, errors } = await openApp();
    await page.getByRole("heading", { name: "Just finished a movie?" }).waitFor();
    await page.getByText("Log it, or save it to watch later.").waitFor();
    await markWatched(page, "Interstellar", ["Loved it", "Visually stunning"]);
    await page.reload();
    await nav(page, "Movies").click();
    await row(page, "Interstellar").getByText("Visually stunning").waitFor();
    await row(page, "Interstellar").locator(".row-star").waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("asks for a title, and for a tag or a star before marking watched", async () => {
    const { page, context } = await openApp();
    await page.getByRole("button", { name: "Mark as watched" }).click();
    await page.getByText("Enter a movie title.").waitFor();
    await page.getByLabel("Movie title").fill("Coco");
    await page.getByRole("button", { name: "Mark as watched" }).click();
    await page.getByText("Pick a tag or ★ Loved it.").waitFor();
    await context.close();
  });

  test("Add to watchlist, then Watched it moves the movie to Watched", async () => {
    const { page, context } = await openApp();
    await page.getByLabel("Movie title").fill("Past Lives");
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    await page.getByText("Added Past Lives to your watchlist.").waitFor();
    await nav(page, "Movies").click();
    await page.getByRole("button", { name: /^Watchlist/ }).click();
    await row(page, "Past Lives").getByRole("button", { name: "Watched it" }).click();
    assert.equal(await page.getByLabel("Movie title").inputValue(), "Past Lives");
    await page.getByText("It’s on your watchlist.", { exact: false }).waitFor();
    await pickTags(page, feelings(page), ["Made me cry"]);
    await page.getByRole("button", { name: "Mark as watched" }).click();
    await nav(page, "Movies").click();
    await row(page, "Past Lives").getByText("Made me cry").waitFor();
    await page.getByRole("button", { name: /^Watchlist/ }).click();
    await page.getByText("Your watchlist is empty.", { exact: false }).waitFor();
    await context.close();
  });

  test("a typed tag joins the tag list and is still there after a refresh", async () => {
    const { page, context } = await openApp();
    await markWatched(page, "Before Sunrise", ["Talky"]);
    await page.reload();
    await chip(feelings(page), "Talky").waitFor();
    await context.close();
  });

  test("more than 20 tags fold under All tags, which drops down the rest", async () => {
    const { page, context } = await openApp();
    await addSamples(page);
    await goHome(page);
    const group = feelings(page);
    const toggle = group.getByRole("button", { name: /^All tags/ });
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await group.locator(".fold-scroll > .chips > label.chip:not(.chip-star)").count(), 20);
    const hiddenChip = group.locator(".fold-panel label.chip").first();
    assert.equal(await hiddenChip.isVisible(), false);
    await toggle.click();
    await hiddenChip.waitFor({ state: "visible" });
    await page.waitForTimeout(400); // let the drop-down finish
    await hiddenChip.click();
    await toggle.click();
    await group.getByText("1 picked inside", { exact: false }).waitFor();
    await context.close();
  });
});

describe("Autocomplete", () => {
  test("titles and tags complete from your own movies with Tab", async () => {
    const { page, context } = await openApp();
    await addSamples(page);
    await goHome(page);
    const title = page.getByLabel("Movie title");
    await title.fill("Inters");
    await page.locator(".ghost-text").first().getByText("tellar", { exact: false }).waitFor();
    await title.press("Tab");
    assert.equal(await title.inputValue(), "Interstellar");

    const newTag = feelings(page).getByLabel("New tag");
    await newTag.fill("slo");
    await newTag.press("Tab");
    assert.equal(await newTag.inputValue(), "Slow burn");

    // Escape refuses a suggestion, so "Dune" can be logged as typed.
    await title.fill("Dune");
    await page.locator(".ghost-text").first().getByText(": Part Two", { exact: false }).waitFor();
    await title.press("Escape");
    await title.press("Enter");
    assert.notEqual(await title.inputValue(), "Dune: Part Two");
    await context.close();
  });

  test("Claude guesses titles and tags; Enter takes the guess", async () => {
    const { page, context } = await openApp({ as: "u_alex" });
    const title = page.getByLabel("Movie title");
    await title.fill("Resident");
    await page.locator(".ghost-text").first().getByText("Evil", { exact: false }).waitFor();
    await title.press("Enter");
    assert.equal(await title.inputValue(), "Resident Evil");

    const newTag = feelings(page).getByLabel("New tag");
    await newTag.fill("Zomb");
    await feelings(page).locator(".ghost-text").getByText("ie horror", { exact: false }).waitFor();
    await newTag.press("Enter");
    assert.equal(await newTag.inputValue(), "Zombie horror");
    await newTag.press("Enter"); // no suggestion left, so Enter adds the tag
    assert.equal(await feelings(page).getByRole("checkbox", { name: "Zombie horror" }).isChecked(), true);
    await context.close();
  });

  test("before the viewer allows Claude, typing never asks Claude; logging a movie does", async () => {
    const { page, context, errors } = await openApp({ as: "u_maya", sampleState: "prompt" });
    const title = page.getByLabel("Movie title");
    await title.pressSequentially("Resident", { delay: 30 });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.sampleCalls), 0);
    assert.equal(await page.locator(".ghost-text").first().getByText("Evil", { exact: false }).count(), 0);

    // Logging asks Claude for details (a click, so consent fits here); then autocomplete lights up.
    await markWatched(page, "Resident Evil", ["Zombie"]);
    assert.equal(await page.evaluate(() => window.sampleCalls), 1);
    await title.fill("Resident");
    await page.locator(".ghost-text").first().getByText("Evil", { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("a viewer with view access sees why nothing saves, not a failed save on load", async () => {
    const { page, context, errors } = await openApp({ as: "u_maya", canWrite: false });
    await page.getByText("You have view access", { exact: false }).waitFor();
    assert.equal(await page.getByText("That change was not saved", { exact: false }).count(), 0);
    await page.getByRole("button", { name: "Dismiss" }).click();
    assert.equal(await page.getByText("You have view access", { exact: false }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
});

describe("Movies", () => {
  test("Claude fills in year, runtime, rating, plot, director and stars; More opens IMDb", async () => {
    const { page, context, errors } = await openApp({ as: "u_alex" });
    await markWatched(page, "Resident Evil", ["Zombie"]);
    await nav(page, "Movies").click();
    const r = row(page, "Resident Evil");
    await r.getByText("2002 · 1h 40m · R").waitFor();
    await r.getByText("A special forces team fights the undead", { exact: false }).waitFor();
    await r.getByText("Paul W.S. Anderson").waitFor();
    await r.getByText("Milla Jovovich, Michelle Rodriguez").waitFor();
    assert.equal(await r.getByRole("link", { name: /More/ }).getAttribute("href"), "https://www.imdb.com/find/?q=Resident%20Evil%202002");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("search answers before you press play", async () => {
    const { page, context } = await openApp();
    await addSamples(page);
    const search = page.getByLabel("Search your movies by title");
    await search.fill("STELL");
    assert.equal(await rows(page).count(), 1);
    await search.fill("the room");
    await page.getByText("You’ve seen it, and called it a waste of time.").waitFor();
    await search.fill("Zodiac");
    await page.getByText("Not in your movies.").waitFor();
    await context.close();
  });

  test("filter by one tag, by stars, then everything again", async () => {
    const { page, context } = await openApp();
    await addSamples(page);
    const filter = page.getByLabel("Filter");
    await filter.selectOption({ label: "Visually stunning (3)" });
    assert.equal(await rows(page).count(), 3);
    await filter.selectOption({ label: "★ Loved it" });
    assert.equal(await rows(page).count(), 5);
    await filter.selectOption({ label: "All tags" });
    assert.equal(await rows(page).count(), 12);
    await context.close();
  });

  test("edit tags, then delete with a confirmation", async () => {
    const { page, context } = await openApp();
    await addSamples(page);
    await row(page, "Arrival").getByRole("button", { name: /^Edit/ }).click();
    const sheet = page.getByRole("dialog", { name: "Arrival" });
    await chip(sheet, "Made me cry").click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await row(page, "Arrival").getByText("Made me cry").waitFor();

    await row(page, "Coco").getByRole("button", { name: /^Edit/ }).click();
    const coco = page.getByRole("dialog", { name: "Coco" });
    await coco.getByRole("button", { name: "Delete" }).click();
    await coco.getByRole("button", { name: "Keep it" }).click();
    await coco.getByRole("button", { name: "Delete" }).click();
    await coco.getByRole("button", { name: "Delete" }).click(); // the confirm button
    await page.getByText("Deleted Coco.").waitFor();
    await page.reload();
    await nav(page, "Movies").click();
    await row(page, "Arrival").waitFor();
    assert.equal(await row(page, "Coco").count(), 0);
    await context.close();
  });
});

// Opens Alex and Maya side by side and connects them.
async function connectedPair(options) {
  const context = await newContext(options);
  const alex = await openPage(context, { as: "u_alex" });
  const maya = await openPage(context, { as: "u_maya" });
  await nav(alex.page, "People").click();
  await alex.page.locator(".person").filter({ hasText: "Maya" }).getByRole("button", { name: "Connect" }).click();
  await nav(maya.page, "People").click();
  await maya.page.getByText("Wants to connect with you").waitFor();
  await maya.page.getByRole("button", { name: "Accept" }).click();
  await alex.page.getByRole("list", { name: "Friends" }).getByText("Maya", { exact: true }).waitFor();
  return { context, alex, maya };
}

// Whichever page is asked "Want to watch it tonight?"
async function voterOf(pages) {
  for (let i = 0; i < 50; i += 1) {
    for (const p of pages) if (await p.getByText("Want to watch it tonight?").isVisible()) return p;
    await pages[0].waitForTimeout(100);
  }
  throw new Error("nobody was asked to vote");
}

describe("People", () => {
  test("alone on the page: tells you how to share it", async () => {
    const { page, context } = await openApp({ as: "u_alex" });
    await nav(page, "People").click();
    await page.getByText("No one else is here yet.").waitFor();
    await page.getByText("at the top of Claude and send them this page", { exact: false }).waitFor();
    await page.getByRole("list", { name: "Friends" }).getByText("Claude", { exact: true }).waitFor();
    await context.close();
  });

  test("Friends, Family, or a group you name", async () => {
    const { context, alex } = await connectedPair();
    const A = alex.page;
    await A.getByLabel("Group for Maya").selectOption("Family");
    await A.getByRole("list", { name: "Family" }).getByText("Maya", { exact: true }).waitFor();
    await A.getByLabel("Group for Claude").selectOption("New group…");
    await A.getByLabel("New group for Claude").fill("Book club");
    await A.getByRole("button", { name: "Save" }).click();
    await A.getByRole("list", { name: "Book club" }).getByText("Claude", { exact: true }).waitFor();
    await A.reload();
    await nav(A, "People").click();
    await A.getByRole("list", { name: "Book club" }).getByText("Claude", { exact: true }).waitFor();
    await context.close();
  });

  test("disconnect asks first, and the other side sees it", async () => {
    const { context, alex, maya } = await connectedPair();
    await maya.page.getByRole("button", { name: "Disconnect" }).click();
    await maya.page.getByRole("button", { name: "Disconnect Alex" }).click();
    await alex.page.getByText("Not connected").waitFor();
    await context.close();
  });
});

describe("Movie Night", () => {
  test("both press, one votes, both get the pop-up, both tag it on home", async () => {
    const { context, alex, maya } = await connectedPair();
    const A = alex.page;
    const M = maya.page;
    await addSamples(A);
    await goHome(M);
    await M.getByLabel("Movie title").fill("Amélie");
    await M.getByRole("button", { name: "Add to watchlist" }).click();
    await M.getByText("Added Amélie to your watchlist.").waitFor();

    await nav(A, "Movie Night").click();
    await nav(M, "Movie Night").click();
    await A.locator(".night-button").click();
    await A.getByRole("button", { name: "Waiting for Maya…" }).waitFor();
    await M.getByText("Alex is ready. Your turn.").waitFor();
    await M.locator(".night-button").click();

    const voter = await voterOf([A, M]);
    const other = voter === A ? M : A;
    await other.getByText(/is deciding\.$/).waitFor();
    const firstPick = (await voter.locator(".night-title").textContent()).trim();
    await voter.getByRole("button", { name: "Not tonight" }).click();
    await voter.waitForTimeout(200);
    const second = await voterOf([A, M]);
    const title = (await second.locator(".night-title").textContent()).trim();
    assert.notEqual(title, firstPick);
    await second.getByRole("button", { name: "Want to watch" }).click();

    for (const page of [A, M]) {
      await page.getByRole("dialog", { name: "Tonight you’re watching" }).getByText(title, { exact: true }).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
    }
    await A.reload();
    await A.getByRole("banner").waitFor();
    await A.waitForTimeout(300);
    assert.equal(await A.getByRole("dialog", { name: "Tonight you’re watching" }).count(), 0); // dismissed stays dismissed

    // Home now shows tonight's movie for both.
    for (const page of [A, M]) {
      await goHome(page);
      await page.getByRole("heading", { name: "Tonight’s movie" }).waitFor();
      await page.locator(".tonight-title").getByText(title).waitFor();
    }
    await pickTags(A, feelings(A), ["Cozy"]);
    await A.getByRole("button", { name: "Mark as watched" }).click();
    await A.getByText(`Marked ${title} as watched with Maya.`).waitFor();
    await pickTags(M, feelings(M), ["Popcorn fun"]);
    await M.getByRole("button", { name: "Mark as watched" }).click();

    for (const page of [A, M]) {
      await nav(page, "Movie Night").click();
      await page.locator(".night-button").getByText("What to watch tonight?").waitFor();
    }
    await nav(M, "Movies").click();
    await row(M, title).getByText("with Alex", { exact: false }).waitFor();
    await M.getByLabel("Filter").selectOption({ label: "Alex (1)" });
    assert.equal(await rows(M).count(), 1);
    assert.deepEqual([...alex.errors, ...maya.errors], []);
    await context.close();
  });

  test("a movie on both watchlists is picked straight away", async () => {
    const { context, alex, maya } = await connectedPair();
    await addSamples(alex.page);
    await goHome(maya.page);
    await maya.page.getByLabel("Movie title").fill("dune: part two");
    await maya.page.getByRole("button", { name: "Add to watchlist" }).click();
    await maya.page.getByText("Added dune: part two to your watchlist.").waitFor();
    for (const page of [alex.page, maya.page]) await nav(page, "Movie Night").click();
    await alex.page.locator(".night-button").click();
    await maya.page.locator(".night-button").click();
    for (const page of [alex.page, maya.page]) {
      await page.getByRole("dialog", { name: "Tonight you’re watching" }).getByText(/^dune: part two$/i).waitFor();
    }
    await context.close();
  });

  test("pressing at the very same moment still starts the night", async () => {
    const { context, alex, maya } = await connectedPair();
    await addSamples(alex.page);
    for (const page of [alex.page, maya.page]) await nav(page, "Movie Night").click();
    await alex.page.locator(".night-button:not([disabled])").waitFor();
    await maya.page.locator(".night-button:not([disabled])").waitFor();
    await Promise.all([alex.page, maya.page].map((p) => p.evaluate(() => document.querySelector(".night-button").click())));
    await voterOf([alex.page, maya.page]);
    await context.close();
  });

  test("passing on everything shows Start over, which asks the other person again", async () => {
    const { context, alex, maya } = await connectedPair();
    await goHome(maya.page);
    await maya.page.getByLabel("Movie title").fill("Amélie");
    await maya.page.getByRole("button", { name: "Add to watchlist" }).click();
    await maya.page.getByText("Added Amélie to your watchlist.").waitFor();
    for (const page of [alex.page, maya.page]) await nav(page, "Movie Night").click();
    await alex.page.locator(".night-button").click();
    await maya.page.locator(".night-button").click();
    await alex.page.getByRole("button", { name: "Not tonight" }).click();
    for (const page of [alex.page, maya.page]) await page.getByText("You passed on everything", { exact: false }).waitFor();
    await maya.page.getByRole("button", { name: "Start over" }).click();
    await alex.page.getByText("Maya is ready. Your turn.").waitFor();
    await alex.page.locator(".night-button").click();
    await alex.page.getByText("Want to watch it tonight?").waitFor();
    await context.close();
  });
});

describe("Movie Night with Claude", () => {
  test("alone, Claude pulls the lever and says yes; home asks you to tag it", async () => {
    const { page, context, errors } = await openApp();
    await addSamples(page);
    await nav(page, "Movie Night").click();
    const withWhom = page.getByRole("group", { name: "Movie Night with" });
    assert.equal(await withWhom.getByRole("button", { name: "Claude" }).getAttribute("aria-pressed"), "true");
    await page.locator(".night-button").getByText("What to watch tonight?").click();
    const dialog = page.getByRole("dialog", { name: "Tonight you’re watching" });
    await dialog.waitFor();
    await dialog.getByText("with Claude").waitFor();
    const title = (await dialog.locator(".popup-title").textContent()).trim();
    await dialog.getByRole("button", { name: "OK" }).click();
    await page.getByText("Claude likes every movie, so it’s a match.").waitFor();
    await page.getByRole("button", { name: "Watched it? Tag it" }).click();
    await page.getByText("Movie Night with Claude").waitFor();
    await page.locator(".tonight-title").getByText(title).waitFor();
    await pickTags(page, feelings(page), ["Cozy"]);
    await page.getByRole("button", { name: "Mark as watched" }).click();
    await page.getByRole("heading", { name: "Just finished a movie?" }).waitFor();
    await nav(page, "Movies").click();
    await row(page, title).getByText("with Claude", { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  });
});

describe("One screen", () => {
  for (const [width, height] of [[360, 640], [1280, 800]]) {
    test(`no view scrolls the page at ${width}×${height}, light and dark`, async () => {
      for (const colorScheme of ["light", "dark"]) {
        const { context, alex, maya } = await connectedPair({ width, height, colorScheme });
        const A = alex.page;
        await addSamples(A);
        for (const view of ["home", "Movies", "People", "Movie Night"]) {
          if (view === "home") await goHome(A);
          else await nav(A, view).click();
          assert.ok(await fitsOneScreen(A), `${view} at ${width} ${colorScheme}`);
          await A.screenshot({ path: path.join(shots, `${width}-${colorScheme}-${view.replace(" ", "-").toLowerCase()}.png`) });
        }
        await A.locator(".night-button").click();
        await nav(maya.page, "Movie Night").click();
        await maya.page.locator(".night-button").click();
        const voter = await voterOf([A, maya.page]);
        await voter.getByRole("button", { name: "Want to watch" }).click();
        await A.getByRole("dialog", { name: "Tonight you’re watching" }).waitFor();
        await A.waitForTimeout(400);
        assert.ok(await fitsOneScreen(A), `pop-up at ${width} ${colorScheme}`);
        await A.screenshot({ path: path.join(shots, `${width}-${colorScheme}-popup.png`) });
        assert.deepEqual([...alex.errors, ...maya.errors], []);
        await context.close();
      }
    });
  }
});

describe("Problems", () => {
  test("a host dialog over the page keeps its focus", async () => {
    const context = await newContext();
    await context.addInitScript(() => localStorage.setItem("sofatomato:tutorial-seen", "1"));
    const page = await context.newPage();
    await page.goto(HOST_URL);
    const title = page.frameLocator("#app").getByLabel("Movie title");
    await title.click();
    await title.pressSequentially("incep");
    await page.evaluate(() => {
      document.getElementById("consent").showModal();
      document.getElementById("continue").focus();
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.activeElement.id), "continue");
    await context.close();
  });

  test("works and shows a notice when the browser blocks storage", async () => {
    const { page, context } = await openApp({
      initScript: () => {
        Object.defineProperty(window, "localStorage", { get() { throw new Error("SecurityError"); } });
      },
    });
    await page.getByText(/This browser blocks storage/).waitFor();
    // Without storage the tutorial can't remember it was seen.
    await page.getByRole("button", { name: "OK, I got it" }).click();
    await markWatched(page, "Coco", ["Made me cry"]);
    await context.close();
  });

  test("falls back to this device when Claude refuses every capability", async () => {
    const { page, context, errors } = await openApp({
      initScript: () => {
        window.claude = { use: async () => { throw new Error("capability not granted"); } };
      },
    });
    await markWatched(page, "Coco", ["Made me cry"]);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
