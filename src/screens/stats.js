import { icon } from '../lib/icons.js';
import { esc, on, ring, fmtTime, fmtDate, clicksLabel } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar } from '../lib/ui.js';
import { computeStats, ACHIEVEMENTS, isWin } from '../lib/stats.js';
import { listGames, state } from '../lib/store.js';
import { MODES, MODE_LIST, STATUS_LABEL } from '../lib/modes.js';
import { routeVertical } from './route-view.js';

const KIND = { solo: 'משחק מהיר', mp: 'חדר', campaign: 'שלבים', daily: 'אתגר יומי' };

export default async function stats(app, q) {
  const tab = q.tab || 'stats';
  app.innerHTML = `<main class="screen stats">
    ${appBar({ title: 'הסטטיסטיקה שלי' })}
    <div class="seg tabs" role="tablist">
      <button role="tab" data-tab="stats" class="${tab === 'stats' ? 'on' : ''}">נתונים</button>
      <button role="tab" data-tab="history" class="${tab === 'history' ? 'on' : ''}">היסטוריה</button>
      <button role="tab" data-tab="ach" class="${tab === 'ach' ? 'on' : ''}">הישגים</button>
    </div>
    <div id="tab-body" class="mt"><div class="spinner"></div></div>
  </main>`;
  on(app, 'click', '[data-back]', () => back());
  on(app, 'click', '[data-tab]', (e, t) => go('/stats', { replace: true, query: { tab: t.dataset.tab } }));
  const body = app.querySelector('#tab-body');
  if (tab === 'stats') {
    const s = await computeStats();
    body.innerHTML = `
      <section class="rings-row">
        <div class="ring-tile card">${ring({ size: 104, stroke: 9, pct: s.winRate, inner: `<b class="num" style="font-size:24px">${Math.round(s.winRate * 100)}%</b>` })}<span>אחוז הצלחה</span></div>
        <div class="ring-tile card">${ring({ size: 104, stroke: 9, pct: Math.min(1, s.streak.current / 7), inner: `<b class="num" style="font-size:28px">${s.streak.current}</b><span class="ring-sub">ימים</span>` })}<span>רצף יומי</span></div>
        <div class="ring-tile card">${ring({ size: 104, stroke: 9, pct: s.stars / 180, inner: `<b class="num" style="font-size:24px">${s.stars}</b><span class="ring-sub">/180</span>` })}<span>כוכבי שלבים</span></div>
      </section>
      <section class="stat-grid mt">
        <div class="card stat"><b class="num">${s.games}</b><span>משחקים</span></div>
        <div class="card stat"><b class="num">${s.wins}</b><span>ניצחונות</span></div>
        <div class="card stat"><b class="num">${s.avgClicks == null ? '–' : s.avgClicks.toFixed(1)}</b><span>ממוצע קליקים</span></div>
        <div class="card stat"><b class="num">${s.streak.best}</b><span>רצף יומי שיא</span></div>
      </section>
      <section class="card mt">
        <h3 class="card-title">${icon('clock', { size: 20 })} הזמן הכי טוב לפי מצב</h3>
        <div class="list">${MODE_LIST.map((m) => `<div class="list-row"><span class="ic-wrap">${icon(m.icon)}</span><span class="lbl">${m.name}</span><b class="num">${fmtTime(s.bestTime[m.id])}</b></div>`).join('')}</div>
      </section>`;
  } else if (tab === 'history') {
    const games = await listGames();
    body.innerHTML = games.length ? `<div class="stack">${games.map((g) => `<button class="card hist-row" data-id="${g.id}">
        <span class="hist-ic ${isWin(g) ? 'win' : g.status === 'finished' ? 'ok' : 'lose'}">${icon(isWin(g) ? 'trophy' : g.status === 'finished' ? 'check' : 'close', { size: 20 })}</span>
        <span class="grow"><b class="hist-pair">${esc(g.start)} ← ${esc(g.target)}</b><span class="muted small">${KIND[g.kind] || ''} · ${MODES[g.mode]?.name || ''} · ${fmtDate(g.ts)}${g.kind === 'mp' && g.rank ? ` · מקום ${g.rank}` : ''}</span></span>
        <span class="hist-meta"><b class="num">${g.clicks}</b><span class="muted small num">${fmtTime(g.elapsed)}</span></span>
      </button>`).join('')}</div>` : `<div class="card center stack">${icon('history', { size: 40 })}<p class="muted" style="margin:0">עוד לא שיחקתם. המשחקים האחרונים יופיעו כאן.</p></div>`;
    on(body, 'click', '[data-id]', (e, t) => {
      const g = games.find((x) => x.id === t.dataset.id);
      import('../lib/ui.js').then(({ openOverlay }) => openOverlay(`
        <h2 class="h-md">${esc(g.start)} ← ${esc(g.target)}</h2>
        <p class="muted" style="margin:4px 0 14px">${KIND[g.kind] || ''} · ${MODES[g.mode]?.name || ''} · ${STATUS_LABEL[g.status] || ''} · ${clicksLabel(g.clicks)} · ${fmtTime(g.elapsed)}</p>
        ${g.forbidden ? `<p class="forbid-note">${icon('ban', { size: 18 })} ערך אסור: <b>${esc(g.forbidden)}</b></p>` : ''}
        ${routeVertical(g.path || [], { target: g.target, status: g.status })}
        ${g.players?.length > 1 ? `<h3 class="card-title mt">דירוג החדר</h3><ol class="mini-rank">${g.players.map((p) => `<li><b>${esc(p.name)}</b> <span class="muted">${p.status === 'finished' ? `${clicksLabel(p.clicks)} · ${fmtTime(p.elapsed)}` : STATUS_LABEL[p.status]}</span></li>`).join('')}</ol>` : ''}
        <button class="btn mt" data-close>סגירה</button>`));
    });
  } else {
    const got = state.achievements;
    const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
    body.innerHTML = `<div class="ach-head card">${ring({ size: 84, stroke: 8, pct: n / ACHIEVEMENTS.length, inner: `<b class="num">${n}</b>` })}<div><h3 class="h-md">${n} מתוך ${ACHIEVEMENTS.length}</h3><span class="muted">הישגים נפתחו</span></div></div>
      <div class="ach-grid mt">${ACHIEVEMENTS.map((a) => `<div class="card ach ${got[a.id] ? 'got' : ''}"><span class="ach-ic">${icon(got[a.id] ? a.icon : 'lock', { size: 26 })}</span><b>${a.name}</b><span class="muted small">${a.desc}</span>${got[a.id] ? `<span class="ach-date small">${fmtDate(got[a.id])}</span>` : ''}</div>`).join('')}</div>`;
  }
}
