import { icon } from '../lib/icons.js';
import { esc, on } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar, toast } from '../lib/ui.js';
import { loadJSON } from '../lib/data.js';
import { state } from '../lib/store.js';
import { startPending } from '../app.js';
import { CATEGORIES } from '../lib/modes.js';

export const WORLD_UNLOCK = 20; // stars per world step

export function startLevel(lvl) {
  startPending({
    start: lvl.start, target: lvl.target, forbidden: null,
    settings: { mode: 'fewest', allowBack: true, allowFind: true },
    kind: 'campaign',
    meta: { levelId: lvl.id, par: lvl.par, shortestPath: lvl.path, world: lvl.world?.id ?? lvl.worldId },
  });
}

export function campaignProgress(camp) {
  const total = Object.values(state.campaign).reduce((a, b) => a + (b || 0), 0);
  return camp.worlds.map((w, wi) => {
    const unlocked = total >= WORLD_UNLOCK * wi;
    const stars = w.levels.reduce((a, l) => a + (state.campaign[l.id] || 0), 0);
    const levels = w.levels.map((l, li) => ({ ...l, worldId: w.id, stars: state.campaign[l.id] || 0, open: unlocked && (li === 0 || (state.campaign[w.levels[li - 1].id] || 0) >= 1) }));
    return { ...w, unlocked, stars, levels, need: WORLD_UNLOCK * wi };
  });
}

export default async function campaign(app) {
  app.innerHTML = `<main class="screen campaign">${appBar({ title: 'מסלול שלבים' })}<div class="center mt-l"><div class="spinner"></div></div></main>`;
  on(app, 'click', '[data-back]', () => back());
  let camp;
  try { camp = await loadJSON('campaign'); } catch { app.querySelector('.center').innerHTML = '<p class="muted">לא הצלחנו לטעון את השלבים</p>'; return; }
  const worlds = campaignProgress(camp);
  const total = worlds.reduce((a, w) => a + w.stars, 0);
  const max = worlds.reduce((a, w) => a + w.levels.length * 3, 0);
  const pos = (i) => ({ x: [74, 50, 26, 50][i % 4], y: 50 + i * 78 });
  app.querySelector('.screen').innerHTML = `${appBar({ title: 'מסלול שלבים', end: `<span class="pill star-pill">${icon('starFill', { size: 18 })}<b class="num">${total}</b><span class="muted">/${max}</span></span>` })}
    ${worlds.map((w) => {
      const cat = CATEGORIES.find((c) => c.id === w.category);
      const pts = w.levels.map((_, i) => { const p = pos(i); return `${p.x},${p.y}`; });
      return `<section class="world ${w.unlocked ? '' : 'locked'}" id="w${w.id}">
        <header class="world-head card">
          <span class="world-ic">${icon(cat?.icon || 'route', { size: 26 })}</span>
          <div class="grow"><span class="muted small">עולם ${w.id}</span><h2 class="h-md">${esc(w.name)}</h2></div>
          ${w.unlocked ? `<span class="world-stars">${icon('starFill', { size: 18 })}<b class="num">${w.stars}</b>/30</span>` : `<span class="world-lock">${icon('lock', { size: 18 })} ${w.need} כוכבים</span>`}
        </header>
        <div class="world-map" style="height:${40 + w.levels.length * 78}px">
          <svg class="world-path" viewBox="0 0 100 ${40 + w.levels.length * 78}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--primary)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-dasharray="${w.unlocked ? '0' : '6 6'}"/></svg>
          ${w.levels.map((l, i) => { const p = pos(i); return `<button class="lvl ${p.x < 50 ? 'side-l' : ''} ${l.open ? '' : 'closed'} ${l.stars ? 'done' : ''}" style="right:${100 - p.x}%;top:${p.y}px" data-lvl="${l.id}" aria-label="שלב ${l.id}${l.open ? '' : ' נעול'}">
              <span class="lvl-node">${l.open ? `<b class="num">${i + 1}</b>` : icon('lock', { size: 18 })}</span>
              <span class="lvl-stars">${[1, 2, 3].map((s) => icon(s <= l.stars ? 'starFill' : 'star', { size: 14, cls: s <= l.stars ? 'on' : '' })).join('')}</span>
              ${l.open ? `<span class="lvl-label">${esc(l.start)} ← ${esc(l.target)}</span>` : ''}
            </button>`; }).join('')}
        </div>
      </section>`;
    }).join('')}`;
  // (the [data-back] handler bound above keeps working: it is delegated on `app`)
  on(app, 'click', '[data-lvl]', (e, t) => {
    const lvl = worlds.flatMap((w) => w.levels).find((l) => l.id === t.dataset.lvl);
    if (!lvl.open) { toast(worlds.find((w) => w.id === lvl.worldId).unlocked ? 'סיימו את השלב הקודם כדי לפתוח' : 'העולם הזה עוד נעול'); return; }
    startLevel(lvl);
  });
  // scroll to first open-but-unfinished level
  const next = worlds.flatMap((w) => w.levels).find((l) => l.open && !l.stars);
  if (next) setTimeout(() => app.querySelector(`[data-lvl="${next.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
}
