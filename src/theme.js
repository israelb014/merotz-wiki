import { state } from './lib/store.js';
const mq = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const t = state.settings?.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('mw-theme-hint', t); } catch {}
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0E1424' : '#F6F3EC'));
  window.merotzDesktop?.setTheme?.(dark ? 'dark' : 'light');
}
mq.addEventListener?.('change', applyTheme);
