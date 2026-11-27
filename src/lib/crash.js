// Global crash reporting → ntfy.sh (see config/crash-reporting.json and privacy.html).
// Sends: app name, version, platform, error message, shortened stack, current screen (route path only).
// Never sends player names, room codes, article history or any stored data.
// Limits: maxPerHour per device; offline reports are queued and sent when the network returns.
// Disabled in automated tests (navigator.webdriver) and in the dev server, unless a test forces it.
import CFG from '../../config/crash-reporting.json';

const QUEUE_KEY = 'mw-crash-queue';
const SENT_KEY = 'mw-crash-sent';
const HOUR = 3600_000;
let ctx = { version: '0', platform: () => 'web', screen: () => '', name: () => null };
let flushing = false;
const seen = new Set();

export function crashReportingEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__MW_CRASH_FORCE) return true; // tests of the reporter itself (ntfy is mocked)
  if (navigator.webdriver) return false;     // Playwright / automation
  if (import.meta.env.DEV) return false;
  return !!CFG.topic;
}

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

/** Remove anything that could identify a person or a room. */
export function scrub(text, name) {
  let s = String(text ?? '');
  if (name && name.length >= 2) s = s.split(name).join('[name]');
  return s
    .replace(/https?:\/\/[^\s)'"]+/g, (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return '[url]'; } })
    .replace(/([?&#](?:room|code)=)\d+/gi, '$1####')
    .replace(/room-\d{4}/gi, 'room-####')
    .replace(/(^|[^\d:.])\d{4}(?![\d:])/g, '$1####')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}

export function shortStack(stack, name) {
  return String(stack || '').split('\n').slice(0, 6)
    .map((l) => scrub(l.trim().replace(/\(?(https?:\/\/[^/]+)?\/merotz-wiki\//, '('), name)).join('\n').slice(0, 900);
}

export function buildReport(err, source = 'error') {
  const name = ctx.name?.();
  const message = scrub(err?.message || String(err ?? 'unknown'), name).slice(0, 300);
  return {
    app: 'מרוץ ויקי', version: ctx.version, platform: ctx.platform(), source,
    message, stack: shortStack(err?.stack, name), screen: ctx.screen() || '', ts: Date.now(),
  };
}

function allowance() {
  const now = Date.now();
  const sent = read(SENT_KEY, []).filter((t) => typeof t === 'number' && now - t < HOUR);
  return { sent, left: (CFG.maxPerHour || 5) - sent.length };
}

async function post(r) {
  const body = JSON.stringify({
    topic: CFG.topic,
    title: `מרוץ ויקי ${r.version} · ${r.platform}`,
    message: `${r.message}\nמסך: ${r.screen || '-'} · מקור: ${r.source}\n${r.stack}`.slice(0, 1800),
    tags: ['warning', r.platform],
  });
  // text/plain body = simple CORS request (no preflight); ntfy parses JSON published to the root URL
  const res = await fetch(`${CFG.server}/`, { method: 'POST', body, keepalive: true });
  if (!res.ok && res.status !== 429) throw new Error(`ntfy ${res.status}`);
}

const readQueue = () => { const q = read(QUEUE_KEY, []); return Array.isArray(q) ? q.filter((x) => x && typeof x === 'object') : []; };
let again = false;
export async function flush() {
  if (!crashReportingEnabled()) return;
  if (flushing) { again = true; return; } // a report queued during a flush is picked up by the running flush
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    do {
      again = false;
      for (;;) {
        const q = readQueue();
        if (!q.length) break;
        const { sent, left } = allowance();
        if (left <= 0) return;
        const r = q[0];
        try { await post(r); } catch { return; } // network trouble → keep in queue
        sent.push(Date.now());
        write(SENT_KEY, sent);
        // re-read: reports may have been queued while posting
        const now = readQueue();
        const i = now.findIndex((x) => x.ts === r.ts && x.message === r.message);
        if (i >= 0) now.splice(i, 1);
        write(QUEUE_KEY, now);
      }
    } while (again);
  } finally { flushing = false; }
}

// browser noise that is not a bug in the game (and would only use up the hourly budget)
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/im, /extension:\/\//i, /^AbortError/i, /The play\(\) request was interrupted/i];
export function isNoise(err) {
  const text = `${err?.message || err || ''}\n${err?.stack || ''}`;
  return IGNORE.some((re) => re.test(text)) || (err?.name === 'AbortError');
}

export function report(err, source) {
  try {
    if (!crashReportingEnabled() || isNoise(err)) return null;
    const r = buildReport(err, source);
    const sig = `${r.message}|${r.stack.split('\n')[1] || ''}`;
    if (seen.has(sig)) return null; // same error once per session
    seen.add(sig);
    const q = readQueue();
    q.push(r);
    write(QUEUE_KEY, q.slice(-(CFG.maxQueue || 20)));
    flush();
    return r;
  } catch { return null; }
}

/** For errors that are caught (so the app keeps running) but still indicate a bug. */
export function reportCaught(e, source = 'caught') {
  console.error(e);
  report(e instanceof Error ? e : { message: String(e) }, source);
}

/** Install window.onerror + unhandledrejection handlers. Call once at startup. */
export function installCrashReporting(opts) {
  ctx = { ...ctx, ...opts };
  if (typeof window === 'undefined' || window.__mwCrashInstalled) return;
  window.__mwCrashInstalled = true;
  window.addEventListener('error', (e) => {
    if (e.error || e.message) report(e.error || { message: e.message, stack: `at ${e.filename}:${e.lineno}:${e.colno}` }, 'onerror');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(r instanceof Error ? r : { message: typeof r === 'string' ? r : `unhandled rejection: ${Object.prototype.toString.call(r)}` }, 'unhandledrejection');
  });
  window.addEventListener('online', () => flush());
  setTimeout(flush, 4000);
}

export const CRASH_CONFIG = CFG;
