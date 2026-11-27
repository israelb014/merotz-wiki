// General edge cases: input, storage, navigation, tabs, resize, upgrade from 1.0.0.
import { test, expect } from './fixtures.js';
import { readFileSync } from 'node:fs';
import { onboard, startCustom, waitArticle, clickLink, clicks, giveUp } from './helpers.js';

const LATEST = JSON.parse(readFileSync(new URL('../public/data/changelog.json', import.meta.url)))[0].version;

test('double-click on a link counts one move; double-click on "יאללה!" starts one game', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/modes');
  await page.click('[data-mode="fewest"]');
  await page.click('.custom summary');
  await page.fill('#cs', 'חומוס'); await page.fill('#ct', 'שוקולד');
  await page.dblclick('#next');
  await expect(page.locator('.pregame')).toBeVisible();
  await page.dblclick('#ready');
  await expect(page.locator('.play')).toBeVisible({ timeout: 15_000 });
  await waitArticle(page, 'חומוס');
  await page.locator('#art-body a.wl[data-t="טחינה"]').first().dblclick();
  await waitArticle(page, 'טחינה');
  await page.waitForTimeout(600);
  expect(await clicks(page)).toBe(1);
  await expect(page.locator('.crumb')).toHaveCount(2);
});

test('browser back during a game = in-game back (+1); at the start article it asks before quitting', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await clickLink(page, 'טחינה');
  await waitArticle(page, 'טחינה');
  await page.goBack();
  await waitArticle(page, 'חומוס');
  await expect(page.locator('.play')).toBeVisible();
  expect(await clicks(page)).toBe(2);
  await page.goBack(); // only the start article is left → quit confirmation
  await expect(page.locator('.modal')).toContainText('לפרוש');
  await page.click('.modal [data-close="cancel"]');
  await expect(page.locator('.play')).toBeVisible();
  await page.goBack();
  await page.click('.modal [data-close="ok"]');
  await expect(page.locator('.res-badge')).toContainText('ויתרת', { timeout: 10_000 });
});

test('refresh in the middle of a solo game: the game continues (1.0.2), no blank screen', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await page.reload();
  await expect(page.locator('.play')).toBeVisible();
  await waitArticle(page, 'חומוס');
});

test('offline in the middle of a game: friendly error, continue when back online', async ({ page, mocks }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await mocks.setOffline(true);
  await clickLink(page, 'טחינה');
  await expect(page.locator('.toast').filter({ hasText: /אין חיבור|נותק/ }).first()).toBeVisible();
  expect(await clicks(page)).toBe(0);
  await mocks.setOffline(false);
  await clickLink(page, 'טחינה');
  await waitArticle(page, 'טחינה');
  expect(await clicks(page)).toBe(1);
});

test('empty storage → onboarding; corrupted localStorage values never break the app', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('mw-solo-settings', '{"mode":"nope","timeLimit":"x","category":5,"difficulty":null,"allowBack":"yes"}');
    localStorage.setItem('mw-room-session', '{broken json');
    localStorage.setItem('mw-active-game', '[1,2,3]');
    localStorage.setItem('mw-theme-hint', '<script>');
    localStorage.setItem('mw-crash-queue', '{"not":"an array"}');
    localStorage.setItem('mw-crash-sent', '"x"');
  });
  await page.goto('./');
  await expect(page.locator('.onboarding')).toBeVisible();
  await page.fill('#nick', 'שבור');
  await page.click('#go');
  await expect(page.locator('.home')).toBeVisible();
  await page.goto('./#/modes');
  await expect(page.locator('.mode-card')).toHaveCount(5);
  await page.click('[data-mode="race"]');
  await expect(page.locator('.setup .chip.on')).toHaveCount(1);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await giveUp(page);
  await expect(page.locator('.res-hero')).toBeVisible({ timeout: 10_000 });
  await page.goto('./#/room?code=4321&create=1');
  await expect(page.locator('.lobby .code-big')).toHaveText('4321', { timeout: 20_000 });
  // the plain settings JSON corrupted to a non-object
  await page.evaluate(() => localStorage.setItem('mw-solo-settings', 'null'));
});

