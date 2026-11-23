export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Create element from HTML string */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Delegated event binding. Returns unbind fn. */
export function on(root, type, selector, fn, opts) {
  const h = (e) => {
    const t = e.target.closest?.(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(type, h, opts);
  return () => root.removeEventListener(type, h, opts);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--';
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function plural(n, one, many) { return n === 1 ? one : `${n} ${many}`; }
export const clicksLabel = (n) => (n === 1 ? 'קליק אחד' : `${n} קליקים`);

/** SVG progress ring */
export function ring({ size = 120, stroke = 10, pct = 0, inner = '', cls = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>
    </svg>
    <div class="val">${inner}</div>
  </div>`;
}
export function setRing(ringEl, pct) {
  const bar = ringEl?.querySelector('.bar');
  if (!bar) return;
  const c = parseFloat(bar.getAttribute('stroke-dasharray'));
  bar.setAttribute('stroke-dashoffset', (c * (1 - Math.max(0, Math.min(1, pct)))).toFixed(2));
}

export function uid(n = 10) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

/** Seeded PRNG (mulberry32) */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
