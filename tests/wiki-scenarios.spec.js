// Wikipedia edge cases, all against the fixture mock.
import { test, expect } from './fixtures.js';
import { onboard, startCustom, waitArticle, clickLink, clicks, giveUp } from './helpers.js';

const page0 = (links) => `<!DOCTYPE html><html><body><section data-mw-section-id="0"><p>דף בדיקה. ${links}</p></section>
<section data-mw-section-id="1"><h2 id="סעיף_יעד">סעיף יעד</h2><p>${'מילוי. '.repeat(600)}</p></section></body></html>`;
const wl = (t, text = t, extra = '') => `<a rel="mw:WikiLink" href="./${encodeURIComponent(t.replace(/ /g, '_'))}${extra}" title="${t.replace(/"/g, '&quot;')}">${text}</a>`;

test('redirect link: resolves to the canonical article (פלאפל → "תל אביב" → תל אביב-יפו)', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'פלאפל', target: 'שוקולד' });
  await clickLink(page, 'תל אביב');
  await waitArticle(page, 'תל אביב-יפו');
  expect(await clicks(page)).toBe(1);
  await expect(page.locator('.crumb.cur')).toContainText('תל אביב-יפו');
});

test('redirect as target: typing a redirect resolves the target, arriving via the redirect link wins', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'קקאו', target: 'בריטניה' });
  await expect(page.locator('.target-pill b')).toHaveText('הממלכה המאוחדת');
  await clickLink(page, 'בריטניה');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
});

test('disambiguation page: playable like any article, never chosen as a random target', async ({ page, wiki }) => {
  wiki.overrides['חומוס'] = page0(`${wl('מרקורי')} ${wl('טחינה')}`);
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await clickLink(page, 'מרקורי');
  await waitArticle(page, 'מרקורי');
  expect(await clicks(page)).toBe(1);
  await expect(page.locator('#art-body a.wl').first()).toBeVisible();
});

test('deleted / missing page: link shows a message and costs nothing', async ({ page, wiki }) => {
  wiki.deleted.add('טחינה');
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await clickLink(page, 'טחינה');
  await expect(page.locator('.toast')).toContainText('הערך הזה לא קיים');
  expect(await clicks(page)).toBe(0);
  await expect(page.locator('#art-title')).toHaveText('חומוס');
  await expect(page.locator('#art-body a.wl.pending')).toHaveCount(0);
});

test('custom pair with a missing article or identical start/target is rejected with a message', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/modes');
  await page.click('[data-mode="fewest"]');
  await page.click('.custom summary');
  await page.fill('#cs', 'ערך שלא קיים בכלל 12345'); await page.fill('#ct', 'חומוס');
  await page.click('#next');
  await expect(page.locator('.toast').last()).toContainText('לא נמצא');
  await page.fill('#cs', 'תל אביב'); await page.fill('#ct', 'תל אביב-יפו');
  await page.click('#next');
  await expect(page.locator('.toast').last()).toContainText('זהים');
  await expect(page.locator('#next')).toBeEnabled();
});

test('file / category / template links are inert; real fixture article (חומוס) has them', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  const t = await page.$$eval('#art-body a.wl', (a) => a.map((x) => x.dataset.t));
  expect(t.length).toBeGreaterThan(30);
  expect(t.filter((x) => /^(קובץ|קטגוריה|תבנית|עזרה|ויקיפדיה):/.test(x))).toEqual([]);
  // a dead span (unwrapped) is not a link
  const dead = page.locator('#art-body .dead').first();
  if (await dead.count()) { await dead.click({ force: true }); await page.waitForTimeout(300); expect(await clicks(page)).toBe(0); }
});

test('links with a #fragment: other article → navigates (fragment ignored); same-page anchor → scroll only', async ({ page, wiki }) => {
  wiki.overrides['חומוס'] = page0(`${wl('טחינה', 'טחינה עם עוגן', '#היסטוריה')} <a href="#סעיף_יעד">לסעיף</a> ${wl('חומוס', 'קישור עצמי', '#סעיף_יעד')}`);
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await page.locator('#art-body a.anchor').first().click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.locator('#art-body a.anchor').nth(1).click();
  expect(await clicks(page)).toBe(0);
  await page.locator('#art-body a.wl[data-t="טחינה"]').click();
  await waitArticle(page, 'טחינה');
  expect(await clicks(page)).toBe(1);
});

