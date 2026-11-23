import { go } from '../lib/router.js';
import { appBar } from '../lib/ui.js';
import { todaysDaily } from '../lib/data.js';
import { state } from '../lib/store.js';
import { ctx, startPending } from '../app.js';
import { icon } from '../lib/icons.js';

export default async function daily(app) {
  app.innerHTML = `<main class="screen">${appBar({ title: 'אתגר יומי' })}<div class="center mt-l"><div class="spinner"></div></div></main>`;
  app.querySelector('[data-back]').onclick = () => history.back();
  let d;
  try { d = await todaysDaily(); } catch {}
  if (!app.isConnected) return;
  if (!d) {
    app.querySelector('.center').innerHTML = `<div class="card stack center">${icon('calendar', { size: 40 })}<h2 class="h-md">האתגר של היום עוד לא מוכן</h2><p class="muted" style="margin:0">נסו שוב מאוחר יותר.</p></div>`;
    return;
  }
  const prev = state.daily[d.date];
  if (prev) {
    ctx.result = { kind: 'daily', mode: 'fewest', date: d.date, start: d.start, target: d.target, par: d.par, shortestPath: d.path, path: prev.path, clicks: prev.clicks, elapsed: prev.elapsed, status: prev.status, settings: { mode: 'fewest' } };
    go('/results', { replace: true });
    return;
  }
  startPending({
    start: d.start, target: d.target, forbidden: null,
    settings: { mode: 'fewest', allowBack: true, allowFind: true },
    kind: 'daily',
    meta: { date: d.date, par: d.par, shortestPath: d.path, category: d.category },
  });
  history.replaceState(null, '', '#/pregame');
}
