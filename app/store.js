// Clips live in IndexedDB on this phone only. Nothing is uploaded.
const DB = 'creasecam', STORE = 'clips';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const clips = {
  add: (clip) => tx('readwrite', (s) => s.put(clip)),
  all: async () => {
    const list = (await tx('readonly', (s) => s.getAll())) || [];
    return list.sort((a, b) => b.created - a.created);
  },
  get: (id) => tx('readonly', (s) => s.get(id)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

const KEY = 'cc.settings';
const defaults = { onboarded: false, mode: 'bat', defMode: 'bat', showGuide: true, family: false };
export const settings = {
  get() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...defaults }; }
  },
  set(patch) {
    const next = { ...settings.get(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    return next;
  },
};
