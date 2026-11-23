import { test, expect } from '@playwright/test';
import { onboard, startCustom, waitArticle, clickLink, clickAnyLink, clicks } from './helpers.js';

test('6 steps: 6 clicks max, the 7th is impossible → נכשל', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { mode: 'six', start: 'חומוס', target: 'מכניקת הקוונטים' });
  await expect(page.locator('#hud-time')).toHaveText('0/6');
  const visited = ['חומוס'];
  for (let i = 1; i <= 5; i++) {
    const t = await clickAnyLink(page, ['מכניקת הקוונטים', ...visited]);
    visited.push(t);
    await waitArticle(page, t);
    expect(await clicks(page)).toBe(i);
    await expect(page.locator('#hud-time')).toHaveText(`${i}/6`);
  }
  await clickAnyLink(page, ['מכניקת הקוונטים', ...visited]);
  await expect(page.locator('.end-flash.lose')).toContainText('נגמרו הצעדים');
  await expect(page.locator('#art-body')).toHaveClass(/links-off/);
  await expect(page.locator('.res-hero.lose')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.res-badge')).toContainText('נכשל');
  await expect(page.locator('.res-stats b').first()).toHaveText('6');
});

test('forbidden article: entering it disqualifies', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { mode: 'forbidden', start: 'חומוס', target: 'שומשום' });
  const forbidden = (await page.locator('.forbid-pill b').textContent()).trim();
  expect(['ארצות הברית', 'מצרים', 'ישראל', 'ירושלים']).toContain(forbidden);
  await expect(page.locator(`#art-body a.wl[data-t="${forbidden}"]`).first()).toBeAttached();
  await clickLink(page, forbidden);
  await expect(page.locator('.end-flash.lose')).toContainText('לערך האסור');
  await expect(page.locator('.res-badge')).toContainText('נפסלת', { timeout: 10_000 });
});

test('against the clock: timer counts down and time-out ends the game', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await startCustom(page, { mode: 'clock', minutes: 2, start: 'חומוס', target: 'מכניקת הקוונטים' });
  await expect(page.locator('#hud-time')).toHaveText(/^0[12]:\d\d$/);
  await page.clock.fastForward('02:05');
  await expect(page.locator('.res-badge')).toContainText('נגמר הזמן', { timeout: 15_000 });
});
