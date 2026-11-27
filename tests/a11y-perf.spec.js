// Basic accessibility (axe-core, WCAG 2 A/AA) and load-time budgets.
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { onboard, startCustom } from './helpers.js';

const SCREENS = ['/', '/modes', '/setup?ctx=solo', '/join', '/stats', '/stats?tab=ach', '/settings', '/campaign'];

async function axe(page, label) {
  // let entrance / theme transitions finish – axe must not sample half-faded text
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    // decorative SVG route lines and the Wikipedia article body (third-party content) are out of scope
    .exclude('#art-body')
    .analyze();
  const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.map((v) => `${label}: ${v.id} (${v.impact}) ×${v.nodes.length} – ${v.nodes.slice(0, 2).map((n) => `${n.target.join(' ')} ${n.html.slice(0, 80)} ${n.any.map((x) => x.message).join(' ').slice(0, 160)}`).join(' | ')}`);
}

test('axe: no serious/critical WCAG A/AA violations on main screens (light + dark)', async ({ page }) => {
  await onboard(page);
  const found = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async (t) => { const s = await import('/merotz-wiki/src/lib/store.js'); s.state.settings.theme = t; await s.save('settings'); (await import('/merotz-wiki/src/theme.js')).applyTheme(); }, theme);
    for (const h of SCREENS) {
      await page.goto(`./#${h}`);
      await page.waitForTimeout(h === '/' ? 1200 : 500); // theme colour transition after switching
      found.push(...await axe(page, `${theme} ${h}`));
    }
  }
  expect(found).toEqual([]);
});

test('axe: game screen and results', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'טחינה' });
  const found = await axe(page, 'play');
  await page.locator('#art-body a.wl[data-t="טחינה"]').first().click();
  await expect(page.locator('.res-hero')).toBeVisible({ timeout: 10_000 });
  found.push(...await axe(page, 'results'));
  expect(found).toEqual([]);
});

test('load time: first screen interactive fast, article render fast (mocked network)', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('./');
  await expect(page.locator('#nick')).toBeVisible();
  const first = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  await page.fill('#nick', 'מהיר'); await page.click('#go');
  await expect(page.locator('.home')).toBeVisible();
  await startCustom(page, { start: 'פלאפל', target: 'שוקולד' });
  const t1 = Date.now();
  await page.locator('#art-body a.wl[data-t="ישראל"]').first().click();
  await expect(page.locator('#art-title')).toHaveText('ישראל');
  await expect(page.locator('#art-body')).not.toHaveClass(/loading/, { timeout: 15_000 });
  const huge = Date.now() - t1;
  test.info().annotations.push({ type: 'perf', description: `first screen ${first}ms · DCL ${Math.round(nav.dcl)}ms · load ${Math.round(nav.load)}ms · huge article ${huge}ms` });
  console.log(`[perf] first screen ${first}ms · DCL ${Math.round(nav.dcl)}ms · load ${Math.round(nav.load)}ms · huge article (ישראל) ${huge}ms`);
  expect(first).toBeLessThan(8000); // dev server, unbundled modules
  expect(huge).toBeLessThan(6000);
});
