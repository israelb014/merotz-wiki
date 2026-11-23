// IndexedDB storage: kv (profile/settings/progress), games (history), articles (24h cache)
const DB_NAME = 'merotz-wiki';
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' }).createIndex('ts', 'ts');
      if (!db.objectStoreNames.contains('articles')) db.createObjectStore('articles');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { console.warn('IDB unavailable, using memory', e); return null; });
  return dbp;
}

const mem = { kv: new Map(), games: new Map(), articles: new Map() };

function tx(store, mode, fn) {
  return open().then((db) => {
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then((v) => { out = v; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function get(store, key) {
  const db = await open();
  if (!db) return mem[store].get(key);
  return req2p(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, key, val) {
  const db = await open();
  if (!db) { mem[store].set(key ?? val.id, val); return; }
  return tx(store, 'readwrite', (s) => (key === null ? s.put(val) : s.put(val, key)));
}
export async function del(store, key) {
  const db = await open();
  if (!db) { mem[store].delete(key); return; }
  return tx(store, 'readwrite', (s) => s.delete(key));
}
export async function all(store) {
  const db = await open();
  if (!db) return [...mem[store].values()];
  return req2p(db.transaction(store).objectStore(store).getAll());
}
export async function clear(store) {
  const db = await open();
  if (!db) { mem[store].clear(); return; }
  return tx(store, 'readwrite', (s) => s.clear());
}

// ---- in-memory mirror of kv for synchronous access ----
export const state = {
  profile: null,       // {name, avatar, color, id}
  settings: null,
  campaign: {},        // levelId -> stars
  daily: {},           // date -> result
  achievements: {},    // id -> ts
  seenChangelog: null,
};

export const DEFAULT_SETTINGS = { theme: 'system', sound: true, vibration: true, allowBack: true, allowFind: true };

export async function loadAll() {
  const keys = ['profile', 'settings', 'campaign', 'daily', 'achievements', 'seenChangelog'];
  const vals = await Promise.all(keys.map((k) => get('kv', k).catch(() => undefined)));
  keys.forEach((k, i) => { if (vals[i] !== undefined) state[k] = vals[i]; });
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.campaign ||= {}; state.daily ||= {}; state.achievements ||= {};
  return state;
}
export async function save(key) { await put('kv', key, state[key]); }

// ---- games history (keep last 100) ----
export async function addGame(g) {
  await put('games', null, g);
  const games = await all('games');
  if (games.length > 100) {
    games.sort((a, b) => a.ts - b.ts);
    for (const old of games.slice(0, games.length - 100)) await del('games', old.id);
  }
}
export async function listGames() {
  const g = await all('games');
  return g.sort((a, b) => b.ts - a.ts);
}

// ---- backup ----
export async function exportBackup() {
  const games = await all('games');
  return { app: 'merotz-wiki', v: 1, exported: new Date().toISOString(), kv: { ...state }, games };
}
export async function importBackup(data) {
  if (!data || data.app !== 'merotz-wiki' || !data.kv) throw new Error('bad backup');
  for (const k of Object.keys(state)) {
    if (data.kv[k] !== undefined) { state[k] = data.kv[k]; await save(k); }
  }
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  if (Array.isArray(data.games)) {
    await clear('games');
    for (const g of data.games.slice(-100)) await put('games', null, g);
  }
}
