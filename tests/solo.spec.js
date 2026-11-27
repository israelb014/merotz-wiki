import { test, expect } from './fixtures.js';
import { onboard, startCustom, waitArticle, clickLink, clicks } from './helpers.js';

test.describe('solo game', () => {
  test('full solo game: start → links → arrive → results → history', async ({ page }) => {
    await onboard(page, 'שחקן');
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שומשום' });
    await expect(page.locator('#art-title')).toHaveText('חומוס');
    expect(await clicks(page)).toBe(0);
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    expect(await clicks(page)).toBe(1);
    await expect(page.locator('.crumb.cur')).toContainText('טחינה');
    await clickLink(page, 'שומשום');
    await expect(page.locator('.end-flash.win')).toBeVisible();
    await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.res-badge')).toContainText('הגעת ליעד');
    await expect(page.locator('.res-stats b').first()).toHaveText('2');
    await expect(page.locator('.rv li')).toHaveCount(3);
    await page.goto('./#/stats?tab=history');
    await expect(page.locator('.hist-row').first()).toContainText('חומוס ← שומשום');
    await page.locator('.hist-row').first().click();
    await expect(page.locator('.sheet .rv li')).toHaveCount(3);
  });

  test('back button is allowed and costs +1 click; peek, find and give up work', async ({ page }) => {
    await onboard(page);
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שומשום' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await page.click('#b-back');
    await waitArticle(page, 'חומוס');
    expect(await clicks(page)).toBe(2);
    await expect(page.locator('.crumb.back')).toHaveCount(1);
    // peek
    await page.click('#peek');
    await expect(page.locator('.peek-title')).toHaveText('שומשום');
    await expect(page.locator('.peek-text')).not.toBeEmpty();
    await page.click('.peek [data-close]');
    // find in article
    await page.click('#b-find');
    await page.fill('#find-in', 'חומוס');
    await expect(page.locator('#find-count')).toHaveText(/^\d+\/\d+$/);
    expect(await page.locator('#art-body mark.fm').count()).toBeGreaterThan(0);
    await page.click('#find-close');
    await expect(page.locator('#art-body mark.fm')).toHaveCount(0);
    // give up
    await page.click('#b-quit');
    await page.click('.modal [data-close="ok"]');
    await expect(page.locator('.res-hero.lose')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.res-badge')).toContainText('ויתרת');
  });

  test('back disabled by rule toggle', async ({ page }) => {
    await onboard(page);
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שומשום', allowBack: false });
    await expect(page.locator('#b-back')).toBeHidden();
  });
});

test('offline: friendly screen with retry', async ({ page, mocks }) => {
  await onboard(page);
  await mocks.setOffline(true);
  await page.evaluate(() => { location.hash = '#/modes'; });
  await expect(page.locator('.offline-card')).toContainText('צריך אינטרנט כדי לשחק');
  await page.click('#retry');
  await expect(page.locator('.offline-card')).toBeVisible();
  await expect(page.locator('#retry')).toBeEnabled();
  await mocks.setOffline(false);
  await page.click('#retry');
  await expect(page.locator('.mode-card').first()).toBeVisible({ timeout: 15_000 });
});
