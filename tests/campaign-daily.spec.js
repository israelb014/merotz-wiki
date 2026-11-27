import { test, expect } from '@playwright/test';
import { onboard, waitArticle } from './helpers.js';

/** Click the playable link leading to `next` (exact title, or a redirect that resolves to it). */
async function follow(page, next) {
  const ok = await page.evaluate(async (next) => {
    const links = [...document.querySelectorAll('#art-body a.wl')];
    let a = links.find((x) => x.dataset.t === next);
    if (!a) {
      const titles = [...new Set(links.map((x) => x.dataset.t))];
      for (let i = 0; i < titles.length && !a; i += 50) {
        const u = new URL('https://he.wikipedia.org/w/api.php');
        Object.entries({ action: 'query', titles: titles.slice(i, i + 50).join('|'), redirects: '1', format: 'json', formatversion: '2', origin: '*' }).forEach(([k, v]) => u.searchParams.set(k, v));
        const d = await (await fetch(u)).json();
        const red = (d.query.redirects || []).find((r) => r.to === next);
        const norm = (d.query.normalized || []).find((r) => r.to === (red?.from || next));
        const want = norm?.from || red?.from;
        if (want) a = links.find((x) => x.dataset.t === want);
      }
    }
    if (!a) return false;
    a.setAttribute('data-pick', '1');
    return true;
  }, next);
  expect(ok, `link to ${next}`).toBe(true);
  const l = page.locator('#art-body a.wl[data-pick]').first();
  await l.scrollIntoViewIfNeeded();
  await l.click();
}

test('campaign: level 1-1 with the shortest route earns 3 stars and unlocks 1-2', async ({ page, request }) => {
  const camp = await (await request.get('./data/campaign.json')).json();
  expect(camp.worlds).toHaveLength(6);
  expect(camp.worlds.flatMap((w) => w.levels)).toHaveLength(60);
  const lvl = camp.worlds[0].levels[0];
  await onboard(page);
  await page.goto('./#/campaign');
  await expect(page.locator('.lvl')).toHaveCount(60);
  await expect(page.locator('[data-lvl="1-2"]')).toHaveClass(/closed/);
  await page.click('[data-lvl="1-1"]');
  await page.click('#ready');
  await waitArticle(page, lvl.start);
  for (const t of lvl.path.slice(1, -1)) { await follow(page, t); await waitArticle(page, t); }
  await follow(page, lvl.path.at(-1));
  await expect(page.locator('.stars-big .on')).toHaveCount(3, { timeout: 15_000 });
  await page.goto('./#/campaign');
  await expect(page.locator('[data-lvl="1-2"]')).not.toHaveClass(/closed/);
  await expect(page.locator('.world').nth(1)).toHaveClass(/locked/); // world 2 needs 20 stars
});

test('daily challenge: play today, result shows shortest route, countdown and spoiler-free share', async ({ page, request }) => {
  const daily = await (await request.get('./data/daily.json')).json();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const d = daily.days[today];
  expect(d, `daily entry for ${today}`).toBeTruthy();
  await onboard(page);
  await expect(page.locator('#daily-pair')).toContainText(d.start);
  await page.goto('./#/daily');
  await expect(page.locator('.pregame .pg-title').first()).toHaveText(d.start);
  await page.click('#ready');
  await waitArticle(page, d.start);
  for (const t of d.path.slice(1, -1)) { await follow(page, t); await waitArticle(page, t); }
  await follow(page, d.path.at(-1));
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.shortest .rl-n')).toHaveCount(d.path.length);
  await expect(page.locator('#cd')).toHaveText(/^\d\d:\d\d:\d\d$/);
  // share (no Web Share in desktop Chromium → sheet with text)
  await page.evaluate(() => { delete navigator.share; Object.defineProperty(navigator, 'share', { value: undefined }); });
  await page.click('#share');
  const text = await page.locator('.share-pre').textContent();
  expect(text).toContain('אתגר יומי');
  expect(text).toContain('◉');
  for (const t of d.path) expect(text).not.toContain(t);
  await page.locator('.sheet [data-close], .scrim').last().click({ force: true }).catch(() => {});
  // replaying the daily shows the stored result instead of a new game
  await page.goto('./#/');
  await page.goto('./#/daily');
  await expect(page.locator('.res-hero.win')).toBeVisible();
  await page.goto('./#/stats');
  await expect(page.locator('.ring-tile').nth(1)).toContainText('1');
});
