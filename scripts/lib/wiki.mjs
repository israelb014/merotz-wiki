// Shared helpers for talking to Hebrew Wikipedia politely.
// - fetchWithRetry: UA headers, global concurrency limit, min spacing, retry/backoff on 429/5xx
// - optional on-disk cache (scripts/.cache/) keyed by request
// - action API wrapper (maxlag=5, formatversion=2) with continuation
// - canonical title resolution (normalization + redirects)
// - Parsoid playable-link extraction + hop validation (mirrors the game's rules)

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

export const UA = 'MerotzWiki/1.0 (ib@ib-fix.com)';
export const API = 'https://he.wikipedia.org/w/api.php';
export const REST = 'https://he.wikipedia.org/api/rest_v1';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(HERE, '..');
export const ROOT_DIR = path.resolve(SCRIPTS_DIR, '..');
export const CACHE_DIR = process.env.WIKI_CACHE_DIR || path.join(SCRIPTS_DIR, '.cache');
// WIKI_NO_CACHE=1 disables the disk cache entirely (reads and writes).
const NO_CACHE = process.env.WIKI_NO_CACHE === '1';

// ---------------------------------------------------------------- rate limit
const MAX_CONCURRENCY = Number(process.env.WIKI_CONCURRENCY || 3);
const MIN_GAP_MS = Number(process.env.WIKI_MIN_GAP_MS || 60);
let active = 0;
let lastStart = 0;
const waiters = [];
export const stats = { requests: 0, cacheHits: 0, retries: 0 };

async function acquire() {
  while (active >= MAX_CONCURRENCY) await new Promise((r) => waiters.push(r));
  active++;
  const now = Date.now();
  const wait = Math.max(0, lastStart + MIN_GAP_MS - now);
  lastStart = now + wait;
  if (wait) await sleep(wait);
}
function release() {
  active--;
  const w = waiters.shift();
  if (w) w();
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- disk cache
function cacheFile(kind, key) {
  const h = createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, kind, h.slice(0, 2), h);
}
async function cacheGet(kind, key) {
  if (NO_CACHE) return null;
  const f = cacheFile(kind, key);
  if (!existsSync(f)) return null;
  try {
    return await readFile(f, 'utf8');
  } catch {
    return null;
  }
}
async function cachePut(kind, key, text) {
  if (NO_CACHE) return;
  const f = cacheFile(kind, key);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, text);
}

// ---------------------------------------------------------------- fetch
/**
 * Fetch text with UA headers, retry/backoff, and concurrency limiting.
 * Returns { status, text }. 404 is returned (not thrown) so callers can handle missing pages.
 */
export async function fetchText(url, { method = 'GET', body, headers = {}, retries = 7 } = {}) {
  let attempt = 0;
  for (;;) {
    await acquire();
    let res, text, err;
    try {
      stats.requests++;
      res = await fetch(url, {
        method,
        body,
        headers: {
          'User-Agent': UA,
          'Api-User-Agent': UA,
          'Accept-Encoding': 'gzip',
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...headers,
        },
        signal: AbortSignal.timeout(60000),
      });
      text = await res.text();
    } catch (e) {
      err = e;
    } finally {
      release();
    }
    const retryable = err || res.status === 429 || res.status >= 500;
    if (!retryable) return { status: res.status, text };
    if (attempt >= retries) {
      throw new Error(`fetch failed after ${attempt} retries: ${url.slice(0, 200)} ${err ? err.message : res.status}`);
    }
    attempt++;
    stats.retries++;
    let delay = Math.min(60000, 1000 * 2 ** attempt) + Math.random() * 500;
    const ra = res && Number(res.headers.get('retry-after'));
    if (ra) delay = Math.max(delay, ra * 1000);
    await sleep(delay);
  }
}

/** Cached GET returning text (or null on 404). */
export async function getCached(url, { kind = 'http', cache = true } = {}) {
  if (cache) {
    const c = await cacheGet(kind, url);
    if (c !== null) {
      stats.cacheHits++;
      return c === '\u0000404' ? null : c;
    }
  }
  const { status, text } = await fetchText(url);
  if (status === 404) {
    if (cache) await cachePut(kind, url, '\u0000404');
    return null;
  }
  if (status !== 200) throw new Error(`HTTP ${status} for ${url}`);
  if (cache) await cachePut(kind, url, text);
  return text;
}

export async function getJSON(url, opts) {
  const t = await getCached(url, opts);
  return t === null ? null : JSON.parse(t);
}

// ---------------------------------------------------------------- action API
/**
 * One action API call (POST, maxlag=5, formatversion=2). Retries on maxlag / ratelimited errors.
 */
