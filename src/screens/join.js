import { icon } from '../lib/icons.js';
import { on } from '../lib/dom.js';
import { go, back } from '../lib/router.js';
import { appBar, toast } from '../lib/ui.js';
import { state, save } from '../lib/store.js';
import { pickerHtml, bindPicker, nameInput } from './profile-picker.js';

export default function join(app, q) {
  const p = state.profile;
  const model = { name: p.name, avatar: p.avatar, color: p.color };
  const code = (q.code || '').replace(/\D/g, '').slice(0, 4);
  app.innerHTML = `<main class="screen join">
    ${appBar({ title: 'הצטרפות לחדר', navy: true })}
    <section class="card join-card">
      <h2 class="code-label">קוד חדר</h2>
      <div class="code-boxes ltr" role="group" aria-label="קוד חדר בן 4 ספרות">
        ${[0, 1, 2, 3].map((i) => `<input class="code-box num" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="ספרה ${i + 1}" value="${code[i] || ''}" data-i="${i}">`).join('')}
      </div>
      <svg class="code-wire" viewBox="0 0 300 40" fill="none" aria-hidden="true"><path d="M37 0v22a8 8 0 0 0 8 8h210a8 8 0 0 0 8-8V0M112 0v30M187 0v30" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round"/><circle cx="112" cy="30" r="5" fill="var(--primary)"/><circle cx="187" cy="30" r="5" fill="var(--primary)"/></svg>
      ${nameInput(model.name)}
    </section>
    <div class="mt">${pickerHtml(model)}</div>
    <div class="sticky-cta"><button class="btn primary rect" id="join">הצטרף לחדר</button></div>
  </main>`;
  bindPicker(app, model);
  on(app, 'click', '[data-back]', () => back());
  const boxes = [...app.querySelectorAll('.code-box')];
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      const v = b.value.replace(/\D/g, '');
      // a pasted / autofilled code arrives in one box (no maxlength, so paste is not truncated to 1 digit)
      if (v.length > 1) { v.split('').slice(0, 4 - i).forEach((d, j) => (boxes[i + j].value = d)); boxes[Math.min(3, i + v.length)].focus(); return; }
      b.value = v;
      if (v && i < 3) boxes[i + 1].focus();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; e.preventDefault(); }
      if (e.key === 'Enter') submit();
    });
    b.addEventListener('focus', () => b.select());
  });
  setTimeout(() => (code.length === 4 ? app.querySelector('#nick') : boxes[0]).focus(), 250);
  const submit = async () => {
    const c = boxes.map((b) => b.value).join('');
    if (!/^\d{4}$/.test(c)) { toast('קוד חדר הוא 4 ספרות'); boxes.find((b) => !b.value)?.focus(); return; }
    const name = app.querySelector('#nick').value.trim();
    if (name.length < 2) { toast('כינוי צריך להיות לפחות 2 תווים'); return; }
    state.profile = { ...state.profile, name, avatar: model.avatar, color: model.color };
    await save('profile');
    go('/room', { replace: true, query: { code: c } });
  };
  app.querySelector('#join').onclick = submit;
}
