import { icon, brandRoute } from '../lib/icons.js';
import { esc, on, ring, fmtTime } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { state } from '../lib/store.js';
import { todaysDaily, msToJerusalemMidnight } from '../lib/data.js';
import { openOverlay } from '../lib/ui.js';
import { desktop, isNative } from '../lib/platform.js';
import { randomCode } from '../lib/room.js';

export function logo() {
  return `<div class="logo" aria-label="מרוץ ויקי">
    <svg class="logo-route" viewBox="0 0 320 150" fill="none" aria-hidden="true">
      <path d="M150 22h70l18 18h22" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M150 22l-18 22" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M40 116h70l16 16h32l14-12 14-24" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${[[150, 22], [220, 22], [260, 40], [40, 116], [110, 116], [126, 132], [158, 132], [186, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="var(--bg)" stroke="var(--ink)" stroke-width="3"/>`).join('')}
    </svg>
    <h1 class="logo-text">מרוץ ויקי</h1>
  </div>`;
}

export default async function home(app) {
  const p = state.profile;
  app.innerHTML = `
  <main class="screen home">
    <div class="home-top">
      <button class="icon-btn" data-go="/stats" aria-label="סטטיסטיקה והישגים">${icon('chart', { size: 30 })}</button>
      <button class="me-chip" data-go="/settings" aria-label="פרופיל">${p ? `<span class="av" style="--av:var(--pc)">${icon(p.avatar, { size: 18, sw: 1.7 })}</span><span>${esc(p.name)}</span>` : ''}</button>
      <button class="icon-btn" data-go="/settings" aria-label="הגדרות">${icon('gear', { size: 30 })}</button>
    </div>
    ${logo()}
    <button class="daily-card" data-go="/daily" aria-label="אתגר יומי">
      <svg class="daily-deco" viewBox="0 0 120 150" fill="none" aria-hidden="true">
        <path d="M0 4l40 34M40 38v56l-30 52" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="40" cy="38" r="6" fill="var(--card)" stroke="var(--ink)" stroke-width="2.6"/>
        <circle cx="22" cy="125" r="6" fill="var(--card)" stroke="var(--ink)" stroke-width="2.6"/>
      </svg>
      <div class="daily-body">
        <span class="daily-label">אתגר יומי</span>
        <span class="daily-pair" id="daily-pair"><span class="skeleton" style="display:inline-block;width:180px;height:30px"></span></span>
      </div>
      <div class="daily-ring" id="daily-ring">${ring({ size: 74, stroke: 7, pct: 0, inner: '' })}</div>
    </button>
    <nav class="home-actions stack">
      <button class="btn primary" data-go="/modes">${icon('arrowUpRight', { size: 24 })}<span>משחק מהיר</span></button>
      <button class="btn" data-act="room">${icon('users', { size: 24 })}<span>חדר עם חברים</span></button>
      <button class="btn" data-go="/campaign">${icon('route', { size: 24 })}<span>מסלול שלבים</span></button>
      <button class="btn" data-go="/daily">${icon('star', { size: 24 })}<span>אתגר יומי</span></button>
    </nav>
    <footer class="home-foot">
      ${!isNative() && !desktop() ? `<a href="${import.meta.env.BASE_URL}download/" class="foot-link">${icon('download', { size: 18 })} הורדת האפליקציה</a>` : ''}
      <span class="muted small">התוכן מוויקיפדיה העברית · CC BY-SA 4.0</span>
    </footer>
  </main>`;
  if (p) app.querySelector('.me-chip .av').style.setProperty('--pc', `var(--c-${p.color})`);

  on(app, 'click', '[data-go]', (e, t) => go(t.dataset.go));
  on(app, 'click', '[data-act="room"]', () => roomSheet());

  // daily card
  try {
    const d = await todaysDaily();
    const pairEl = app.querySelector('#daily-pair');
    const ringEl = app.querySelector('#daily-ring');
    if (!pairEl) return;
    if (!d) { pairEl.textContent = 'בקרוב'; return; }
    pairEl.innerHTML = `<span>${esc(d.start)}</span> <span class="arr">←</span> <span>${esc(d.target)}</span>`;
    const res = state.daily[d.date];
    if (res?.status === 'finished') {
      const pct = Math.min(1, (d.par || res.clicks) / res.clicks);
      ringEl.innerHTML = ring({ size: 74, stroke: 7, pct, inner: `<span class="num" style="font-size:17px">${Math.round(pct * 100)}%</span>` });
      ringEl.title = 'יעילות: המסלול הקצר ביותר חלקי הקליקים שלך';
    } else {
      const left = msToJerusalemMidnight();
      ringEl.innerHTML = ring({ size: 74, stroke: 7, pct: 1 - left / 86400000, inner: `<span class="num" style="font-size:14px">${fmtTime(left / 60).replace(':', ':')}</span><span style="font-size:10px;font-weight:600;display:block">נותרו</span>` });
      ringEl.title = 'זמן שנותר לאתגר של היום (שעות:דקות)';
    }
  } catch {
    const pairEl = app.querySelector('#daily-pair');
    if (pairEl) pairEl.textContent = 'לא זמין כרגע';
  }
}

export function roomSheet() {
  const o = openOverlay(`
    <h2 class="h-lg center" style="margin-bottom:6px">חדר עם חברים</h2>
    <p class="muted center" style="margin:0 0 18px">עד 5 שחקנים, כל אחד במכשיר שלו</p>
    <div class="stack">
      <button class="btn primary" data-act="create">${icon('users')} פתיחת חדר חדש</button>
      <button class="btn" data-act="join">${icon('keyboard')} הצטרפות עם קוד</button>
    </div>`);
  o.node.querySelector('[data-act="create"]').onclick = () => { o.close(); go('/room', { query: { code: randomCode(), create: '1' } }); };
  o.node.querySelector('[data-act="join"]').onclick = () => { o.close(); go('/join'); };
}