test('corrupted IndexedDB records (profile/settings of the wrong shape) are repaired at startup', async ({ page }) => {
  await page.goto('./manifest.webmanifest');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('merotz-wiki', 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('kv'); db.createObjectStore('games', { keyPath: 'id' }).createIndex('ts', 'ts'); db.createObjectStore('articles'); };
    r.onsuccess = () => { const t = r.result.transaction(['kv', 'games'], 'readwrite'); const kv = t.objectStore('kv');
      kv.put({ name: 'דנה', avatar: 42, color: null }, 'profile'); kv.put('dark', 'settings'); kv.put([1, 2], 'campaign'); kv.put('x', 'daily'); kv.put(7, 'seenChangelog');
      t.objectStore('games').put({ id: 'g1', ts: Date.now(), start: 'חומוס', target: 'שוקולד', path: 'oops', clicks: 2, elapsed: 1000, status: 'finished', kind: 'solo', mode: 'fewest' });
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); };
  }));
  await page.goto('./');
  await expect(page.locator('.home .me-chip')).toContainText('דנה');
  await expect(page.locator('.modal .changelog')).toBeVisible(); // seenChangelog was garbage → shown once
  await page.click('.modal [data-close]');
  for (const h of ['/stats', '/stats?tab=history', '/stats?tab=ach', '/campaign', '/settings']) {
    await page.goto(`./#${h}`);
    await expect(page.locator('main.screen')).toBeVisible();
    await expect(page.locator('.render-error')).toHaveCount(0);
  }
  await page.goto('./#/stats?tab=history');
  await page.locator('.hist-row').first().click();
  await expect(page.locator('.sheet')).toBeVisible();
});

test('localStorage full (quota exceeded): the game and a room still work', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('mw-')) throw new DOMException('quota', 'QuotaExceededError'); return orig.call(this, k, v); };
  });
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'טחינה' });
  await clickLink(page, 'טחינה');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
  await page.goto('./#/room?code=5678&create=1');
  await expect(page.locator('.lobby .code-big')).toHaveText('5678', { timeout: 20_000 });
});

test('names: max length enforced, emoji, Hebrew+English mix and HTML are shown safely', async ({ page, newPlayer }) => {
  await page.goto('./');
  await page.fill('#nick', 'א'.repeat(40));
  expect((await page.inputValue('#nick')).length).toBeLessThanOrEqual(16);
  await page.fill('#nick', '   ');
  await page.click('#go');
  await expect(page.locator('.toast')).toContainText('לפחות 2');
  await page.fill('#nick', '<b>x</b>"\'&');
  await page.click('#go');
  await expect(page.locator('.home .me-chip')).toContainText('<b>x</b>');
  expect(await page.locator('.home .me-chip b').count()).toBe(0);
  // emoji + mixed direction name in a room podium
  const c = String(2000 + Math.floor(Math.random() * 7000));
  const A = await newPlayer('a'); await onboard(A.page, '😀 Dan דני');
  await A.page.goto(`./#/room?code=${c}&create=1`);
  await expect(A.page.locator('.slot.filled')).toContainText('😀 Dan דני');
  const B = await newPlayer('b'); await onboard(B.page, 'Noa נועה', { query: `room=${c}` }); await B.page.click('#join');
  await expect(A.page.locator('.slot.filled')).toHaveCount(2);
  await A.page.click('#settings'); await A.page.click('[data-mode="fewest"]'); await A.page.click('.custom summary');
  await A.page.fill('#cs', 'חומוס'); await A.page.fill('#ct', 'טחינה'); await A.page.click('#next');
  await A.page.click('#start');
  await expect(A.page.locator('.play')).toBeVisible({ timeout: 30_000 }); await waitArticle(A.page, 'חומוס');
  await clickLink(A.page, 'טחינה');
  await expect(B.page.locator('.play')).toBeVisible({ timeout: 30_000 }); await waitArticle(B.page, 'חומוס'); await giveUp(B.page);
  await expect(A.page.locator('.pod-1 .av b')).toHaveText('😀', { timeout: 20_000 });
  const ow = await A.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(ow).toBeLessThanOrEqual(1);
});

test('resizing the window mid-game keeps the layout intact (phone ↔ desktop)', async ({ page }) => {
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  for (const [w, h] of [[1440, 900], [320, 640], [844, 390], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('#b-quit')).toBeVisible();
  }
  await clickLink(page, 'טחינה');
  await waitArticle(page, 'טחינה');
});

