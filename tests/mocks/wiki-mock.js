// Wikipedia mock: serves the saved fixture pages (tests/fixtures/wiki.json.gz) in place of the real
// he.wikipedia.org REST + action APIs. Installed on a BrowserContext with context.route().
// Anything external that is not mocked is aborted and recorded in mock.blocked.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

let FIX = null;
export function fixtures() {
  if (!FIX) {
    FIX = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/wiki.json.gz', import.meta.url))).toString('utf8'));
    FIX.titles = Object.keys(FIX.pages).filter((t) => !FIX.pages[t].disambiguation);
  }
  return FIX;
}

const NS = /^(קובץ|קטגוריה|תבנית|ויקיפדיה|עזרה|פורטל|שיחה|משתמש|מיוחד|מדיה|יחידה|טיוטה|File|Image|Category|Template|Wikipedia|Help|Portal|Special|User|Talk|Media|Module|Draft|[^:]*שיחה)\s*:/i;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function norm(t) {
  t = String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Synthetic article used for titles that are linked from fixture pages but not saved (keeps the graph closed). */
function stubHtml(title) {
  const F = fixtures();
  let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const picks = [0, 1, 2, 3, 4].map((i) => F.titles[(h + i * 7) % F.titles.length]);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><section data-mw-section-id="0"><p><b>${title}</b> – ערך מדומה לבדיקות. ראו גם: ${picks.map((t) => `<a rel="mw:WikiLink" href="./${encodeURIComponent(t.replace(/ /g, '_'))}" title="${t.replace(/"/g, '&quot;')}">${t}</a>`).join(', ')}.</p></section></body></html>`;
}

export function createWikiMock(opts = {}) {
  const F = fixtures();
  const mock = {
    log: [],            // {kind, title}
    blocked: [],        // external URLs that were not mocked
    delay: {},          // title|'*' -> ms (article html + summary)
    apiDelay: 0,
    failTitles: new Set(), // network error for these titles (html)
    failNext: 0,         // network error for the next N html requests
    deleted: new Set(F.missing.map(norm)), // missing pages (404 / missing)
    overrides: {},       // title -> raw html
    offline: false,      // all wikipedia requests fail
    allowHosts: [],      // extra hosts to let through (e.g. ntfy test sink handled elsewhere)
    ...opts,
  };

  /** Canonical title for t: follows a redirect, null when missing/non-main namespace */
  mock.resolve = (t) => {
    t = norm(t);
    if (!t || NS.test(t) || mock.deleted.has(t)) return null;
    if (F.redirects[t]) return norm(F.redirects[t]);
    return t;
  };
  mock.isDisambig = (t) => !!F.pages[t]?.disambiguation;
  mock.pageHtml = (t) => mock.overrides[t] || F.pages[t]?.html || stubHtml(t);
  mock.links = (t) => {
    if (F.pages[t] && !mock.overrides[t]) return F.pages[t].links;
    const html = mock.pageHtml(t);
    return [...html.matchAll(/rel="mw:WikiLink"[^>]*title="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"'));
  };

  function query(params) {
    const titles = (params.get('titles') || '').split('|').filter(Boolean);
    const normalized = [], redirects = [], pages = [];
    const seen = new Set();
    for (const raw of titles) {
      const n = norm(raw);
      if (n !== raw) normalized.push({ fromencoded: false, from: raw, to: n });
      let t = n;
      if (F.redirects[n] && !mock.deleted.has(n)) { t = norm(F.redirects[n]); redirects.push({ from: n, to: t }); }
      if (seen.has(t)) continue; seen.add(t);
      const nsm = t.match(NS);
      if (nsm) pages.push({ ns: /קטגוריה|Category/i.test(nsm[1]) ? 14 : /תבנית|Template/i.test(nsm[1]) ? 10 : 6, title: t, missing: true });
      else if (mock.deleted.has(t)) pages.push({ ns: 0, title: t, missing: true });
      else pages.push({ pageid: 1000 + pages.length, ns: 0, title: t });
    }
    const out = { batchcomplete: true, query: { pages } };
    if (normalized.length) out.query.normalized = normalized;
    if (redirects.length) out.query.redirects = redirects;
    if (params.get('prop') === 'links' && pages[0] && !pages[0].missing) {
      const want = new Set((params.get('pltitles') || '').split('|').map(norm));
      const have = new Set(mock.links(pages[0].title).map(norm));
      pages[0].links = [...want].filter((t) => have.has(t)).map((title) => ({ ns: 0, title }));
    }
    return out;
  }

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'upload.wikimedia.org') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (url.hostname !== 'he.wikipedia.org') return false;
    if (mock.offline) return route.abort('internetdisconnected');
    const rest = url.pathname.match(/^\/api\/rest_v1\/page\/(html|summary)\/(.+)$/);
    if (rest) {
      const [, kind, encTitle] = rest;
      let t = norm(decodeURIComponent(encTitle));
      mock.log.push({ kind, title: t });
      const d = mock.delay[t] ?? mock.delay['*'] ?? 0;
      if (d) await sleep(d);
      if (kind === 'html' && (mock.failNext > 0 || mock.failTitles.has(t))) { if (mock.failNext > 0) mock.failNext--; return route.abort('connectionreset'); }
      const c = mock.resolve(t);
      if (!c) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ type: 'not_found', title: 'Not found.' }) });
      if (kind === 'html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mock.pageHtml(c) });
      const p = F.pages[c];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        type: p?.disambiguation ? 'disambiguation' : 'standard', title: c, displaytitle: c, description: '',
        extract: p?.extract || `${c} – ערך מדומה לבדיקות.`, thumbnail: null,
      }) });
    }
    if (url.pathname === '/w/api.php') {
      const p = url.searchParams;
      mock.log.push({ kind: 'api', action: p.get('action'), titles: p.get('titles'), search: p.get('search') });
      if (mock.apiDelay) await sleep(mock.apiDelay);
      let body;
      if (p.get('action') === 'opensearch') {
        const q = norm(p.get('search') || '');
        const hits = Object.keys(F.pages).filter((t) => t.startsWith(q)).concat(Object.keys(F.pages).filter((t) => !t.startsWith(q) && t.includes(q))).slice(0, Number(p.get('limit') || 8));
        body = [q, hits, hits.map(() => ''), hits.map((t) => `https://he.wikipedia.org/wiki/${encodeURIComponent(t)}`)];
      } else if (p.get('meta') === 'siteinfo') body = { batchcomplete: true, query: { general: { sitename: 'ויקיפדיה' } } };
      else body = query(p);
      return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 404, body: 'not mocked' });
  }
  mock.handle = handle;
  return mock;
}

// ---- static game data replaced by fixture-based data (titles that exist in the fixtures) ----
export function jerusalemDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
}
export function fixturePools() {
  const F = fixtures();
  const arts = F.titles.map((t, i) => [t, i, F.pages[t].links.length]);
  const categories = {};
  for (const id of ['random', 'israel', 'history', 'science', 'geography', 'sports', 'culture', 'food']) categories[id] = { name: id, articles: arts };
  return { version: 1, generated: 'fixture', categories };
}
export function fixtureDaily() {
  const days = {};
  for (let i = -3; i <= 3; i++) days[jerusalemDate(new Date(Date.now() + i * 86400000))] = { start: 'חומוס', target: 'שוקולד', par: 2, path: ['חומוס', 'טחינה', 'שוקולד'], category: 'food' };
  return { version: 1, days };
}
