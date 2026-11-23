// Hebrew Wikipedia integration: fetch, canonicalize, cache, clean-render.
import { WIKI_UA } from '../config.js';
import { get, put } from './store.js';

const API = 'https://he.wikipedia.org/w/api.php';
const REST = 'https://he.wikipedia.org/api/rest_v1';
const HDR = { 'Api-User-Agent': WIKI_UA };
const TTL = 24 * 3600 * 1000;
const CLEAN_VER = 4; // bump when cleaning rules change

export const NON_MAIN_NS = ['קובץ', 'קטגוריה', 'תבנית', 'ויקיפדיה', 'עזרה', 'פורטל', 'שיחה', 'משתמש', 'מיוחד', 'מדיה', 'מדיה ויקי', 'יחידה', 'טיוטה', 'ספר', 'File', 'Image', 'Category', 'Template', 'Wikipedia', 'Help', 'Portal', 'Special', 'User', 'Talk', 'Media', 'MediaWiki', 'Module', 'Draft', 'WP', 'ויקי', 'תמונה'];
const NS_RE = new RegExp(`^(${NON_MAIN_NS.join('|')}|[^:]*שיחה|User talk)\\s*:`, 'i');
export const REMOVE_SECTIONS = ['הערות שוליים', 'קישורים חיצוניים', 'לקריאה נוספת', 'ביאורים', 'מקורות', 'סימוכין', 'הערות', 'קישורים חיצוניים נוספים'];

export class OfflineError extends Error {}
export class NotFoundError extends Error {}

async function wfetch(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { ...HDR, ...(opts.headers || {}) } });
  } catch (e) {
    throw new OfflineError(e.message);
  }
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function apiUrl(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params })) u.searchParams.set(k, v);
  return u.toString();
}
export async function api(params) {
  return (await wfetch(apiUrl(params))).json();
}

export const normTitle = (t) => {
  t = String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  try { if (/%[0-9A-F]{2}/i.test(t)) t = decodeURIComponent(t); } catch {}
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};
export const isPlayableTitle = (t) => !!t && !NS_RE.test(t);

// ---- canonical title resolution (redirects followed) ----
const canon = new Map(); // input -> canonical | null (missing)
export async function resolveTitles(titles) {
  const out = {};
  const need = [];
  for (const raw of titles) {
    const t = normTitle(raw);
    if (canon.has(t)) out[raw] = canon.get(t);
    else need.push(t);
  }
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const d = await api({ action: 'query', titles: batch.join('|'), redirects: '1' });
    const map = new Map(batch.map((t) => [t, t]));
    for (const n of d.query?.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of d.query?.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const pages = new Map((d.query?.pages || []).map((p) => [p.title, p]));
    for (const [k, v] of map) {
      const p = pages.get(v);
      const res = !p || p.missing || p.invalid || p.ns !== 0 ? null : p.title;
      canon.set(k, res);
      if (res) canon.set(res, res);
    }
  }
  for (const raw of titles) if (!(raw in out)) out[raw] = canon.get(normTitle(raw)) ?? null;
  return out;
}
export async function resolveTitle(t) {
  return (await resolveTitles([t]))[t];
}
export const sameTitle = (a, b) => !!a && !!b && normTitle(a) === normTitle(b);

// ---- caching ----
const memCache = new Map();
async function cached(key, loader) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const hit = await get('articles', key);
    if (hit && Date.now() - hit.ts < TTL) { memCache.set(key, hit.v); return hit.v; }
  } catch {}
  const v = await loader();
  memCache.set(key, v);
  put('articles', key, { ts: Date.now(), v }).catch(() => {});
  return v;
}

const enc = (t) => encodeURIComponent(normTitle(t).replace(/ /g, '_'));

export async function fetchSummary(title) {
  return cached(`s:${title}`, async () => {
    const d = await (await wfetch(`${REST}/page/summary/${enc(title)}`)).json();
    return {
      title: d.title, description: d.description || '', extract: d.extract || '',
      thumb: d.thumbnail?.source || null, image: d.originalimage?.source || d.thumbnail?.source || null,
      disambiguation: d.type === 'disambiguation',
    };
  });
}

/** Fetch & clean article. Returns {title, html, links:Set<string>} */
export async function fetchArticle(title) {
  return cached(`a${CLEAN_VER}:${title}`, async () => {
    const raw = await (await wfetch(`${REST}/page/html/${enc(title)}?redirect=true`)).text();
    return { title, html: cleanArticle(raw, title) };
  });
}

export async function opensearch(q, limit = 8) {
  if (!q.trim()) return [];
  const d = await (await wfetch(apiUrl({ action: 'opensearch', search: q, namespace: '0', limit: String(limit), redirects: 'resolve', formatversion: '2' }))).json();
  return d[1] || [];
}

/** Does `from` link directly to any of `targets`? Returns array of linked targets. */
export async function linksTo(from, targets) {
  const d = await api({ action: 'query', prop: 'links', titles: from, pltitles: targets.join('|'), plnamespace: '0', pllimit: 'max', redirects: '1' });
  return (d.query?.pages?.[0]?.links || []).map((l) => l.title);
}

export const articleUrl = (t) => `https://he.wikipedia.org/wiki/${enc(t)}`;

