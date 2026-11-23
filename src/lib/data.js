// Static data (pools / campaign / daily / changelog) + pair selection.
import { linksTo, resolveTitle, resolveTitles, sameTitle, fetchSummary } from './wiki.js';

const BASE = import.meta.env.BASE_URL;
const cache = new Map();
export function loadJSON(name, { fresh = false } = {}) {
  if (!fresh && cache.has(name)) return cache.get(name);
  const p = fetch(`${BASE}data/${name}.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'default' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch((e) => { cache.delete(name); throw e; });
  cache.set(name, p);
  return p;
}

export const HUBS = ['ישראל', 'ארצות הברית', 'אנציקלופדיה', 'ירושלים', 'הממלכה המאוחדת', 'צרפת', 'גרמניה', 'יהודים', 'מלחמת העולם השנייה', 'אירופה', 'עברית', 'תל אביב-יפו', 'אנגלית', 'רוסיה', 'האימפריה הרומית', 'ניו יורק סיטי', 'איטליה', 'סין', 'יוון', 'מצרים'];

function tiers(arr) {
  const n = arr.length;
  return { top: arr.slice(0, Math.ceil(n * 0.3)), mid: arr.slice(Math.ceil(n * 0.3), Math.ceil(n * 0.65)), low: arr.slice(Math.ceil(n * 0.65)) };
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

/** Choose a start/target pair. Returns {start, target} canonical, not identical, not directly linked. */
export async function pickPair({ category = 'random', difficulty = 'medium', rnd = Math.random, exclude = [] }) {
  const pools = await loadJSON('pools');
  const cat = pools.categories[category] || pools.categories.random;
  const T = tiers(cat.articles);
  for (let attempt = 0; attempt < 14; attempt++) {
    let s, t;
    if (difficulty === 'easy') { s = pick(T.top, rnd); t = pick(T.top, rnd); }
    else if (difficulty === 'hard') { s = pick(T.low, rnd); t = pick(T.low.filter((a) => a[2] >= 30), rnd) || pick(T.mid, rnd); }
    else { s = pick(T.mid, rnd); t = pick(T.top, rnd); }
    if (!s || !t || s[0] === t[0] || exclude.includes(s[0]) || exclude.includes(t[0])) continue;
    try {
      const res = await resolveTitles([s[0], t[0]]);
      const start = res[s[0]], target = res[t[0]];
      if (!start || !target || sameTitle(start, target)) continue;
      const direct = await linksTo(start, [target]);
      if (direct.length) continue;
      const sum = await fetchSummary(target).catch(() => null);
      if (sum?.disambiguation) continue;
      return { start, target };
    } catch (e) {
      if (attempt > 3) throw e;
    }
  }
  throw new Error('לא נמצא זוג מתאים');
}

/** Resolve user's custom pair. Throws a Hebrew message on problems. */
export async function customPair(startRaw, targetRaw) {
  const res = await resolveTitles([startRaw, targetRaw]);
  const start = res[startRaw], target = res[targetRaw];
  if (!start) throw new Error(`הערך "${startRaw}" לא נמצא`);
  if (!target) throw new Error(`הערך "${targetRaw}" לא נמצא`);
  if (sameTitle(start, target)) throw new Error('ערך ההתחלה והיעד זהים');
  return { start, target };
}

/** Pick a forbidden hub for a pair: prefer a hub the start article links to. */
export async function pickForbidden(start, target, rnd = Math.random) {
  const candidates = HUBS.filter((h) => !sameTitle(h, start) && !sameTitle(h, target));
  try {
    const linked = await linksTo(start, candidates);
    if (linked.length) return linked[Math.floor(rnd() * linked.length)];
  } catch {}
  return (await resolveTitle(candidates[0])) || candidates[0];
}

// ---- daily ----
export function jerusalemDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
/** ms until next midnight in Jerusalem */
export function msToJerusalemMidnight(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const [h, m, s] = fmt.format(now).split(':').map(Number);
  return ((23 - h) * 3600 + (59 - m) * 60 + (60 - s)) * 1000 - now.getMilliseconds();
}
export async function todaysDaily() {
  const d = await loadJSON('daily');
  const date = jerusalemDate();
  const day = d.days?.[date];
  return day ? { date, ...day } : null;
}
