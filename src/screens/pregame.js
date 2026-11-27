import { icon } from '../lib/icons.js';
import { esc, ring, setRing } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { appBar, confirmDialog } from '../lib/ui.js';
import { fetchSummary } from '../lib/wiki.js';
import { GameSession } from '../lib/game.js';
import { MODES } from '../lib/modes.js';
import { play } from '../lib/sound.js';
import { vibrate } from '../lib/haptics.js';
import { ctx } from '../app.js';
import { state } from '../lib/store.js';
import { loadActiveGame } from '../lib/room.js';

export function articleCard(label, title, cls = '') {
  return `<article class="card pg-card ${cls}" data-title="${esc(title)}">
    <div class="pg-text">
      <span class="pg-label">${label}</span>
      <h2 class="pg-title">${esc(title)}</h2>
      <p class="pg-extract"><span class="skeleton" style="display:block;height:14px;margin:6px 0"></span><span class="skeleton" style="display:block;height:14px;width:70%"></span></p>
    </div>
    <div class="pg-thumb"></div>
  </article>`;
}
export async function fillCard(cardEl) {
  try {
    const s = await fetchSummary(cardEl.dataset.title);
    const ex = cardEl.querySelector('.pg-extract');
    ex.textContent = s.description && s.extract.length > 160 ? s.description : s.extract.slice(0, 150) + (s.extract.length > 150 ? '…' : '');
    if (s.thumb) cardEl.querySelector('.pg-thumb').innerHTML = `<img src="${esc(s.thumb)}" alt="" loading="lazy">`;
    else cardEl.querySelector('.pg-thumb').remove();
  } catch { cardEl.querySelector('.pg-extract').textContent = ''; }
}

export default function pregame(app) {
  const room = ctx.room;
  // multiplayer only when entered from the room flow (a solo start sets ctx.pending)
  const isMP = !!room && room.phase === 'playing' && !!room.round && room.inRound && !ctx.pending;
  const p = isMP ? { start: room.round.start, target: room.round.target, forbidden: room.round.forbidden, settings: room.round.settings, kind: 'mp' } : ctx.pending;
  if (!p) { go('/', { replace: true }); return; }
  // one daily attempt: once today's result exists the challenge can't be started again
  if (!isMP && p.kind === 'daily' && p.meta?.date && state.daily[p.meta.date]) { ctx.pending = null; go('/daily', { replace: true }); return; }
  const mode = MODES[p.settings.mode];
  const ruleText = {
    race: 'מי שמגיע ראשון – מנצח. עד 10 דקות.',
    clock: `${p.settings.timeLimit} דקות. מבין המגיעים – הכי מעט קליקים מנצח.`,
    fewest: 'בלי שעון. הכי מעט קליקים מנצח.',
    six: 'מקסימום 6 קליקים. בקליק השישי חייבים להגיע.',
    forbidden: 'הכי מעט קליקים – בלי לעבור דרך הערך האסור.',
  }[mode.id];

  app.innerHTML = `<main class="screen pregame">
    ${appBar({ title: 'מרוץ ויקי', navy: true, back: false, end: `<button class="icon-btn boxed" data-x aria-label="יציאה">${icon('close')}</button>` })}
    <div class="pg-stack">
      ${articleCard('ערך התחלה', p.start)}
      <div class="pg-link" aria-hidden="true"><span class="pn"></span><span class="pe"></span><span class="pn"></span><span class="pe arrow"></span><span class="pn"></span></div>
      ${articleCard('ערך יעד', p.target, 'target')}
    </div>
    ${p.forbidden ? `<div class="forbid-note">${icon('ban', { size: 20 })} אסור לעבור דרך: <b>${esc(p.forbidden)}</b></div>` : ''}
    <p class="pg-rule">${icon(mode.icon, { size: 18 })} <b>${mode.name}</b> · ${ruleText}</p>
    <div class="pg-count" id="count"></div>
  </main>`;
  app.querySelectorAll('.pg-card').forEach(fillCard);
  // prefetch start article
  import('../lib/wiki.js').then((w) => w.fetchArticle(p.start).catch(() => {}));

  let timer = null;
  let stopped = false;
  const countEl = app.querySelector('#count');

  const launch = (startAt) => {
    if (stopped) return;
    let session;
    if (isMP) {
      const snap = loadActiveGame(room.code, room.round.id);
      session = snap ? GameSession.restore(snap) : new GameSession({ ...p, startAt, limit: room.round.limit, meta: { roundId: room.round.id } });
    } else {
      session = new GameSession({ ...p, startAt });
    }
    ctx.session = session;
    play('go'); vibrate('medium');
    go('/play', { replace: true });
  };

  const countdown = (getStartAt) => {
    countEl.innerHTML = ring({ size: 150, stroke: 11, pct: 1, inner: `<b class="cd-num num" id="cdn">3</b><span class="cd-lbl">מתחילים בעוד...</span>` });
    let last = null;
    const r = countEl.querySelector('.ring');
    const total = 3000;
    const step = () => {
      if (stopped) return;
      const startAt = getStartAt();
      const left = startAt - Date.now();
      if (left <= 0) { launch(startAt); return; }
      const n = Math.ceil(left / 1000);
      if (n !== last && n <= 5) { last = n; const el = app.querySelector('#cdn'); if (el) { el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } if (n <= 3) play('tick'); }
      setRing(r, Math.min(1, left / Math.max(total, Math.min(left, 6000))));
      timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step); // never navigate synchronously during render
  };

  if (isMP) {
    // if round already running (reconnect / late), launch immediately
    countdown(() => room.hostToLocal(room.round.startAt));
  } else {
    countEl.innerHTML = `<button class="btn primary go-btn" id="ready">${icon('play', { size: 22 })} יאללה!</button>`;
    countEl.querySelector('#ready').onclick = () => { const s = Date.now() + 3000; countdown(() => s); };
  }

  app.querySelector('[data-x]').onclick = async () => {
    if (isMP) {
      if (await confirmDialog({ title: 'לצאת מהחדר?', text: 'הסיבוב יימשך בלעדיך.', ok: 'יציאה', danger: true })) {
        stopped = true; await room.leave(); ctx.room = null; go('/', { replace: true });
      }
    } else { stopped = true; go('/', { replace: true }); }
  };
  return () => { stopped = true; cancelAnimationFrame(timer); };
}
