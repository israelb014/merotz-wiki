// Shared app context & flows.
import { state, save, addGame, get, put, del } from './lib/store.js';
import { GameSession } from './lib/game.js';
import { go } from './lib/router.js';
import { checkAchievements } from './lib/stats.js';
import { loadJSON } from './lib/data.js';
import { toast } from './lib/ui.js';
import { play } from './lib/sound.js';
import { DEFAULT_GAME_SETTINGS, MODES, CATEGORIES, DIFFICULTIES } from './lib/modes.js';

export const ctx = {
  pending: null,   // {start, target, forbidden, settings, kind, meta}
  session: null,   // GameSession
  result: null,    // last result object
  room: null,      // Room
  soloSettings: null,
  roomSettingsDraft: null,
};

export function soloSettings() {
  if (!ctx.soloSettings) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('mw-solo-settings') || '{}'); } catch {}
    ctx.soloSettings = { ...DEFAULT_GAME_SETTINGS, allowBack: state.settings.allowBack, allowFind: state.settings.allowFind, ...sanitizeSettings(saved), customStart: '', customTarget: '' };
  }
  return ctx.soloSettings;
}
/** Keep only valid values from stored settings (corrupted / old localStorage must never break the setup screens). */
export function sanitizeSettings(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  if (MODES[v.mode]) out.mode = v.mode;
  if (MODES.clock.limits.includes(v.timeLimit)) out.timeLimit = v.timeLimit;
  if (CATEGORIES.some((c) => c.id === v.category)) out.category = v.category;
  if (DIFFICULTIES.some((d) => d.id === v.difficulty)) out.difficulty = v.difficulty;
  for (const k of ['allowBack', 'allowFind']) if (typeof v[k] === 'boolean') out[k] = v[k];
  return out;
}
export function persistSoloSettings() {
  const { customStart, customTarget, ...rest } = ctx.soloSettings;
  try { localStorage.setItem('mw-solo-settings', JSON.stringify(rest)); } catch {}
}

/** Begin a solo-ish game (quick game, campaign level, daily) → pregame screen */
export function startPending(p) {
  ctx.pending = p;
  ctx.session = null;
  go('/pregame');
}

/** Store finished game in history + side effects. Returns {unlocked} */
export async function recordResult(session, extra = {}) {
  const r = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...session.result(), ...extra };
  ctx.result = r;
  if (r.kind !== 'mp') ctx.pending = null; // a finished game can't be restarted from a stale pregame
  try { await addGame(r); } catch (e) { console.warn(e); }
  if (r.kind === 'campaign' && r.levelId) {
    const stars = r.status === 'finished' ? (r.clicks <= r.par ? 3 : r.clicks <= r.par + 2 ? 2 : 1) : 0;
    r.stars = stars;
    if (stars > (state.campaign[r.levelId] || 0)) { state.campaign[r.levelId] = stars; await save('campaign'); }
  }
  if (r.kind === 'daily' && r.date) {
    // one attempt per day: the first final result (win, give-up, …) is kept forever
    const prev = state.daily[r.date];
    if (!prev) {
      state.daily[r.date] = { status: r.status, clicks: r.clicks, elapsed: r.elapsed, path: r.path, par: r.par, start: r.start, target: r.target };
      await save('daily');
    }
  }
  let campaign = null;
  if (r.kind === 'campaign') campaign = await loadJSON('campaign').catch(() => null);
  const unlocked = await checkAchievements(r, { campaign });
  if (unlocked.length) setTimeout(() => { play('star'); unlocked.forEach((a, i) => setTimeout(() => toast(`הישג חדש: ${a.name}`, 2600), i * 2800)); }, 900);
  return { result: r, unlocked };
}

// ---------------- saved solo game (resume after reload / app restart) ----------------
const SOLO_KEY = 'activeSolo';
export const SOLO_MAX_AGE = 7 * 24 * 3600 * 1000;
const SOLO_KINDS = ['solo', 'campaign', 'daily'];

/** Persist the running non-room game (called on start and after every move). */
export function saveSolo(g) {
  if (!g || !SOLO_KINDS.includes(g.kind) || g.status !== 'playing') return Promise.resolve();
  return put('kv', SOLO_KEY, { v: 1, savedAt: Date.now(), snap: g.snapshot() }).catch(() => {});
}
export function clearSolo() { return del('kv', SOLO_KEY).catch(() => {}); }

const validSnap = (s) => !!s && typeof s === 'object' && typeof s.start === 'string' && typeof s.target === 'string' && Array.isArray(s.path) && s.path.length > 0
  && Array.isArray(s.stack) && s.stack.length > 0 && typeof s.clicks === 'number' && typeof s.startAt === 'number' && s.settings && typeof s.settings === 'object'
  && SOLO_KINDS.includes(s.kind) && s.status === 'playing';

/**
 * At startup: resume a saved solo game. Returns the route to show ('/play' or '/results') or null.
 * Timed games keep running while the app is closed (real clock); if time ran out meanwhile the game is
 * recorded as a timeout. Saved games untouched for 7 days are dropped silently.
 */
export async function resumeSolo(now = Date.now()) {
  let rec;
  try { rec = await get('kv', SOLO_KEY); } catch { return null; }
  if (!rec) return null;
  if (!validSnap(rec.snap) || !(now - (Number(rec.savedAt) || 0) < SOLO_MAX_AGE)) { await clearSolo(); return null; }
  let g;
  try { g = GameSession.restore(rec.snap); } catch { await clearSolo(); return null; }
  ctx.pending = null;
  if (g.limit && now - g.startAt >= g.limit) {
    g.timeout();
    await clearSolo();
    await recordResult(g);
    ctx.session = null;
    return '/results';
  }
  ctx.session = g;
  return '/play';
}
