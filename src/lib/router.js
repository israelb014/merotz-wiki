import { reportCaught } from './crash.js';
// Tiny hash router: #/path?query
const routes = new Map();
let current = null;
let cleanup = null;
let guard = null;

export function route(path, render) { routes.set(path, render); }
export function setGuard(fn) { guard = fn; }

export function parse(hash = location.hash) {
  const h = hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function go(path, { replace = false, query } = {}) {
  const q = query ? '?' + new URLSearchParams(query).toString() : '';
  const url = '#' + path + q;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  render();
}
export const back = () => history.back();
export const currentRoute = () => current;

let navSeq = 0;
export const navToken = () => navSeq;

export async function render() {
  const r = parse();
  if (guard) {
    const redirect = guard(r);
    if (redirect) { history.replaceState(null, '', '#' + redirect); return render(); }
  }
  const fn = routes.get(r.path) || routes.get('/');
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { reportCaught(e); } }
  cleanup = null;
  const id = ++navSeq;
  current = r;
  // fresh #app element per screen: delegated listeners that screens attach to it must not pile up across screens
  const old = document.getElementById('app');
  const app = old.cloneNode(false);
  old.replaceWith(app);
  window.scrollTo(0, 0);
  let c;
  try {
    c = await fn(app, r.query);
  } catch (e) {
    // a screen failed to render: never leave a blank screen
    reportCaught(e, 'render');
    if (id === navSeq) {
      app.innerHTML = `<main class="screen center"><div class="card stack mt-l center render-error"><h2 class="h-lg">משהו השתבש</h2><p class="muted" style="margin:0">המסך לא נטען כמו שצריך.</p><button class="btn primary" data-home>לתפריט הראשי</button></div></main>`;
      app.querySelector('[data-home]').onclick = () => go('/', { replace: true });
    }
    return;
  }
  if (id === navSeq) cleanup = c;
  else if (typeof c === 'function') { try { c(); } catch (e) { reportCaught(e); } } // screen was left while rendering
}

// A screen can veto leaving via the browser/OS back button (e.g. an active game).
// The guard returns true when it handled the back press; the URL is then restored.
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = fn; return () => { if (leaveGuard === fn) leaveGuard = null; }; }

window.addEventListener('popstate', () => {
  if (leaveGuard && current) {
    const here = '#' + current.path + (Object.keys(current.query).length ? '?' + new URLSearchParams(current.query) : '');
    if (location.hash !== here) {
      let handled = false;
      try { handled = leaveGuard(); } catch (e) { reportCaught(e); }
      if (handled) { history.pushState(null, '', here); return; }
    }
  }
  render();
});
