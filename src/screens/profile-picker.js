import { icon, AVATARS, COLORS } from '../lib/icons.js';
import { esc, on } from '../lib/dom.js';

/** Avatar picker card (5 colors × 12 line-icon avatars). Returns html; call bindPicker(root, model) after mount. */
export function pickerHtml(model, { title = 'אווטאר' } = {}) {
  return `<section class="card picker" aria-label="בחירת אווטאר">
    ${title ? `<h3 class="picker-title">${title}</h3>` : ''}
    <div class="colors" role="radiogroup" aria-label="צבע">
      ${COLORS.map((c) => `<button class="color-dot ${model.color === c.id ? 'on' : ''}" data-color="${c.id}" role="radio" aria-checked="${model.color === c.id}" aria-label="${c.name}" style="--dot:${c.hex}"></button>`).join('')}
    </div>
    <div class="avatars" role="radiogroup" aria-label="סמל">
      ${AVATARS.map((a) => `<button class="av-opt ${model.avatar === a ? 'on' : ''}" data-avatar="${a}" role="radio" aria-checked="${model.avatar === a}" aria-label="${a}">${icon(a, { size: 34, sw: 1.5 })}</button>`).join('')}
    </div>
  </section>`;
}
export function bindPicker(root, model, onChange) {
  const sync = () => {
    root.querySelectorAll('.color-dot').forEach((b) => { const on_ = b.dataset.color === model.color; b.classList.toggle('on', on_); b.setAttribute('aria-checked', on_); });
    root.querySelectorAll('.av-opt').forEach((b) => { const on_ = b.dataset.avatar === model.avatar; b.classList.toggle('on', on_); b.setAttribute('aria-checked', on_); });
    root.querySelector('.picker')?.style.setProperty('--sel', COLORS.find((c) => c.id === model.color)?.hex);
  };
  on(root, 'click', '.color-dot', (e, t) => { model.color = t.dataset.color; sync(); onChange?.(); });
  on(root, 'click', '.av-opt', (e, t) => { model.avatar = t.dataset.avatar; sync(); onChange?.(); });
  sync();
}
export const nameInput = (value = '') => `<div class="field"><label for="nick">כינוי</label>
  <input id="nick" class="input" maxlength="16" placeholder="הכנס כינוי..." value="${esc(value)}" autocomplete="nickname" enterkeyhint="done" /></div>`;
