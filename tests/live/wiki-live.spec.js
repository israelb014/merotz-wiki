// The ONLY test that talks to the real Wikipedia API: one short route, to detect API changes.
// Run manually: npm run test:live   (never in CI). Supabase stays blocked.
import { test, expect } from '@playwright/test';

test('live Wikipedia: חומוס → טחינה through the real REST + action APIs', async ({ page, request, context }) => {
  const probe = await request.get('https://he.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', { headers: { 'Api-User-Agent': 'MerotzWiki/1.0 (live check)' } }).catch((e) => ({ status: () => 0, e }));
  test.skip(probe.status() !== 200, `Wikipedia API not reachable from this environment (HTTP ${probe.status()})`);
  await context.route(/supabase\.co|ntfy\.sh/, (r) => r.abort());
  await page.goto('./');
  await page.fill('#nick', 'בדיקה חיה');
  await page.click('#go');
  await page.goto('./#/modes');
  await page.click('[data-mode="fewest"]');
  await page.click('.custom summary');
  await page.fill('#cs', 'חומוס');
  await page.fill('#ct', 'טחינה');
  await page.click('#next');
  await expect(page.locator('.pregame')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.pg-extract').first()).not.toBeEmpty({ timeout: 20_000 });
  await page.click('#ready');
  await expect(page.locator('#art-title')).toHaveText('חומוס', { timeout: 20_000 });
  await expect(page.locator('#art-body')).not.toHaveClass(/loading/, { timeout: 30_000 });
  expect(await page.locator('#art-body a.wl').count()).toBeGreaterThan(20); // Parsoid mw:WikiLink markup still there
  await page.locator('#art-body a.wl[data-t="טחינה"]').first().click();
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 20_000 });
});