test('two tabs at once: both play and record history; two tabs in one room are two players', async ({ page, context }) => {
  await onboard(page, 'לשונית');
  const page2 = await context.newPage();
  await page2.goto('./');
  await expect(page2.locator('.home')).toBeVisible();
  await startCustom(page, { start: 'חומוס', target: 'טחינה' });
  await startCustom(page2, { start: 'פלאפל', target: 'חומוס' });
  await clickLink(page, 'טחינה');
  await clickLink(page2, 'חומוס');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
  await expect(page2.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
  await page.goto('./#/stats?tab=history');
  await expect(page.locator('.hist-row')).toHaveCount(2);
  const c = String(3000 + Math.floor(Math.random() * 6000));
  await page.goto(`./#/room?code=${c}&create=1`);
  await expect(page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  await page2.goto(`./#/room?code=${c}`);
  await expect(page2.locator('.slot.filled')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('.slot.filled')).toHaveCount(2);
  await page2.close();
});

test('upgrade: a profile saved by 1.0.0 opens in the new version with all data and one "what\'s new"', async ({ page }) => {
  await page.goto('./manifest.webmanifest');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('merotz-wiki', 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('kv'); db.createObjectStore('games', { keyPath: 'id' }).createIndex('ts', 'ts'); db.createObjectStore('articles'); };
    r.onsuccess = () => {
      const t = r.result.transaction(['kv', 'games', 'articles'], 'readwrite'); const kv = t.objectStore('kv');
      kv.put({ id: 'abc12345', name: 'ותיק', avatar: 'rocket', color: 'green' }, 'profile');
      kv.put({ theme: 'dark', sound: false, vibration: true, allowBack: false, allowFind: true }, 'settings');
      kv.put({ '1-1': 3, '1-2': 1 }, 'campaign'); kv.put({}, 'daily'); kv.put({ first_game: 1700000000000 }, 'achievements'); kv.put('1.0.0', 'seenChangelog');
      t.objectStore('games').put({ id: 'old-1', ts: 1700000000000, kind: 'solo', mode: 'race', start: 'חומוס', target: 'טחינה', path: [{ t: 'חומוס' }, { t: 'טחינה' }], clicks: 1, elapsed: 5000, status: 'finished', settings: { mode: 'race' } });
      t.objectStore('articles').put({ ts: Date.now(), v: { title: 'חומוס', html: '<p>ישן</p>' } }, 'a3:חומוס');
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    };
  }));
  await page.evaluate(() => { localStorage.setItem('mw-solo-settings', JSON.stringify({ mode: 'clock', timeLimit: 5, category: 'food', difficulty: 'hard', allowBack: false, allowFind: true })); localStorage.setItem('mw-seen-cl-first', '1'); });
  await page.goto('./');
  await expect(page.locator('.home .me-chip')).toContainText('ותיק');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.modal .changelog')).toContainText(LATEST, { timeout: 10_000 });
  await page.click('.modal [data-close]');
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.locator('.modal .changelog')).toHaveCount(0);
  await page.goto('./#/stats?tab=history');
  await expect(page.locator('.hist-row')).toHaveCount(1);
  await page.goto('./#/modes');
  await expect(page.locator('.mode-card.sel')).toContainText('נגד השעון');
  await page.goto('./#/campaign');
  await expect(page.locator('.star-pill b')).toHaveText('4');
});

test('a screen that throws while rendering shows a recovery card instead of a blank screen', async ({ page }) => {
  test.info().annotations.push({ type: 'allow-errors' });
  await onboard(page);
  await page.evaluate(async () => {
    const r = await import('/merotz-wiki/src/lib/router.js');
    r.route('/boom', () => { throw new Error('boom'); });
    r.go('/boom');
  });
  await expect(page.locator('.render-error')).toBeVisible();
  await page.click('.render-error [data-home]');
  await expect(page.locator('.home')).toBeVisible();
});

test('after visiting many screens, one back tap goes back exactly one screen (no piled-up handlers)', async ({ page }) => {
  await onboard(page);
  for (const h of ['/stats', '/settings', '/campaign', '/modes', '/join', '/stats?tab=ach', '/settings', '/campaign']) {
    await page.goto(`./#${h}`);
    await expect(page.locator('main.screen [data-back]').first()).toBeVisible();
  }
  await page.goto('./#/');
  await page.click('.home-actions [data-go="/campaign"]');
  await expect(page.locator('.campaign .lvl').first()).toBeVisible();
  await page.click('[data-back]');
  await expect(page.locator('.home')).toBeVisible();
  const len1 = await page.evaluate(() => history.length);
  await page.click('[data-go="/stats"]');
  await page.click('[data-back]');
  await expect(page.locator('.home')).toBeVisible();
  await page.click('.home-actions [data-go="/modes"]');
  await expect(page.locator('.mode-card').first()).toBeVisible();
  await page.click('[data-back]');
  await expect(page.locator('.home')).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(len1); // each push replaced the forward entry: no extra back steps
});