// ---- Clean render ----
export function cleanArticle(html, title) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const b = doc.body;
  const kill = (sel) => b.querySelectorAll(sel).forEach((n) => n.remove());

  kill('style, link, script, meta, noscript, .mw-editsection, sup.reference, .mw-ref, [typeof~="mw:Extension/ref"], .mw-references-wrap, ol.references, .reflist, .references, #coordinates, .coordinates, #coordinates-title, .geo-nondefault, .geo-default, .mw-empty-elt, .mw-kartographer-maplink, .noprint.portal, .sistersitebox, .authority-control, .mw-authority-control, .catlinks, [role="navigation"].mw-hidden-catlinks, .metadata.plainlinks.navigation-not-searchable, .mbox-small, .plainlinks.mbox-small, .ambox-delete, .wikiquote, .wikisource, .commonscat, .portalbox, link[rel="mw-deduplicated-inline-style"]');

  b.querySelectorAll('a[href*="wikidata.org"], a[title="עריכת הנתון בוויקינתונים"], a[href*="action=edit"]:has(img), .wikidata-claim-edit, .wd-edit').forEach((n) => n.remove());

  // remove reference / external sections
  for (const sec of b.querySelectorAll('section')) {
    const h = sec.querySelector(':scope > h2, :scope > .mw-heading > h2, :scope > div > h2');
    if (h && REMOVE_SECTIONS.includes(h.textContent.trim())) sec.remove();
  }
  // remove empty sections remnant/headings with nothing
  // links
  for (const a of b.querySelectorAll('a')) {
    const rel = a.getAttribute('rel') || '';
    const href = a.getAttribute('href') || '';
    const titleAttr = a.getAttribute('title');
    const isFile = a.classList.contains('mw-file-description') || a.querySelector('img') || /^\.\/(קובץ|File|תמונה|מדיה):/.test(href);
    if (isFile) { unwrap(a); continue; }
    // same-page anchors
    if (href.startsWith('#')) { a.className = 'anchor'; a.setAttribute('data-anchor', href.slice(1)); a.setAttribute('href', href); continue; }
    if (rel.split(/\s+/).includes('mw:WikiLink') && !a.classList.contains('new') && !/redlink=1|action=edit/.test(href) && titleAttr) {
      let target = href.replace(/^\.\//, '').split('?')[0];
      const hashIdx = target.indexOf('#');
      let frag = '';
      if (hashIdx >= 0) { frag = target.slice(hashIdx + 1); target = target.slice(0, hashIdx); }
      let t = '';
      try { t = normTitle(decodeURIComponent(target)); } catch { t = normTitle(target); }
      if (!t) t = normTitle(titleAttr);
      if (isPlayableTitle(t)) {
        if (sameTitle(t, title)) { // self link → anchor
          a.className = 'anchor'; a.setAttribute('href', '#' + frag); a.setAttribute('data-anchor', frag); continue;
        }
        const n = doc.createElement('a');
        n.className = 'wl';
        n.setAttribute('href', '#');
        n.setAttribute('data-t', t);
        n.innerHTML = a.innerHTML;
        a.replaceWith(n);
        continue;
      }
    }
    // everything else: dead link (red, namespaces, interwiki, external)
    const s = doc.createElement('span');
    s.className = 'dead';
    s.innerHTML = a.innerHTML;
    a.replaceWith(s);
  }

  // images
  for (const img of b.querySelectorAll('img')) {
    const fix = (u) => (u && u.startsWith('//') ? 'https:' + u : u);
    img.setAttribute('src', fix(img.getAttribute('src') || img.getAttribute('data-src') || ''));
    const ss = img.getAttribute('srcset');
    if (ss) img.setAttribute('srcset', ss.split(',').map((p) => fix(p.trim())).join(', '));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.removeAttribute('resource');
  }
  for (const n of b.querySelectorAll('[typeof="mw:Error"], .mw-file-element.mw-broken-media')) n.remove();

  // navboxes → collapsed <details>
  for (const nb of b.querySelectorAll('table.navbox, div.navbox, table.navbox-inner')) {
    if (nb.closest('details.navbox-wrap')) continue;
    const titleEl = nb.querySelector('.navbox-title');
    const label = (titleEl?.textContent || 'ניווט').replace(/\s+/g, ' ').replace(/^[^\p{L}\d]+/u, '').trim().slice(0, 90) || 'ניווט';
    const d = doc.createElement('details');
    d.className = 'navbox-wrap';
    const s = doc.createElement('summary');
    s.textContent = label;
    const inner = doc.createElement('div');
    inner.className = 'scroll-x';
    nb.replaceWith(d);
    inner.appendChild(nb);
    d.append(s, inner);
  }
  // infoboxes & tables → horizontal scroll
  for (const t of b.querySelectorAll('table')) {
    if (t.closest('.scroll-x') || t.closest('details.navbox-wrap')) continue;
    const w = doc.createElement('div');
    w.className = 'scroll-x' + (t.classList.contains('infobox') ? ' infobox-wrap' : '');
    t.replaceWith(w);
    w.appendChild(t);
  }
  // strip inline widths that break mobile
  for (const n of b.querySelectorAll('[style]')) {
    const st = n.getAttribute('style');
    n.setAttribute('style', st.replace(/(^|;)\s*(width|float|margin-[a-z]+|min-width)\s*:[^;]+/gi, ''));
  }
  // remove ids that could clash; keep section ids for anchors
  for (const n of b.querySelectorAll('[data-mw], [about], [typeof], [data-mw-section-id]')) {
    n.removeAttribute('data-mw'); n.removeAttribute('about');
  }
  return b.innerHTML;
}

function unwrap(a) {
  const p = a.parentNode;
  while (a.firstChild) p.insertBefore(a.firstChild, a);
  a.remove();
}
