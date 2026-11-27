// Crash reporting (src/lib/crash.js): ntfy.sh is mocked by the fixture network wall.
import { test, expect } from './fixtures.js';
import { onboard } from './helpers.js';
import { readFileSync } from 'node:fs';

const CFG = JSON.parse(readFileSync(new URL('../config/crash-reporting.json', import.meta.url)));
const force = (page) => page.addInitScript(() => { window.__MW_CRASH_FORCE = true; });
const bodies = (mocks) => mocks.ntfy.map((r) => JSON.parse(r.body));

test.describe('crash reporting', () => {
  test.beforeEach(() => test.info().annotations.push({ type: 'allow-errors' }));

  test('disabled while automated tests run (navigator.webdriver): nothing is sent', async ({ page, mocks }) => {
    await onboard(page, 'בודק');
    await page.evaluate(() => { setTimeout(() => { throw new Error('should not be reported'); }); Promise.reject(new Error('nor this')); });
    await page.waitForTimeout(1500);
    expect(mocks.ntfy).toEqual([]);
  });

  test('topic config: random, at least 24 chars, one config file', async () => {
    expect(CFG.server).toBe('https://ntfy.sh');
    expect(CFG.topic.length).toBeGreaterThanOrEqual(24);
    expect(CFG.topic).toMatch(/^[a-z0-9-]+$/);
    expect(CFG.maxPerHour).toBe(5);
  });

  test('uncaught error + unhandled rejection are reported with app, version, platform, message, stack, screen and no personal data', async ({ page, mocks }) => {
    await force(page);
    await onboard(page, 'ישראלה');
    await page.goto('./#/room?code=4821&create=1');
    await expect(page.locator('.lobby .code-big')).toHaveText('4821', { timeout: 20_000 });
    await page.evaluate(() => {
      setTimeout(() => { throw new Error('boom in room 4821 for ישראלה'); });
      Promise.reject(new Error('rejected ישראלה'));
    });
    await expect.poll(() => mocks.ntfy.length).toBe(2);
    const [a, b] = bodies(mocks);
    for (const r of [a, b]) {
      expect(r.topic).toBe(CFG.topic);
      expect(r.title).toContain('מרוץ ויקי');
      expect(r.title).toMatch(/\d+\.\d+\.\d+ · web/);
      expect(r.message).toContain('מסך: /room');
      expect(JSON.stringify(r)).not.toContain('ישראלה');
      expect(JSON.stringify(r)).not.toContain('4821');
    }
    expect(a.message + b.message).toContain('boom in room ####');
    expect(a.message + b.message).toContain('rejected [name]');
  });

  test('at most 5 reports per hour per device', async ({ page, mocks }) => {
    await force(page);
    await onboard(page);
    await page.evaluate(() => { for (let i = 0; i < 9; i++) setTimeout(() => { throw new Error('err number ' + 'abcdefghi'[i]); }, i * 30); });
    await page.waitForTimeout(2500);
    expect(mocks.ntfy.length).toBe(5);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mw-crash-queue')).length)).toBe(4);
    // an hour later the queue drains (5 more allowed)
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mw-crash-sent')); localStorage.setItem('mw-crash-sent', JSON.stringify(s.map((t) => t - 3_700_000))); });
    await page.evaluate(async () => (await import('/merotz-wiki/src/lib/crash.js')).flush());
    await expect.poll(() => mocks.ntfy.length).toBe(9);
  });

  test('offline: reports are queued and sent when the network returns', async ({ page, mocks }) => {
    await force(page);
    await onboard(page);
    await mocks.setOffline(true);
    await page.evaluate(() => { setTimeout(() => { throw new Error('while offline'); }); });
    await page.waitForTimeout(800);
    expect(mocks.ntfy.length).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mw-crash-queue')).length)).toBe(1);
    await mocks.setOffline(false);
    await expect.poll(() => mocks.ntfy.length, { timeout: 10_000 }).toBe(1);
    expect(bodies(mocks)[0].message).toContain('while offline');
  });

  test('browser noise (ResizeObserver, cross-origin "Script error.", extensions) is not reported', async ({ page, mocks }) => {
    await force(page);
    await onboard(page);
    await page.evaluate(() => {
      setTimeout(() => { throw new Error('ResizeObserver loop completed with undelivered notifications.'); });
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
      const e = new Error('x'); e.stack = 'Error: x\n at chrome-extension://abc/content.js:1:1'; setTimeout(() => { throw e; });
    });
    await page.waitForTimeout(1200);
    expect(mocks.ntfy).toEqual([]);
  });

  test('scrubbing removes names, room codes, URL queries and emails', async ({ page }) => {
    await page.goto('./');
    const out = await page.evaluate(async () => {
      const m = await import('/merotz-wiki/src/lib/crash.js');
      return m.scrub('דני joined room-1234 code 5678 https://x.org/a?room=1234#q mail me a@b.co at 12:34', 'דני');
    });
    expect(out).toBe('[name] joined room-#### code #### https://x.org/a mail me [email] at 12:34');
  });
});
