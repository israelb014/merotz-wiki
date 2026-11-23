// Shared app context & flows.
import { state, save, addGame } from './lib/store.js';
import { go } from './lib/router.js';
import { checkAchievements } from './lib/stats.js';
import { loadJSON } from './lib/data.js';
import { toast } from './lib/ui.js';
import { play } from './lib/sound.js';
import { DEFAULT_GAME_SETTINGS } from './lib/modes.js';

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
    ctx.soloSettings = { ...DEFAULT_GAME_SETTINGS, allowBack: state.settings.allowBack, allowFind: state.settings.allowFind, ...saved, customStart: '', customTarget: '' };
  }
  return ctx.soloSettings;
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
  try { await addGame(r); } catch (e) { console.warn(e); }
  if (r.kind === 'campaign' && r.levelId) {
    const stars = r.status === 'finished' ? (r.clicks <= r.par ? 3 : r.clicks <= r.par + 2 ? 2 : 1) : 0;
    r.stars = stars;
    if (stars > (state.campaign[r.levelId] || 0)) { state.campaign[r.levelId] = stars; await save('campaign'); }
  }
  if (r.kind === 'daily' && r.date) {
    const prev = state.daily[r.date];
    if (!prev || (prev.status !== 'finished' && r.status === 'finished')) {
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
