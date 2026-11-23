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

export async function render() {
  const r = parse();
  if (guard) {
    const redirect = guard(r);
    if (redirect) { history.replaceState(null, '', '#' + redirect); return render(); }
  }
  const fn = routes.get(r.path) || routes.get('/');
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  current = r;
  const app = document.getElementById('app');
  app.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = await fn(app, r.query);
}

window.addEventListener('popstate', () => render());