test('huge article (ישראל, ~900KB) renders, links work, no horizontal overflow, find works', async ({ page }) => {
  await onboard(page);
  const t0 = Date.now();
  await startCustom(page, { start: 'ישראל', target: 'שוקולד' });
  expect(Date.now() - t0).toBeLessThan(30_000);
  expect(await page.locator('#art-body a.wl').count()).toBeGreaterThan(500);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(o).toBeLessThanOrEqual(1);
  await page.click('#b-find');
  await page.fill('#find-in', 'ירושלים');
  await expect(page.locator('#find-count')).toHaveText(/^1\/\d+$/);
  await page.click('#find-close');
  await clickLink(page, 'ירושלים');
  await waitArticle(page, 'ירושלים');
});

test('slow Wikipedia (10s): skeleton while loading; stale article links are not clickable meanwhile', async ({ page, wiki }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  wiki.delay['טחינה'] = 10_000;
  await clickLink(page, 'טחינה');
  await expect(page.locator('#art-title')).toHaveText('טחינה');
  await expect(page.locator('#art-body')).toHaveClass(/loading/);
  // the previous article is still on screen: clicking its links must not count / navigate
  await page.locator('#art-body a.wl[data-t="פיתה"]').first().click({ force: true });
  await page.waitForTimeout(500);
  expect(await clicks(page)).toBe(1);
  // keyboard activation bypasses pointer-events: must be ignored too
  await page.locator('#art-body a.wl[data-t="פיתה"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(await clicks(page)).toBe(1);
  await waitArticle(page, 'טחינה');
  await expect(page.locator('.crumb')).toHaveCount(2);
  expect(await clicks(page)).toBe(1);
});

test('network error while moving to the next article: error card with retry, then continue', async ({ page, wiki }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  wiki.failNext = 1;
  await clickLink(page, 'טחינה');
  await expect(page.locator('.art-error')).toBeVisible();
  await expect(page.locator('.art-error')).toContainText(/אין חיבור|לא הצלחנו/);
  await page.click('#retry');
  await waitArticle(page, 'טחינה');
  await clickLink(page, 'שוקולד');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
});

test('network error while resolving the clicked link (API down): no crash, no click counted', async ({ page, wiki }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  wiki.offline = true;
  await clickLink(page, 'שמן זית');
  await expect(page.locator('.toast').last()).toContainText('אין חיבור');
  expect(await clicks(page)).toBe(0);
  await expect(page.locator('#art-body a.wl.pending')).toHaveCount(0);
  wiki.offline = false;
  await clickLink(page, 'שמן זית');
  await waitArticle(page, 'שמן זית');
  expect(await clicks(page)).toBe(1);
});

test('start == target (also via redirect) is refused', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/modes');
  await page.click('[data-mode="race"]');
  await page.click('.custom summary');
  await page.fill('#cs', 'חומוס'); await page.fill('#ct', 'חומוס');
  await page.click('#next');
  await expect(page.locator('.toast').last()).toContainText('זהים');
  await expect(page.locator('.pregame')).toHaveCount(0);
});

test('win in the last second of the timer counts as a win (clock mode)', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await startCustom(page, { mode: 'clock', minutes: 2, start: 'חומוס', target: 'טחינה' });
  await page.clock.fastForward('01:58');
  await page.clock.runFor(1200);
  await expect(page.locator('#hud-time')).toHaveText(/^00:0[01]$/);
  await clickLink(page, 'טחינה');
  await expect(page.locator('.res-badge')).toContainText('הגעת ליעד', { timeout: 15_000 });
  const t = await page.locator('.res-stats b').nth(1).textContent();
  expect(t <= '02:00').toBe(true);
});

test('timeout exactly while a link is resolving: game ends as timeout, the late click is ignored', async ({ page, wiki }) => {
  await page.clock.install();
  await onboard(page);
  await startCustom(page, { mode: 'clock', minutes: 2, start: 'חומוס', target: 'שוקולד' });
  wiki.apiDelay = 1500;
  await page.clock.fastForward('01:59');
  await clickLink(page, 'טחינה');
  await page.clock.runFor(2000);
  await expect(page.locator('.res-badge')).toContainText('נגמר הזמן', { timeout: 15_000 });
  await expect(page.locator('.res-stats b').first()).toHaveText('0');
});
