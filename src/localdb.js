// A stand-in for the artifact's shared database, for when the page runs
// outside Claude (a saved copy, or a view without the db capability).
// It offers the small part of the db API the app uses and keeps documents
// in localStorage, so the log stays on this device only.
// Other tabs of the same origin see changes through the "storage" event.

const META = Object.freeze({ fromCache: false, hasPendingWrites: false });

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Like the real store's update: nested objects merge, everything else replaces.
function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// `storage` is localStorage, or null when the browser blocks it (then
// documents last only until the page closes).
export function createLocalDb(storage, prefix = "reellog:db:") {
  const store = storage ?? memoryStorage();
  const listeners = new Set();

  const read = (path) => {
    try {
      const raw = store.getItem(prefix + path);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const parentOf = (path) => path.slice(0, path.lastIndexOf("/"));
  const docSnap = (path) => {
    const data = read(path);
    return { id: path.slice(path.lastIndexOf("/") + 1), exists: data !== undefined, data: () => data, metadata: META };
  };
  const collectionSnap = (path) => {
    const paths = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key?.startsWith(prefix + path + "/")) continue;
      const rest = key.slice(prefix.length + path.length + 1);
      if (!rest.includes("/")) paths.push(path + "/" + rest);
    }
    const docs = paths.sort().map(docSnap).filter((d) => d.exists);
    return { docs, size: docs.length, empty: docs.length === 0, docChanges: () => [], metadata: META };
  };

  const notify = (changedPath) => {
    queueMicrotask(() => {
      for (const l of listeners) {
        if (l.kind === "doc" && l.path === changedPath) l.next(docSnap(l.path));
        if (l.kind === "collection" && l.path === parentOf(changedPath)) l.next(collectionSnap(l.path));
      }
    });
  };

  globalThis.addEventListener?.("storage", (event) => {
    if (event.key?.startsWith(prefix)) notify(event.key.slice(prefix.length));
  });

  const write = (path, data) => {
    try {
      if (data === undefined) store.removeItem(prefix + path);
      else store.setItem(prefix + path, JSON.stringify(data));
    } catch {
      return Promise.reject({ code: "quota_exceeded", message: "Browser storage is full." });
    }
    notify(path);
    return Promise.resolve();
  };

  const subscribe = (kind, path, next, snap) => {
    const listener = { kind, path, next };
    listeners.add(listener);
    queueMicrotask(() => listeners.has(listener) && next(snap()));
    return () => listeners.delete(listener);
  };

  function doc(path) {
    return {
      id: path.slice(path.lastIndexOf("/") + 1),
      path,
      get: () => Promise.resolve(docSnap(path)),
      set: (data) => write(path, JSON.parse(JSON.stringify(data))),
      update: (patch) => {
        const current = read(path);
        if (current === undefined) return Promise.reject({ code: "invalid_argument", message: `No document at ${path}.` });
        return write(path, merge(current, JSON.parse(JSON.stringify(patch))));
      },
      delete: () => write(path, undefined),
      onSnapshot: (next) => subscribe("doc", path, next, () => docSnap(path)),
      collection: (sub) => collection(path + "/" + sub),
    };
  }

  function collection(path) {
    return {
      path,
      doc: (id = randomId()) => doc(path + "/" + id),
      add: async (data) => {
        const ref = doc(path + "/" + randomId());
        await ref.set(data);
        return ref;
      },
      get: () => Promise.resolve(collectionSnap(path)),
      onSnapshot: (next) => subscribe("collection", path, next, () => collectionSnap(path)),
    };
  }

  return { doc, collection };
}
