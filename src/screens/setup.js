import { icon } from '../lib/icons.js';
import { on, esc } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar, toast } from '../lib/ui.js';
import { CATEGORIES, DIFFICULTIES, MODES } from '../lib/modes.js';
import { pickPair, customPair, pickForbidden } from '../lib/data.js';
import { ctx, soloSettings, persistSoloSettings, startPending } from '../app.js';
import { attachAutocomplete } from './autocomplete.js';
import { OfflineError } from '../lib/wiki.js';

export const ruleToggles = (s) => `
  <div class="card flat rules">
    <label class="rule-row"><span class="grow"><b>כפתור חזרה</b><span class="sub">מותר, ועולה קליק אחד</span></span><span class="switch"><input type="checkbox" data-rule="allowBack" ${s.allowBack ? 'checked' : ''}><span></span></span></label>
    <label class="rule-row"><span class="grow"><b>חיפוש בתוך הערך</b><span class="sub">חיפוש מילה בערך הנוכחי</span></span><span class="switch"><input type="checkbox" data-rule="allowFind" ${s.allowFind ? 'checked' : ''}><span></span></span></label>
  </div>`;

export default function setup(app, q) {
  const isRoom = q.ctx === 'room';
  const s = isRoom ? ctx.roomSettingsDraft : soloSettings();
  if (!s) { go('/', { replace: true }); return; }
  const customOpen = !!(s.customStart || s.customTarget);
  app.innerHTML = `<main class="screen setup">
    ${appBar({ title: 'קטגוריה ורמת קושי' })}
    <div class="mode-chip-row"><span class="tag solid">${icon(MODES[s.mode].icon, { size: 16 })} ${MODES[s.mode].name}${s.mode === 'clock' ? ` · ${s.timeLimit} דק׳` : ''}</span></div>
    <h2 class="group-title">קטגוריה</h2>
    <div class="cat-grid" role="radiogroup">
      ${CATEGORIES.map((c) => `<button class="chip ${s.category === c.id ? 'on' : ''}" data-cat="${c.id}" role="radio" aria-checked="${s.category === c.id}">${icon(c.icon, { size: 22 })}<span>${c.name}</span></button>`).join('')}
    </div>
    <h2 class="group-title">רמת קושי</h2>
    <div class="seg" role="radiogroup">${DIFFICULTIES.map((d) => `<button data-diff="${d.id}" class="${s.difficulty === d.id ? 'on' : ''}" role="radio" aria-checked="${s.difficulty === d.id}">${d.name}</button>`).join('')}</div>
    <details class="card flat custom" ${customOpen ? 'open' : ''}>
      <summary><span class="row">${icon('shareNodes', { size: 28 })}<b>זוג מותאם אישית</b></span>${icon('chevronDown', { cls: 'chev' })}</summary>
      <div class="stack" style="margin-top:14px">
        <div class="ac-wrap"><label class="float-lbl">מאמר התחלה</label><input class="input rect" id="cs" placeholder="מאמר התחלה לזוג משלכם..." value="${esc(s.customStart)}" autocomplete="off"></div>
        <div class="ac-wrap"><label class="float-lbl">מאמר יעד</label><input class="input rect" id="ct" placeholder="מאמר יעד לזוג משלכם..." value="${esc(s.customTarget)}" autocomplete="off"></div>
        <p class="muted small" style="margin:0">כשממלאים את שני השדות – הקטגוריה ורמת הקושי לא משפיעות.</p>
      </div>
    </details>
    <h2 class="group-title">חוקים</h2>
    ${ruleToggles(s)}
    <div class="sticky-cta"><button class="btn primary rect" id="next">המשך</button></div>
  </main>`;

  on(app, 'click', '[data-back]', () => back());
  on(app, 'click', '[data-cat]', (e, t) => {
    s.category = t.dataset.cat;
    app.querySelectorAll('[data-cat]').forEach((b) => { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', b === t); });
  });
  on(app, 'click', '[data-diff]', (e, t) => {
    s.difficulty = t.dataset.diff;
    app.querySelectorAll('[data-diff]').forEach((b) => { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', b === t); });
  });
  on(app, 'change', '[data-rule]', (e, t) => { s[t.dataset.rule] = t.checked; });
  const cs = app.querySelector('#cs'), ct = app.querySelector('#ct');
  attachAutocomplete(cs, (v) => (s.customStart = v));
  attachAutocomplete(ct, (v) => (s.customTarget = v));
  cs.addEventListener('input', () => (s.customStart = cs.value.trim()));
  ct.addEventListener('input', () => (s.customTarget = ct.value.trim()));

  const btn = app.querySelector('#next');
  btn.onclick = async () => {
    const hasCustom = s.customStart && s.customTarget;
    if ((s.customStart || s.customTarget) && !hasCustom) { toast('צריך למלא גם התחלה וגם יעד'); return; }
    if (isRoom) {
      if (hasCustom) {
        btn.disabled = true; btn.textContent = 'בודק…';
        try { const p = await customPair(s.customStart, s.customTarget); s.customStart = p.start; s.customTarget = p.target; }
        catch (e) { toast(e instanceof OfflineError ? 'אין חיבור לאינטרנט' : e.message); btn.disabled = false; btn.textContent = 'המשך'; return; }
      }
      ctx.room?.updateSettings({ ...s });
      go('/room', { replace: true, query: { code: ctx.room?.code || '' } });
      return;
    }
    persistSoloSettings();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner sm"></span> בוחר זוג ערכים…';
    try {
      const pair = hasCustom ? await customPair(s.customStart, s.customTarget) : await pickPair({ category: s.category, difficulty: s.difficulty });
      const forbidden = s.mode === 'forbidden' ? await pickForbidden(pair.start, pair.target) : null;
      startPending({ ...pair, forbidden, settings: { ...s }, kind: 'solo', meta: { category: hasCustom ? 'custom' : s.category, difficulty: hasCustom ? null : s.difficulty } });
    } catch (e) {
      console.error(e);
      toast(e instanceof OfflineError ? 'אין חיבור לאינטרנט' : e.message || 'שגיאה');
      btn.disabled = false; btn.textContent = 'המשך';
    }
  };
}
