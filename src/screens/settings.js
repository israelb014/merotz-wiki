import { icon, avatarBadge } from '../lib/icons.js';
import { esc, on } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar, openOverlay, toast, confirmDialog } from '../lib/ui.js';
import { state, save, exportBackup, importBackup } from '../lib/store.js';
import { applyTheme } from '../theme.js';
import { pickerHtml, bindPicker, nameInput } from './profile-picker.js';
import { loadJSON } from '../lib/data.js';
import { shellVersion, isNative, desktop, openExternal } from '../lib/platform.js';
import { play } from '../lib/sound.js';
import { vibrate } from '../lib/haptics.js';

const sw = (key, checked) => `<span class="switch"><input type="checkbox" data-set="${key}" ${checked ? 'checked' : ''} aria-label="${key}"><span></span></span>`;

export default async function settings(app) {
  const s = state.settings;
  const p = state.profile;
  const cl = await loadJSON('changelog').catch(() => null);
  const shell = await shellVersion();
  app.innerHTML = `<main class="screen settings">
    ${appBar({ title: 'הגדרות' })}
    <button class="card profile-card" id="profile">
      ${avatarBadge(p, 58)}
      <span class="grow"><b class="h-md">${esc(p.name)}</b><span class="muted small">לחצו לעריכת כינוי ואווטאר</span></span>
      ${icon('edit')}
    </button>

    <h2 class="group-title">מראה</h2>
    <div class="seg" role="radiogroup" aria-label="ערכת נושא">
      ${[['light', 'בהיר', 'sun'], ['dark', 'כהה', 'moon'], ['system', 'לפי המערכת', 'monitor']].map(([v, l, ic]) => `<button data-theme="${v}" class="${s.theme === v ? 'on' : ''}" role="radio" aria-checked="${s.theme === v}">${icon(ic, { size: 18 })} ${l}</button>`).join('')}
    </div>

    <h2 class="group-title">צלילים ורטט</h2>
    <div class="card flat list">
      <label class="list-row"><span class="ic-wrap">${icon('volume')}</span><span class="lbl">צלילים<span class="sub">צלילים עדינים במשחק</span></span>${sw('sound', s.sound)}</label>
      <label class="list-row"><span class="ic-wrap">${icon('vibrate')}</span><span class="lbl">רטט<span class="sub">באנדרואיד ובטלפונים תומכים</span></span>${sw('vibration', s.vibration)}</label>
    </div>

    <h2 class="group-title">חוקי ברירת מחדל</h2>
    <div class="card flat list">
      <label class="list-row"><span class="ic-wrap">${icon('arrowRight')}</span><span class="lbl">כפתור חזרה<span class="sub">מותר, עולה קליק אחד</span></span>${sw('allowBack', s.allowBack)}</label>
      <label class="list-row"><span class="ic-wrap">${icon('search')}</span><span class="lbl">חיפוש בתוך הערך<span class="sub">חיפוש מילה בערך הנוכחי</span></span>${sw('allowFind', s.allowFind)}</label>
    </div>

    <h2 class="group-title">נתונים</h2>
    <div class="card flat list">
      <button class="list-row" id="export"><span class="ic-wrap">${icon('download')}</span><span class="lbl">ייצוא גיבוי<span class="sub">שמירת ההתקדמות לקובץ</span></span></button>
      <button class="list-row" id="import"><span class="ic-wrap">${icon('upload')}</span><span class="lbl">ייבוא גיבוי<span class="sub">שחזור מקובץ גיבוי</span></span></button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <h2 class="group-title">כללי</h2>
    <div class="card flat list">
      <button class="list-row" id="whatsnew"><span class="ic-wrap">${icon('sparkle')}</span><span class="lbl">מה חדש</span>${icon('chevronLeft', { size: 18 })}</button>
      <button class="list-row" id="about"><span class="ic-wrap">${icon('info')}</span><span class="lbl">אודות</span>${icon('chevronLeft', { size: 18 })}</button>
      ${!isNative() && !desktop() ? `<a class="list-row" href="${import.meta.env.BASE_URL}download/"><span class="ic-wrap">${icon('download')}</span><span class="lbl">הורדת האפליקציה<span class="sub">Windows · Linux · Android</span></span>${icon('chevronLeft', { size: 18 })}</a>` : ''}
    </div>
    <p class="version muted small center">גרסה ${__APP_VERSION__}${cl ? ` · תוכן ${cl[0]?.version}` : ''}${shell ? ` · אפליקציה ${shell}` : ''}</p>
  </main>`;

  on(app, 'click', '[data-back]', () => back());
  on(app, 'click', '[data-theme]', async (e, t) => {
    s.theme = t.dataset.theme; await save('settings'); applyTheme();
    app.querySelectorAll('[data-theme]').forEach((b) => { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', b === t); });
  });
  on(app, 'change', '[data-set]', async (e, t) => {
    s[t.dataset.set] = t.checked; await save('settings');
    if (t.dataset.set === 'sound' && t.checked) play('click');
    if (t.dataset.set === 'vibration' && t.checked) vibrate('medium');
  });
  app.querySelector('#profile').onclick = () => editProfile(() => settings(app));
  app.querySelector('#whatsnew').onclick = () => cl && showChangelog(cl, true);
  app.querySelector('#about').onclick = showAbout;
  app.querySelector('#export').onclick = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `merotz-wiki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (isNative() && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch {} }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('קובץ הגיבוי נשמר');
  };
  const fileIn = app.querySelector('#import-file');
  app.querySelector('#import').onclick = () => fileIn.click();
  fileIn.onchange = async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!(await confirmDialog({ title: 'לשחזר מהגיבוי?', text: 'ההתקדמות הנוכחית תוחלף בנתונים מהקובץ.', ok: 'שחזור' }))) return;
      await importBackup(data); applyTheme(); toast('הגיבוי שוחזר'); settings(app);
    } catch { toast('קובץ הגיבוי לא תקין'); }
    fileIn.value = '';
  };
}

export function editProfile(after) {
  const model = { ...state.profile };
  const o = openOverlay(`<h2 class="h-lg" style="margin-bottom:12px">הפרופיל שלי</h2>
    <div class="stack">${nameInput(model.name)}${pickerHtml(model)}<button class="btn primary rect" id="save">שמירה</button></div>`);
  bindPicker(o.node, model);
  o.node.querySelector('#save').onclick = async () => {
    const name = o.node.querySelector('#nick').value.trim();
    if (name.length < 2) { toast('כינוי צריך להיות לפחות 2 תווים'); return; }
    state.profile = { ...state.profile, name, avatar: model.avatar, color: model.color };
    await save('profile'); o.close(); after?.();
  };
}

export function showAbout() {
  openOverlay(`<h2 class="h-lg">אודות מרוץ ויקי</h2>
    <div class="about stack">
      <p>מגיעים מערך התחלה לערך יעד בוויקיפדיה העברית – רק דרך קישורים פנימיים. לבד, נגד השעון, במסלול שלבים, באתגר היומי או עם עד 5 חברים.</p>
      <div class="card flat"><b>${icon('book', { size: 18 })} התוכן</b><p style="margin:6px 0 0">כל הערכים מגיעים מ<a href="#" data-ext="https://he.wikipedia.org/">ויקיפדיה העברית</a> ומוצגים ברישיון <a href="#" data-ext="https://creativecommons.org/licenses/by-sa/4.0/deed.he">CC BY-SA 4.0</a>. הכותבים: עורכי ויקיפדיה. קישור לכל ערך במקור נמצא בתפריט הערך (⋮) בזמן המשחק.</p></div>
      <div class="card flat"><b>${icon('shield', { size: 18 })} אין קשר לוויקימדיה</b><p style="margin:6px 0 0">מרוץ ויקי הוא פרויקט עצמאי ואינו קשור לקרן ויקימדיה או לוויקיפדיה, ואינו מאושר על ידן.</p></div>
      <div class="card flat"><b>${icon('lock', { size: 18 })} פרטיות</b><p style="margin:6px 0 0">אין הרשמה. הכינוי, ההתקדמות וההיסטוריה נשמרים רק במכשיר שלכם. במשחק חברים נשלחים רק כינוי, אווטאר ומספר קליקים.</p></div>
      <p class="muted small">גרסה ${__APP_VERSION__} · <a href="#" data-ext="https://github.com/israelb014/merotz-wiki">קוד המקור</a></p>
    </div>
    <button class="btn mt" data-close>סגירה</button>`).node.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ext]'); if (a) { e.preventDefault(); openExternal(a.dataset.ext); }
  });
}

export function showChangelog(cl, all = false) {
  const items = all ? cl : cl.slice(0, 1);
  openOverlay(`<div class="center"><span class="upd-ic">${icon('sparkle', { size: 30 })}</span><h2 class="h-lg">מה חדש</h2></div>
    <div class="changelog">${items.map((v) => `<section><h3>גרסה ${esc(v.version)} <span class="muted small">${esc(v.date || '')}</span></h3>${v.title ? `<p class="cl-title">${esc(v.title)}</p>` : ''}<ul>${v.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('')}</div>
    <button class="btn primary mt" data-close>מעולה</button>`, { type: 'modal' });
}
