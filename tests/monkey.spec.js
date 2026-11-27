// "Monkey user": random clicks / typing with weird input. 2000 actions per run, seeded.
// A bug = page error, console error, unhandled rejection, blank screen or a stuck page.
// Run: MONKEY=1 npx playwright test tests/monkey.spec.js   (MONKEY_SEEDS=1,2,3,4,5 MONKEY_ACTIONS=2000)
import { test, expect } from './fixtures.js';
import { onboard } from './helpers.js';
import { rng } from './mocks/rng.js';

const SEEDS = (process.env.MONKEY_SEEDS || '1').split(',').map(Number);
const ACTIONS = Number(process.env.MONKEY_ACTIONS || 2000);
const WEIRD = ['', ' ', 'א', '😀😀😀', '<img src=x onerror=alert(1)>', '"\'`;', 'a'.repeat(300), 'ישראל', 'חומוס', '١٢٣٤', '1234', '0000',
  '‮משהו', 'null', 'undefined', '%00%2F', 'Dan דני 123', '\t\n', 'ﷺ', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢'];
const BACKUPS = ['{}', 'not json', '{"app":"merotz-wiki","kv":{"profile":5}}',
  '{"app":"merotz-wiki","v":1,"kv":{"profile":{"name":"גיבוי","id":"x"}},"games":[{"id":"1","ts":1}]}'];
const HASHES = ['/', '/modes', '/setup?ctx=solo', '/setup?ctx=room', '/stats', '/stats?tab=history', '/stats?tab=ach', '/settings', '/campaign', '/daily',
  '/join', '/join?code=12', '/room?code=abcd', '/results', '/play', '/pregame', '/nope', '/offline', '/modes?ctx=room'];

test.describe.configure({ mode: 'parallel' });

for (const seed of SEEDS) {
  test(`monkey run seed=${seed} (${ACTIONS} actions) @mobile-only`, async ({ page }) => {
    test.setTimeout(40 * 60_000);
    const r = rng(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    await page.addInitScript(() => { window.open = () => null; try { Object.defineProperty(navigator, 'share', { value: undefined }); } catch {} });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('download', (d) => d.cancel().catch(() => {}));
    page.on('filechooser', (fc) => fc.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(pick(BACKUPS)) }).catch(() => {}));
    await onboard(page, 'קוף');
    const trail = [];
    let lastChange = Date.now(), lastSig = '';
    for (let i = 0; i < ACTIONS; i++) {
      const roll = r();
      let act = '';
      try {
        if (roll < 0.03) { act = 'back'; await page.goBack({ timeout: 1500 }).catch(() => {}); }
        else if (roll < 0.05) { const h = pick(HASHES); act = `goto ${h}`; await page.evaluate((h) => { location.hash = '#' + h; }, h); }
        else if (roll < 0.07) { const k = pick(['Escape', 'Enter', 'Tab', 'Alt+ArrowLeft', 'Control+f', 'Backspace']); act = `key ${k}`; await page.keyboard.press(k); }
        else {
          // one in-page query: pick a random visible clickable element (articles have hundreds of links)
          const target = await page.evaluate((rnd) => {
            for (const n of document.querySelectorAll('[data-monkey]')) delete n.dataset.monkey;
            const all = [...document.querySelectorAll('button:not([disabled]), a, input, [data-go], [data-lvl], summary, label, .scrim')]
              .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(n).visibility !== 'hidden'; });
            if (!all.length) return null;
            const n = all[Math.floor(rnd * all.length)];
            n.dataset.monkey = '1';
            return { tag: `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}.${[...n.classList].slice(0, 2).join('.')}${n.dataset?.t ? `[${n.dataset.t}]` : ''}`, type: n.getAttribute('type') };
          }, r());
          if (!target) act = 'none';
          else {
            const e = page.locator('[data-monkey="1"]').first();
            const { tag, type } = target;
            if (tag.startsWith('input')) {
              if (type === 'checkbox') { act = `toggle ${tag}`; await e.click({ timeout: 600, force: true }); }
              else if (type === 'file') { act = 'file input'; await e.click({ timeout: 600, force: true }); }
              else { const v = pick(WEIRD); act = `fill ${tag} ${JSON.stringify(v).slice(0, 30)}`; await e.fill(v, { timeout: 600 }); if (r() < 0.4) await e.press('Enter', { timeout: 600 }); }
            } else { act = `click ${tag}`; await e.click({ timeout: 600 }); }
          }
        }
      } catch { /* element vanished / covered – normal for a monkey */ }
      trail.push(`${i}: ${act}`);
      // left the single-page app (download page / privacy page / external): come back
      const u = new URL(page.url());
      if (!/\/merotz-wiki\/?$/.test(u.pathname) && !/\/merotz-wiki\/index\.html$/.test(u.pathname)) {
        trail.push(`${i}: (left app → ${u.pathname}) back to game`);
        await page.goto('./').catch(() => {});
      }
      if (i % 25 === 0) {
        const st = await page.evaluate(() => ({ hash: location.hash, html: document.getElementById('app')?.innerHTML.length || 0 })).catch(() => null);
        expect(st, `page alive at action ${i}`).toBeTruthy();
        if (st.html === 0) {
          await page.waitForTimeout(2000);
          const again = await page.evaluate(() => document.getElementById('app')?.innerHTML.length || 0);
          expect(again, `blank screen at action ${i} (${st.hash})\n${trail.slice(-15).join('\n')}`).toBeGreaterThan(0);
        }
        const sig = `${st.hash}|${st.html}`;
        if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
        expect(Date.now() - lastChange, `stuck on ${st.hash}`).toBeLessThan(120_000);
      }
    }
    await test.info().attach('trail', { body: trail.join('\n'), contentType: 'text/plain' });
  });
}
