import { icon } from '../lib/icons.js';
import { on } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar, openOverlay } from '../lib/ui.js';
import { MODES } from '../lib/modes.js';
import { ctx, soloSettings } from '../app.js';

export function modeCard(m, sel) {
  return `<button class="mode-card card ${sel ? 'sel' : ''}" data-mode="${m.id}">
    <span class="mode-name">${icon(m.icon, { size: 24, cls: 'mode-ic' })}<b>${m.name}</b></span>
    <span class="mode-desc">${m.desc}</span>
  </button>`;
}

export default function modes(app, q) {
  const isRoom = q.ctx === 'room';
  const settings = isRoom ? ctx.roomSettingsDraft : soloSettings();
  if (!settings) { go('/', { replace: true }); return; }
  app.innerHTML = `<main class="screen">
    ${appBar({ title: 'בחירת מצב משחק' })}
    <h2 class="group-title">עם זמן</h2>
    <div class="stack">${modeCard(MODES.race, settings.mode === 'race')}${modeCard(MODES.clock, settings.mode === 'clock')}</div>
    <h2 class="group-title">בלי זמן</h2>
    <div class="stack">${modeCard(MODES.fewest, settings.mode === 'fewest')}${modeCard(MODES.six, settings.mode === 'six')}${modeCard(MODES.forbidden, settings.mode === 'forbidden')}</div>
  </main>`;
  on(app, 'click', '[data-back]', () => back());
  const next = () => go('/setup', { query: { ctx: isRoom ? 'room' : 'solo' } });
  on(app, 'click', '[data-mode]', (e, t) => {
    settings.mode = t.dataset.mode;
    if (settings.mode === 'clock') {
      const o = openOverlay(`<h2 class="h-lg center">כמה זמן?</h2>
        <p class="muted center" style="margin:4px 0 18px">מי שמגיע עם הכי מעט קליקים בזמן הזה – מנצח</p>
        <div class="time-pick">${MODES.clock.limits.map((m) => `<button class="time-opt ${settings.timeLimit === m ? 'on' : ''}" data-min="${m}"><b class="num">${m}</b><span>דקות</span></button>`).join('')}</div>`);
      on(o.node, 'click', '[data-min]', (e2, b) => { settings.timeLimit = Number(b.dataset.min); o.close(); next(); });
    } else next();
  });
}