export async function api(params, { cache = true } = {}) {
  const p = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  p.sort();
  const body = p.toString();
  const key = body;
  if (cache) {
    const c = await cacheGet('api', key);
    if (c !== null) {
      stats.cacheHits++;
      return JSON.parse(c);
    }
  }
  for (let attempt = 0; ; attempt++) {
    const { status, text } = await fetchText(API, { method: 'POST', body });
    if (status !== 200) throw new Error(`API HTTP ${status}`);
    const json = JSON.parse(text);
    if (json.error) {
      const code = json.error.code;
      if ((code === 'maxlag' || code === 'ratelimited' || code === 'internal_api_error_DBQueryTimeoutError') && attempt < 8) {
        stats.retries++;
        await sleep(Math.min(60000, 2000 * 2 ** attempt));
        continue;
      }
      throw new Error(`API error ${code}: ${json.error.info}`);
    }
    if (cache) await cachePut('api', key, text);
    return json;
  }
}

/** Async generator over all continuation pages of an action API query. */
export async function* apiPages(params, opts) {
  let cont = {};
  for (;;) {
    const json = await api({ ...params, ...cont }, opts);
    yield json;
    if (!json.continue) break;
    cont = json.continue;
  }
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Run async fn over items with limited parallelism (request-level limit is enforced globally anyway). */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- titles
export const NAMESPACE_PREFIXES = new Set([
  'Category', 'Category talk', 'Draft', 'Draft talk', 'Event', 'Event talk', 'File', 'File talk', 'Help',
  'Help talk', 'Image', 'Image talk', 'Media', 'MediaWiki', 'MediaWiki talk', 'Module', 'Module talk', 'Project',
  'Project talk', 'Special', 'Talk', 'Template', 'Template talk', 'TimedText', 'TimedText talk', 'Topic', 'U',
  'User', 'User talk', 'WP', 'Wikipedia', 'Wikipedia talk', 'אירוע', 'ויקיפדיה', 'וק', 'טי', 'טיוטה', 'י', 'יחידה',
  'מדיה', 'מדיה ויקי', 'מו', 'מי', 'מיוחד', 'מש', 'משתמש', 'משתמשת', 'נ', 'נושא', 'ספר', 'עז', 'עזרה', 'פ', 'פורטל',
  'קו', 'קובץ', 'קט', 'קטגוריה', 'ש', 'שוק', 'שטי', 'שי', 'שיחה', 'שיחת אירוע', 'שיחת ויקיפדיה', 'שיחת טיוטה',
  'שיחת יחידה', 'שיחת מדיה ויקי', 'שיחת משתמש', 'שיחת משתמשת', 'שיחת ספר', 'שיחת עזרה', 'שיחת פורטל', 'שיחת קובץ',
  'שיחת קטגוריה', 'שיחת תבנית', 'שיחת תמונה', 'שמו', 'שמש', 'שעז', 'שפ', 'שקו', 'שקט', 'שתב', 'תב', 'תבנית', 'תמונה',
]);

export function normalizeTitle(t) {
  if (!t) return t;
  let s = String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash).trim();
  if (s && /[a-z]/.test(s[0])) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

export function isMainNamespace(title) {
  const i = title.indexOf(':');
  if (i <= 0) return true;
  const prefix = title.slice(0, i).trim();
  return !NAMESPACE_PREFIXES.has(prefix) && !NAMESPACE_PREFIXES.has(prefix[0].toUpperCase() + prefix.slice(1).toLowerCase());
}

/**
 * Resolve titles to canonical main-namespace titles (normalization + redirects).
 * Returns Map(input -> canonical | null if missing / not main namespace).
 */
export async function resolveTitles(titles, { cache = true } = {}) {
  const out = new Map();
  const uniq = [...new Set(titles.map((t) => String(t)))];
  for (const batch of chunk(uniq, 50)) {
    const json = await api({ action: 'query', titles: batch.join('|'), redirects: '1' }, { cache });
    const q = json.query || {};
    const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects || []).map((r) => [r.from, r.to]));
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      let cur = norm.get(t) || t;
      for (let i = 0; i < 5 && redir.has(cur); i++) cur = redir.get(cur);
      const p = pages.get(cur);
      out.set(t, p && !p.missing && !p.invalid && p.ns === 0 ? p.title : null);
    }
  }
  return out;
}

export async function canonicalTitle(t, opts) {
  return (await resolveTitles([t], opts)).get(String(t));
}

