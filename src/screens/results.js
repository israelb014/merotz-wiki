import { icon, avatarBadge, colorHex } from '../lib/icons.js';
import { esc, on, ring, fmtTime, clicksLabel } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { appBar, confirmDialog, toast } from '../lib/ui.js';
import { MODES, STATUS_LABEL } from '../lib/modes.js';
import { shareText, share } from '../lib/share.js';
import { routeLine, routeVertical } from './route-view.js';
import { ctx, recordResult, startPending, soloSettings } from '../app.js';
import { msToJerusalemMidnight, loadJSON, pickPair, pickForbidden } from '../lib/data.js';
import { play } from '../lib/sound.js';

const STATUS_TITLE = { finished: 'הגעת ליעד!', gaveup: 'ויתרת', failed: 'נכשל', dq: 'נפסלת', timeout: 'נגמר הזמן' };
const STATUS_ICON = { finished: 'trophy', gaveup: 'flag', failed: 'steps', dq: 'ban', timeout: 'clock' };

export default function results(app) {
  if (ctx.room && ctx.session?.kind === 'mp') return mpResults(app);
  const r = ctx.result;
  if (!r) { go('/', { replace: true }); return; }
  return soloResults(app, r);
}

function soloResults(app, r) {
  const won = r.status === 'finished';
  let ringHtml;
  if (r.kind === 'campaign') {
    const st = r.stars || 0;
    ringHtml = `<div class="stars-big" aria-label="${st} כוכבים">${[1, 2, 3].map((i) => `<span class="${i <= st ? 'on' : ''}" style="animation-delay:${i * 180}ms">${icon(i <= st ? 'starFill' : 'star', { size: 46, sw: 1.6 })}</span>`).join('')}</div>`;
  } else if (r.par && won) {
    const pct = Math.min(1, r.par / r.clicks);
    ringHtml = ring({ size: 140, stroke: 11, pct, inner: `<b class="num" style="font-size:38px">${r.clicks}</b><span class="ring-sub">קליקים</span>` });
  } else {
    ringHtml = ring({ size: 140, stroke: 11, pct: won ? 1 : 0.25, cls: won ? '' : 'danger', inner: `<b class="num" style="font-size:38px">${r.clicks}</b><span class="ring-sub">קליקים</span>` });
  }
  const isDaily = r.kind === 'daily';
  app.innerHTML = `<main class="screen results">
    ${appBar({ title: isDaily ? 'אתגר יומי' : r.kind === 'campaign' ? `שלב ${r.levelId}` : 'תוצאה', end: '' })}
    <section class="card res-hero ${won ? 'win' : 'lose'}">
      <span class="res-badge">${icon(STATUS_ICON[r.status] || 'flag', { size: 20 })} ${STATUS_TITLE[r.status] || ''}</span>
      <div class="res-ring">${ringHtml}</div>
      <div class="res-stats">
        <div><b class="num">${r.clicks}</b><span>קליקים</span></div>
        <div><b class="num">${fmtTime(r.elapsed)}</b><span>זמן</span></div>
        ${r.par ? `<div><b class="num">${r.par}</b><span>המסלול הקצר</span></div>` : `<div><b>${MODES[r.mode]?.name || ''}</b><span>מצב</span></div>`}
      </div>
      ${r.par && won ? `<p class="res-note">${r.clicks <= r.par ? 'בדיוק כמו המסלול הקצר ביותר – מושלם!' : `${r.clicks - r.par} קליקים יותר מהמסלול הקצר ביותר`}</p>` : ''}
    </section>
    <section class="card mt">
      <h3 class="card-title">${icon('route', { size: 20 })} המסלול שלך</h3>
      ${routeVertical(r.path, { target: r.target, status: r.status })}
    </section>
    ${r.shortestPath?.length ? `<section class="card mt shortest">
      <h3 class="card-title">${icon('bolt', { size: 20 })} המסלול הקצר ביותר (${r.shortestPath.length - 1} קליקים)</h3>
      ${routeLine(r.shortestPath.map((t) => ({ t })), 'var(--success)')}
    </section>` : ''}
    ${isDaily ? `<section class="card mt center tomorrow"><span class="muted">האתגר הבא בעוד</span><b class="num" id="cd">--:--:--</b></section>` : ''}
    <div class="stack mt-l">
      ${r.kind === 'campaign' ? `<button class="btn primary" id="next">${icon('arrowUpLeft')} ${won ? 'לשלב הבא' : 'נסו שוב'}</button>` : ''}
      ${r.kind === 'solo' ? `<button class="btn primary" id="again">${icon('refresh')} משחק נוסף</button>` : ''}
      <button class="btn outline-strong" id="share">${icon('share')} שתף תוצאה</button>
      ${r.kind === 'campaign' ? `<button class="btn" data-go="/campaign">${icon('route')} למפת השלבים</button>` : ''}
      <button class="btn" data-go="/">${icon('home')} לתפריט הראשי</button>
    </div>
  </main>`;
  if (won) play('star');
  on(app, 'click', '[data-back]', () => go('/', { replace: true }));
  on(app, 'click', '[data-go]', (e, t) => go(t.dataset.go, { replace: true }));
  app.querySelector('#share').onclick = () => share(shareText(r));
  const again = app.querySelector('#again');
  if (again) again.onclick = async () => {
    const s = { ...soloSettings(), ...r.settings };
    again.disabled = true; again.innerHTML = '<span class="spinner sm"></span> בוחר זוג ערכים…';
    try {
      const pair = await pickPair({ category: s.category, difficulty: s.difficulty, exclude: [r.start, r.target] });
      const forbidden = s.mode === 'forbidden' ? await pickForbidden(pair.start, pair.target) : null;
      startPending({ ...pair, forbidden, settings: { ...s, customStart: '', customTarget: '' }, kind: 'solo', meta: { category: s.category, difficulty: s.difficulty } });
    } catch (e) { toast(e.message || 'שגיאה'); again.disabled = false; again.innerHTML = `${icon('refresh')} משחק נוסף`; }
  };
  const next = app.querySelector('#next');
  if (next) next.onclick = async () => {
    const camp = await loadJSON('campaign');
    const levels = camp.worlds.flatMap((w) => w.levels.map((l) => ({ ...l, world: w })));
    const idx = levels.findIndex((l) => l.id === r.levelId);
    const lvl = won ? levels[idx + 1] : levels[idx];
    if (!lvl) { go('/campaign', { replace: true }); return; }
    const { startLevel } = await import('./campaign.js');
    startLevel(lvl);
  };
  let cdTimer;
  if (isDaily) {
    const cd = app.querySelector('#cd');
    const upd = () => { const ms = msToJerusalemMidnight(); const s = Math.floor(ms / 1000); cd.textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    upd(); cdTimer = setInterval(upd, 1000);
  }
  return () => clearInterval(cdTimer);
}

// ---------------- multiplayer ----------------
const recordedRounds = new Set();

function mpResults(app) {
  const room = ctx.room;
  const g = ctx.session;
  let off;
  let lastSig = '';
  const render = () => {
    const st = room.state;
    if (!st) return;
    const sig = JSON.stringify([st.results?.roundId, st.results?.ranking?.map((p) => [p.id, p.status, p.rank]), Object.entries(room.routes).map(([k, v]) => [k, v?.length]), room.isHost, room.busy,
      room.round?.players?.map((p) => [p.id, room.progress[p.id]?.status, room.progress[p.id]?.clicks])]);
    if (sig === lastSig) return;
    lastSig = sig;
    const res = st.results && st.results.roundId === room.round?.id ? st.results : null;
    if (!res) return renderWaiting();
    if (!recordedRounds.has(res.roundId)) {
      recordedRounds.add(res.roundId);
      const mine = res.ranking.find((p) => p.id === room.me.id);
      if (mine && g) recordResult(g, { kind: 'mp', rank: mine.rank, playerCount: res.ranking.length, roundId: res.roundId, players: res.ranking.map((p) => ({ name: p.name, color: p.color, avatar: p.avatar, clicks: p.clicks, elapsed: p.elapsed, status: p.status, rank: p.rank })) });
      if (g) room.sendRoute(g.path, g.meta?.roundId);
      if (mine?.rank === 1) play('win');
    }
    renderFinal(res);
  };

  function renderWaiting() {
    const r = room.round;
    if (!r) return;
    app.innerHTML = `<main class="screen results">
      ${appBar({ title: 'ממתינים לשאר השחקנים', back: false })}
      <section class="card stack">
        ${r.players.map((p) => {
          const pr = p.id === room.me.id ? g?.progress() : room.progress[p.id];
          const s = pr?.status || 'playing';
          return `<div class="wait-row">${avatarBadge(p, 40)}<b class="grow">${esc(p.name)}</b><span class="tag ${s === 'finished' ? 'success' : s === 'playing' ? '' : 'danger'}">${s === 'playing' ? `${pr?.clicks ?? 0} קליקים…` : STATUS_LABEL[s]}</span></div>`;
        }).join('')}
      </section>
      <div class="center mt-l"><div class="spinner"></div><p class="muted">המסלולים המלאים ייחשפו בסיום</p></div>
    </main>`;
  }

  function renderFinal(res) {
    const rk = res.ranking;
    const podium = [rk[1], rk[0], rk[2]].map((p, i) => (p && p.rank ? { p, place: [2, 1, 3][i] } : null));
    const finishers = rk.filter((p) => p.status === 'finished');
    let best = null;
    for (const p of finishers) { const path = room.routes[p.id]; if (path && (!best || path.length < best.path.length)) best = { p, path }; }
    const isHost = room.isHost;
    app.innerHTML = `<main class="screen results mp">
      ${appBar({ title: 'תוצאות המרוץ' })}
      <section class="podium">
        ${podium.map((x) => x ? `<div class="pod pod-${x.place}">
          <span class="crown c${x.place}">${icon('crown', { size: x.place === 1 ? 38 : 30, sw: 1.6 })}<i>${x.place}</i></span>
          <span class="av big" style="--av:${colorHex(x.p.color)}"><b>${esc((x.p.name || '?')[0])}</b></span>
          <b class="pod-name">${esc(x.p.name)}</b>
          <span class="pod-meta num">${fmtTime(x.p.elapsed)} • ${clicksLabel(x.p.clicks)}</span>
        </div>` : '<div class="pod empty"></div>').join('')}
      </section>
      <section class="card routes-card">
        ${rk.map((p) => `<div class="route-row ${best?.p.id === p.id ? 'best' : ''}">
          <div class="route-row-head"><b>${esc(p.name)}</b><span class="muted num small">${p.status === 'finished' ? `${fmtTime(p.elapsed)} • ${clicksLabel(p.clicks)}` : `${STATUS_LABEL[p.status]} • ${clicksLabel(p.clicks)}`}</span></div>
          ${routeLine(room.routes[p.id], colorHex(p.color), { status: p.status })}
        </div>`).join('')}
      </section>
      ${best ? `<div class="best-banner"><b>המסלול הקצר ביותר:</b> ${best.path.map((x) => esc(x.t)).join(' ← ')}</div>` : ''}
      <div class="stack mt">
        ${isHost ? `<button class="btn primary" id="again" ${room.busy ? 'disabled' : ''}>${room.busy ? '<span class="spinner sm"></span> בוחר זוג…' : `${icon('refresh')} סיבוב נוסף`}</button>` : `<button class="btn primary" disabled>ממתינים למארח לסיבוב נוסף…</button>`}
        <button class="btn outline-strong" id="share">${icon('share')} שתף תוצאה</button>
        ${isHost ? `<button class="btn" id="lobby">${icon('gear')} שינוי הגדרות</button>` : ''}
      </div>
    </main>`;
    app.querySelector('[data-back]').onclick = leave;
    app.querySelector('#share').onclick = () => {
      const lines = [`מרוץ ויקי · ${MODES[res.mode]?.name}`, `${room.round.start} ← ${room.round.target}`, ...rk.map((p) => `${p.rank ? `${p.rank}.` : '–'} ${p.name}: ${p.status === 'finished' ? `${clicksLabel(p.clicks)} · ${fmtTime(p.elapsed)}` : STATUS_LABEL[p.status]}`), 'https://israelb014.github.io/merotz-wiki/'];
      share(lines.join('\n'));
    };
    const again = app.querySelector('#again');
    if (again) again.onclick = async () => {
      again.disabled = true; again.innerHTML = '<span class="spinner sm"></span> בוחר זוג…';
      try { await room.startRound(); } catch (e) { toast(e.message || 'שגיאה'); again.disabled = false; again.innerHTML = `${icon('refresh')} סיבוב נוסף`; }
    };
    const lobby = app.querySelector('#lobby');
    if (lobby) lobby.onclick = () => room.backToLobby();
  }

  async function leave() {
    if (await confirmDialog({ title: 'לצאת מהחדר?', ok: 'יציאה', danger: true })) {
      await room.leave(); ctx.room = null; go('/', { replace: true });
    }
  }
  off = room.on((type) => { if (['change', 'progress', 'routes', 'presence'].includes(type)) render(); });
  render();
  return () => off?.();
}
