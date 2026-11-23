import { opensearch } from '../lib/wiki.js';
import { esc } from '../lib/dom.js';

/** Attach Hebrew Wikipedia autocomplete (opensearch) to an input. */
export function attachAutocomplete(input, onPick) {
  const wrap = input.closest('.ac-wrap');
  const list = document.createElement('ul');
  list.className = 'ac-list';
  list.setAttribute('role', 'listbox');
  wrap.appendChild(list);
  let timer, seq = 0, items = [], active = -1;
  const close = () => { list.innerHTML = ''; list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const render = () => {
    list.innerHTML = items.map((t, i) => `<li role="option" class="${i === active ? 'on' : ''}" data-i="${i}">${esc(t)}</li>`).join('');
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
  };
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { items = []; close(); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try { const r = await opensearch(q); if (my === seq) { items = r; active = -1; render(); } } catch {}
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { pick(items[active]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  const pick = (t) => { input.value = t; close(); onPick?.(t); };
  list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); } });
  input.addEventListener('blur', () => setTimeout(close, 150));
  close();
}