/** Set of redirect titles (ns0) pointing to `title`, plus title itself. Cached in memory. */
const aliasMemo = new Map();
export async function aliasesOf(title, { cache = true } = {}) {
  if (aliasMemo.has(title)) return aliasMemo.get(title);
  const set = new Set([title]);
  for await (const json of apiPages(
    { action: 'query', prop: 'redirects', titles: title, rdnamespace: '0', rdlimit: 'max', rdprop: 'title' },
    { cache },
  )) {
    for (const p of json.query?.pages || []) for (const r of p.redirects || []) set.add(r.title);
  }
  aliasMemo.set(title, set);
  return set;
}

/** Batch version: Map(title -> Set(aliases incl. itself)). */
export async function aliasesOfMany(titles, { cache = true } = {}) {
  const res = new Map();
  const todo = [];
  for (const t of titles) {
    if (aliasMemo.has(t)) res.set(t, aliasMemo.get(t));
    else todo.push(t);
  }
  for (const batch of chunk(todo, 50)) {
    const acc = new Map(batch.map((t) => [t, new Set([t])]));
    for await (const json of apiPages(
      { action: 'query', prop: 'redirects', titles: batch.join('|'), rdnamespace: '0', rdlimit: 'max', rdprop: 'title' },
      { cache },
    )) {
      for (const p of json.query?.pages || []) {
        if (!acc.has(p.title)) acc.set(p.title, new Set([p.title]));
        for (const r of p.redirects || []) acc.get(p.title).add(r.title);
      }
    }
    for (const [t, s] of acc) {
      aliasMemo.set(t, s);
      res.set(t, s);
    }
  }
  return res;
}

// ---------------------------------------------------------------- Parsoid / playable links
export const EXCLUDED_SECTIONS = new Set(['הערות שוליים', 'קישורים חיצוניים', 'לקריאה נוספת', 'ביאורים', 'מקורות', 'סימוכין']);
const REF_SELECTOR =
  'sup.reference, .mw-ref, [typeof~="mw:Extension/ref"], .references, .mw-references-wrap, .reflist';

export async function fetchParsoid(title, { cache = true } = {}) {
  const url = `${REST}/page/html/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=false`;
  return getCached(url, { kind: 'parsoid', cache });
}

/** Extract playable link target titles (raw, normalized, unresolved) from Parsoid HTML. */
export function extractPlayableLinks(html) {
  const { document } = parseHTML(html);
  const excluded = new Set();
  for (const ref of document.querySelectorAll(REF_SELECTOR)) excluded.add(ref);
  for (const h2 of document.querySelectorAll('h2')) {
    const txt = (h2.textContent || '').replace(/\s+/g, ' ').trim();
    if (EXCLUDED_SECTIONS.has(txt)) {
      // Parsoid wraps sections in <section>; heading may also be inside a .mw-heading div.
      let sec = h2.parentElement;
      if (sec && sec.tagName !== 'SECTION' && sec.parentElement?.tagName === 'SECTION') sec = sec.parentElement;
      if (sec && sec.tagName === 'SECTION') excluded.add(sec);
    }
  }
  const links = new Set();
  for (const a of document.querySelectorAll('a[rel="mw:WikiLink"]')) {
    if (a.classList.contains('new')) continue;
    const rawTitle = a.getAttribute('title');
    if (!rawTitle) continue;
    let bad = false;
    for (let el = a.parentElement; el; el = el.parentElement) {
      if (excluded.has(el)) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    const t = normalizeTitle(rawTitle);
    if (!t || !isMainNamespace(t)) continue;
    links.add(t);
  }
  return links;
}

const playableMemo = new Map();
/** Playable link titles (raw/unresolved) for a page. null if the page doesn't exist. */
export async function playableLinks(title, opts = {}) {
  if (playableMemo.has(title)) return playableMemo.get(title);
  const html = await fetchParsoid(title, opts);
  const links = html === null ? null : extractPlayableLinks(html);
  playableMemo.set(title, links);
  return links;
}

/** True if `to` (canonical) is reachable by one click from `from` (canonical) in the game. */
export async function isPlayableHop(from, to, opts = {}) {
  const links = await playableLinks(from, opts);
  if (!links) return false;
  if (links.has(to)) return true;
  const aliases = await aliasesOf(to, opts);
  for (const a of aliases) if (links.has(a)) return true;
  return false;
}

/** Validate a full path hop by hop. */
export async function validatePath(pathTitles, opts = {}) {
  for (let i = 0; i + 1 < pathTitles.length; i++) {
    if (!(await isPlayableHop(pathTitles[i], pathTitles[i + 1], opts))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- misc
export async function writeJSON(file, obj, pretty = false) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, pretty ? JSON.stringify(obj, null, 2) + '\n' : JSON.stringify(obj));
}

export function seededRandom(seedStr) {
  // xmur3 + mulberry32
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
