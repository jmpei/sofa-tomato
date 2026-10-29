// Where the data lives. Inside Claude the page uses the artifact's shared
// database, so the people it is shared with see each other's movies. Anywhere
// else it falls back to movies on this device only ("solo").
import { createLocalDb } from "./localdb.js";

// Document paths. Each person writes only under their own id; the access
// rules declared at publish enforce that for every top-level collection.
export const paths = {
  members: "members",
  member: (uid) => `members/${uid}`,
  movies: (uid) => `logs/${uid}/movies`,
  movie: (uid, id) => `logs/${uid}/movies/${id}`,
  linksFrom: (uid) => `links/${uid}/to`,
  link: (from, to) => `links/${from}/to/${to}`,
  nightsFrom: (uid) => `nights/${uid}/with`,
  night: (from, to) => `nights/${from}/with/${to}`,
};

export const SOLO_ID = "me";

// Returns the browser's localStorage, or null if the browser blocks it.
export function getBrowserStorage(win = globalThis) {
  try {
    const storage = win.localStorage;
    const probe = "sofatomato:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

// Each capability may be missing, refused, or broken; any of those means "absent".
async function use(claude, name) {
  try {
    return (await claude.use(name)) ?? null;
  } catch {
    return null;
  }
}

export async function connect(win = globalThis) {
  const claude = win.claude;
  if (claude?.use) {
    const [db, user, sample, permissions] = await Promise.all([
      use(claude, "db"),
      use(claude, "user"),
      use(claude, "sample"),
      use(claude, "permissions"),
    ]);
    let me = null;
    try {
      me = db && user ? await user.id() : null;
    } catch {
      me = null;
    }
    // false only when the platform says this viewer cannot write (view
    // access); null means it told us nothing, so refused writes decide.
    let canWrite = null;
    try {
      canWrite = user?.can ? await user.can("data.write") : null;
    } catch {
      canWrite = null;
    }
    if (me) return { mode: "shared", db, user, sample, permissions, me, canWrite };
  }
  const storage = getBrowserStorage(win);
  return { mode: "solo", db: createLocalDb(storage, "sofatomato:db:"), user: null, sample: null, me: SOLO_ID, storageBlocked: !storage };
}
