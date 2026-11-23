import { el, on } from './dom.js';
import { icon } from './icons.js';

const root = () => document.getElementById('overlay-root');

export function toast(msg, ms = 2200) {
  const t = el(`<div class="toast" role="status"></div>`);
  t.textContent = msg;
  document.getElementById('toast-root').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
}

let stack = [];
export const overlayOpen = () => stack.length > 0;
export function closeTop() { const top = stack[stack.length - 1]; if (top) { top.close(); return true; } return false; }

/** Open a bottom sheet / modal. Returns {node, close, done(promise)} */
export function openOverlay(html, { type = 'sheet', dismissable = true, onClose, cls = '' } = {}) {
  const scrim = el(`<div class="scrim"></div>`);
  const box = el(`<div class="${type} ${cls}" role="dialog" aria-modal="true">${type === 'sheet' ? '<div class="grabber"></div>' : ''}${html}</div>`);
  root().append(scrim, box);
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let closed = false;
  const api = {
    node: box,
    done,
    close(val) {
      if (closed) return; closed = true;
      stack = stack.filter((x) => x !== api);
      box.classList.add('closing'); scrim.classList.add('closing');
      setTimeout(() => { box.remove(); scrim.remove(); }, 240);
      onClose?.(val);
      resolveDone(val);
    },
  };
  if (dismissable) scrim.addEventListener('click', () => api.close());
  on(box, 'click', '[data-close]', (e, t) => api.close(t.dataset.close || undefined));
  stack.push(api);
  setTimeout(() => box.querySelector('[autofocus]')?.focus(), 50);
  return api;
}

export function confirmDialog({ title, text = '', ok = 'אישור', cancel = 'ביטול', danger = false }) {
  const o = openOverlay(`
    <h2 class="h-md" style="margin-bottom:8px">${title}</h2>
    ${text ? `<p class="muted" style="margin:0 0 18px">${text}</p>` : ''}
    <div class="stack">
      <button class="btn ${danger ? 'primary' : 'primary'}" data-close="ok" style="${danger ? 'background:var(--danger);border-color:var(--danger)' : ''}">${ok}</button>
      <button class="btn" data-close="cancel">${cancel}</button>
    </div>`, { type: 'modal' });
  return o.done.then((v) => v === 'ok');
}

export function appBar({ title, back = true, end = '', navy = false, backLabel = 'חזרה' }) {
  return `<header class="appbar ${navy ? 'navy' : ''}">
    ${back ? `<button class="icon-btn" data-back aria-label="${backLabel}">${icon('arrowRight', { size: 26 })}</button>` : '<span class="spacer"></span>'}
    <h1>${title}</h1>
    ${end || (navy ? '<span class="spacer"></span>' : '')}
  </header>`;
}
