import { test, expect } from './fixtures.js';
import { onboard, startCustom } from './helpers.js';

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test.describe(`RTL layout ${w}px`, () => {
    test.use({ viewport: { width: w, height: h } });

    async function noOverflow(page) {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, dir: document.documentElement.dir }));
      expect(o.dir).toBe('rtl');
      expect(o.sw).toBeLessThanOrEqual(o.iw + 1);
    }

    test('screens are RTL with no horizontal scroll', async ({ page }, info) => {
      await onboard(page, 'בדיקת פריסה');
      for (const hash of ['/', '/modes', '/setup?ctx=solo', '/join', '/stats', '/stats?tab=ach', '/settings', '/campaign']) {
        await page.goto(`./#${hash}`);
        await page.waitForTimeout(700);
        await noOverflow(page);
        // start-aligned headings sit on the right in RTL
        const h1 = page.locator('h1').first();
        if (await h1.count()) {
          const box = await h1.boundingBox();
          if (box && hash !== '/') expect(box.x + box.width).toBeGreaterThan(w * 0.5);
        }
        await info.attach(`${w}${hash.replace(/\W/g, '_')}.png`, { body: await page.screenshot(), contentType: 'image/png' });
      }
      // primary buttons are big tap targets
      await page.goto('./#/');
      const btn = await page.locator('.home-actions .btn').first().boundingBox();
      expect(btn.height).toBeGreaterThanOrEqual(56);
    });

    test('game screen RTL: target on the right, article readable, links tappable', async ({ page }, info) => {
      await onboard(page);
      await startCustom(page, { mode: 'race', start: 'חומוס', target: 'שומשום' });
      await noOverflow(page);
      const target = await page.locator('#peek').boundingBox();
      const clicksPill = await page.locator('#clicks').boundingBox();
      expect(target.x).toBeGreaterThan(clicksPill.x); // RTL: target pill at the right
      const fs = await page.locator('#art-body p').first().evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
      expect(fs).toBeGreaterThanOrEqual(17);
      const link = await page.locator('#art-body p a.wl').first().evaluate((a) => ({ color: getComputedStyle(a).color, h: a.getBoundingClientRect().height }));
      expect(link.h).toBeGreaterThanOrEqual(20);
      await expect(page.locator('#hud-time')).toHaveText(/^\d\d:\d\d$/);
      await info.attach(`game-${w}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}
