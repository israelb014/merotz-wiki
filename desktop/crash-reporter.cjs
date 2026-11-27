// Global crash reporting for the Electron main process → ntfy.sh.
// Config: crash-reporting.json (copied from config/crash-reporting.json at build time – the single source).
// Sends app name, version, platform, message, shortened stack, "screen" (process/area). No personal data.
// At most maxPerHour reports per device; reports made offline are queued in userData and sent later.
const fs = require('node:fs');
const path = require('node:path');

const HOUR = 3600_000;

function loadConfig() {
  for (const p of [path.join(__dirname, 'crash-reporting.json'), path.join(__dirname, '..', 'config', 'crash-reporting.json')]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return null;
}

function scrub(text) {
  return String(text ?? '')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[user]')
    .replace(/\/(home|Users)\/[^/\s]+/g, '/$1/[user]')
    .replace(/([?&#](?:room|code)=)\d+/gi, '$1####')
    .replace(/room-\d{4}/gi, 'room-####')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}

function createReporter({ config, storeFile, fetchFn = globalThis.fetch, now = () => Date.now(), version = '0', platform = process.platform, enabled = true }) {
  const cfg = config || {};
  const max = cfg.maxPerHour || 5;
  const maxQueue = cfg.maxQueue || 20;
  const seen = new Set();
  let flushing = null;

  const load = () => { try { const s = JSON.parse(fs.readFileSync(storeFile, 'utf8')); return { queue: Array.isArray(s.queue) ? s.queue : [], sent: Array.isArray(s.sent) ? s.sent : [] }; } catch { return { queue: [], sent: [] }; } };
  const store = (s) => { try { fs.mkdirSync(path.dirname(storeFile), { recursive: true }); fs.writeFileSync(storeFile, JSON.stringify(s)); } catch {} };

  function build(err, screen) {
    const e = err instanceof Error ? err : { message: typeof err === 'string' ? err : JSON.stringify(err) };
    return {
      app: 'מרוץ ויקי', version, platform: `desktop-${platform}`, screen: screen || 'main',
      message: scrub(e.message).slice(0, 300),
      stack: String(e.stack || '').split('\n').slice(0, 6).map((l) => scrub(l.trim())).join('\n').slice(0, 900),
      ts: now(),
    };
  }

  async function post(r) {
    const body = JSON.stringify({
      topic: cfg.topic, title: `מרוץ ויקי ${r.version} · ${r.platform}`,
      message: `${r.message}\nמסך: ${r.screen}\n${r.stack}`.slice(0, 1800), tags: ['warning', r.platform],
    });
    const res = await fetchFn(`${cfg.server}/`, { method: 'POST', body });
    if (!res.ok && res.status !== 429) throw new Error(`ntfy ${res.status}`);
  }

  async function doFlush() {
    const s = load();
    s.sent = s.sent.filter((t) => now() - t < HOUR);
    while (s.queue.length && s.sent.length < max) {
      try { await post(s.queue[0]); } catch { break; }
      s.queue.shift();
      s.sent.push(now());
    }
    store(s);
    return s;
  }
  function flush() {
    if (!enabled || !cfg.topic) return Promise.resolve(null);
    if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
    return flushing;
  }

  function report(err, screen) {
    if (!enabled || !cfg.topic) return null;
    const r = build(err, screen);
    const sig = `${r.message}|${r.stack.split('\n')[1] || ''}`;
    if (seen.has(sig)) return null;
    seen.add(sig);
    const s = load();
    s.queue = [...s.queue, r].slice(-maxQueue);
    store(s);
    flush();
    return r;
  }

  return { report, flush, build, _load: load };
}

/** Wire the reporter into an Electron app (main-process exceptions, crashed renderers / GPU). */
function install(app, { version, enabled }) {
  const reporter = createReporter({
    config: loadConfig(), storeFile: path.join(app.getPath('userData'), 'crash-queue.json'),
    version, platform: process.platform, enabled,
  });
  process.on('uncaughtException', (e) => { console.error(e); reporter.report(e, 'main'); });
  process.on('unhandledRejection', (e) => { console.error(e); reporter.report(e, 'main-promise'); });
  app.on('render-process-gone', (_e, _wc, d) => reporter.report(new Error(`renderer gone: ${d?.reason} (${d?.exitCode})`), 'renderer'));
  app.on('child-process-gone', (_e, d) => { if (d?.reason !== 'clean-exit') reporter.report(new Error(`${d?.type} process gone: ${d?.reason}`), 'child'); });
  setTimeout(() => reporter.flush(), 5000);
  setInterval(() => reporter.flush(), 15 * 60_000).unref?.();
  return reporter;
}

module.exports = { createReporter, install, loadConfig, scrub };
