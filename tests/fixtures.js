// Shared Playwright fixtures: every context gets the Wikipedia mock, the Supabase Realtime mock and a
// network wall (no real external hosts). Page errors and console errors are collected and fail the test.
import { test as base, expect } from '@playwright/test';
import { createWikiMock, fixturePools, fixtureDaily } from './mocks/wiki-mock.js';
import { RealtimeHub } from './mocks/supabase-mock.js';

const LOCAL = new Set(['localhost', '127.0.0.1']);
// Chromium logs these for requests we abort on purpose (offline / injected network errors)
export const BENIGN_CONSOLE = [/Failed to load resource/, /net::ERR_/, /falling back to REST API/, /WebSocket connection to .* failed/];

/** Install mocks on a context. Returns {wiki, ntfy, tag}. */
export async function installMocks(context, { hub, tag = 'p1', wiki = createWikiMock(), data = true } = {}) {
  const ntfy = [];
  const blocked = wiki.blocked;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (LOCAL.has(url.hostname)) {
      if (data && /\/data\/pools\.json$/.test(url.pathname)) return route.fulfill({ json: fixturePools() });
      if (data && /\/data\/daily\.json$/.test(url.pathname)) return route.fulfill({ json: fixtureDaily() });
      return route.fallback();
    }
    if (url.hostname.endsWith('wikipedia.org') || url.hostname === 'upload.wikimedia.org') { const r = await wiki.handle(route); if (r !== false) return; }
    if (url.hostname.endsWith('supabase.co') && hub) return hub.handleRest(route);
    if (url.hostname === 'ntfy.sh') { ntfy.push({ url: url.toString(), body: route.request().postData() }); return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { id: 'x' } }); }
    blocked.push(url.toString());
    return route.abort('blockedbyclient');
  });
  if (hub) await hub.attach(context, tag);
  if (process.env.DEBUG_NAV) await context.addInitScript(() => {
    const w = (k) => { const o = history[k].bind(history); history[k] = (...a) => { console.log('[nav]', k, a[2], (new Error().stack || '').split('\n').slice(2, 5).join(' | ')); return o(...a); }; };
    w('pushState'); w('replaceState');
    addEventListener('popstate', () => console.log('[nav] popstate', location.hash));
  });
  /** Device goes offline/online: browser network, Wikipedia and Supabase together. */
  const setOffline = async (off) => { await context.setOffline(off); wiki.offline = off; hub?.setOffline(tag, off); };
  // crash reports go to the ntfy sink above only when a test forces reporting on
  return { wiki, ntfy, tag, setOffline };
}

/** Attach error collectors to a page. */
export function watchErrors(page, label = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label}pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN_CONSOLE.some((r) => r.test(m.text()))) errors.push(`${label}console.error: ${m.text()}`); });
  page.on('crash', () => errors.push(`${label}page crashed`));
  return errors;
}

export const test = base.extend({
  hub: async ({}, use) => { await use(new RealtimeHub()); },
  mocks: [async ({ context, hub }, use) => { await use(await installMocks(context, { hub, tag: 'main' })); }, { auto: true }],
  wiki: async ({ mocks }, use) => { await use(mocks.wiki); },
  errors: [async ({ page }, use, info) => {
    const errs = watchErrors(page);
    const nav = [];
    if (process.env.DEBUG_NAV) page.on('console', (m) => { if (m.text().startsWith('[nav]')) nav.push(m.text()); });
    await use(errs);
    if (process.env.DEBUG_NAV && info.status !== info.expectedStatus) console.log(`--- nav log ${info.title}\n${nav.join('\n')}`);
    if (!info.annotations.some((a) => a.type === 'allow-errors')) expect(errs, 'page/console errors').toEqual([]);
  }, { auto: true }],
  /** Create an extra device (browser context) with mocks on the same Realtime hub. */
  newPlayer: async ({ browser, hub }, use, info) => {
    const made = [];
    await use(async (name = 'שחקן', { viewport = { width: 390, height: 844 } } = {}) => {
      const context = await browser.newContext({ viewport, locale: 'he-IL' });
      const m = await installMocks(context, { hub, tag: name });
      const page = await context.newPage();
      const errors = watchErrors(page, `[${name}] `);
      const p = { context, page, name, errors, ...m };
      made.push(p);
      return p;
    });
    const errs = made.flatMap((p) => p.errors);
    for (const p of made) await p.context.close().catch(() => {});
    if (!info.annotations.some((a) => a.type === 'allow-errors')) expect(errs, 'player page/console errors').toEqual([]);
  },
});
export { expect };
