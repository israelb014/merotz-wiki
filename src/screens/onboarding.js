import { icon } from '../lib/icons.js';
import { state, save } from '../lib/store.js';
import { uid } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { pickerHtml, bindPicker, nameInput } from './profile-picker.js';
import { logo } from './home.js';
import { toast } from '../lib/ui.js';

export default function onboarding(app, q) {
  const model = { name: '', avatar: 'compass', color: 'blue' };
  app.innerHTML = `<main class="screen onboarding">
    ${logo()}
    <p class="lead center">מגיעים מערך לערך בוויקיפדיה – רק דרך קישורים. מי יגיע ראשון?</p>
    <div class="card stack">${nameInput()}</div>
    <div class="mt">${pickerHtml(model)}</div>
    <button class="btn primary mt" id="go">${icon('check')} יאללה, מתחילים</button>
  </main>`;
  bindPicker(app, model);
  const input = app.querySelector('#nick');
  setTimeout(() => input.focus(), 300);
  const submit = async () => {
    const name = input.value.trim();
    if (name.length < 2) { toast('כינוי צריך להיות לפחות 2 תווים'); input.focus(); return; }
    state.profile = { id: uid(8), name, avatar: model.avatar, color: model.color };
    await save('profile');
    try { localStorage.setItem('mw-seen-cl-first', '1'); } catch {}
    go(q.next || '/', { replace: true, query: q.code ? { code: q.code } : undefined });
  };
  app.querySelector('#go').onclick = submit;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
}
