// 1.0.2 product decisions: saved solo game, one daily attempt, disambiguation confirm, numbered duplicate names.
import { test, expect } from './fixtures.js';
import { onboard, startCustom, waitArticle, clickLink, clicks, giveUp } from './helpers.js';

const savedSolo = (page) => page.evaluate(async () => (await import('/merotz-wiki/src/lib/store.js')).get('kv', 'activeSolo'));
const hudSeconds = async (page) => { const [m, s] = (await page.locator('#hud-time').textContent()).split(':').map(Number); return m * 60 + s; };

test.describe('decision 1: a solo game survives reload / reopening the app', () => {
  test('untimed game: reload continues exactly where it was (article, path, clicks)', async ({ page, context }) => {
    await onboard(page);
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שוקולד' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await expect.poll(async () => (await savedSolo(page))?.snap?.clicks).toBe(1);
    await page.reload();
    await expect(page.locator('.play')).toBeVisible();
    await waitArticle(page, 'טחינה');
    expect(await clicks(page)).toBe(1);
    await expect(page.locator('.crumb')).toHaveCount(2);
    // closing the app and opening it again (new page, same device)
    await page.close();
    const again = await context.newPage();
    await again.goto('./');
    await expect(again.locator('.play')).toBeVisible();
    await waitArticle(again, 'טחינה');
    await clickLink(again, 'שוקולד');
    await expect(again.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
    await expect(again.locator('.res-stats b').first()).toHaveText('2');
    expect(await savedSolo(again)).toBeUndefined(); // finished game is no longer saved
    await again.goto('./#/stats?tab=history');
    await expect(again.locator('.hist-row')).toHaveCount(1);
  });

  test('timed game: the clock keeps running from the real start time after a reload', async ({ page }) => {
    await onboard(page);
    await startCustom(page, { mode: 'clock', minutes: 3, start: 'חומוס', target: 'שוקולד' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await page.waitForTimeout(2500);
    const before = await hudSeconds(page);
    await page.reload();
    await waitArticle(page, 'טחינה');
    expect(await hudSeconds(page)).toBeLessThanOrEqual(before); // not reset to 03:00
    expect(await hudSeconds(page)).toBeLessThan(180);
    expect(await clicks(page)).toBe(1);
  });

  test('timed game: time ran out while the app was closed → "נגמר הזמן" and a loss in history', async ({ page, context }) => {
    await context.clock.install();
    await onboard(page);
    await startCustom(page, { mode: 'clock', minutes: 2, start: 'חומוס', target: 'שוקולד' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await expect.poll(async () => (await savedSolo(page))?.snap?.clicks).toBe(1);
    await page.close();                              // app closed
    await context.clock.fastForward('05:00');         // 5 minutes pass
    const reopened = await context.newPage();
    await reopened.goto('./');
    await expect(reopened.locator('.res-badge')).toContainText('נגמר הזמן', { timeout: 15_000 });
    await expect(reopened.locator('.res-stats b').nth(1)).toHaveText('02:00');
    await reopened.goto('./#/stats?tab=history');
    await expect(reopened.locator('.hist-row')).toHaveCount(1);
    await expect(reopened.locator('.hist-row .hist-ic.lose')).toHaveCount(1);
    await reopened.goto('./');
    await expect(reopened.locator('.home')).toBeVisible(); // not resumed again
  });

  test('a saved game untouched for 7 days is dropped silently', async ({ page, context }) => {
    await context.clock.install();
    await onboard(page);
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שוקולד' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await expect.poll(async () => (await savedSolo(page))?.snap?.clicks).toBe(1);
    await page.close();
    await context.clock.fastForward(170 * 3600_000);      // 7 days + 2 hours
    const reopened = await context.newPage();
    await reopened.goto('./');
    await expect(reopened.locator('.home')).toBeVisible();
    await expect(reopened.locator('.play')).toHaveCount(0);
    expect(await savedSolo(reopened)).toBeUndefined();
    await reopened.goto('./#/stats?tab=history');
    await expect(reopened.locator('#tab-body')).toContainText('עוד לא שיחקתם');
  });

  test('a game saved 6 days ago still resumes; starting a new game replaces the saved one', async ({ page, context }) => {
    await context.clock.install();
    await onboard(page);
    await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'שוקולד' });
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await page.close();
    await context.clock.fastForward(144 * 3600_000);
    const p2 = await context.newPage();
    await p2.goto('./');
    await waitArticle(p2, 'טחינה');
    // the app opened through a link (resume skipped) → the player starts another game from the menu
    const p3 = await context.newPage();
    await p2.close();
    await p3.goto('./#/join');
    await expect(p3.locator('.join')).toBeVisible();
    await startCustom(p3, { mode: 'fewest', start: 'פלאפל', target: 'חומוס' });
    const p2b = p3;
    await expect.poll(async () => (await savedSolo(p2b))?.snap?.start).toBe('פלאפל');
    await p2b.reload();
    await waitArticle(p2b, 'פלאפל');
    expect(await clicks(p2b)).toBe(0);
  });
});

test.describe('decision 2: one daily attempt per day', () => {
  async function playDaily(page) {
    await page.goto('./#/daily');
    await page.click('#ready');
    await waitArticle(page, 'חומוס');
  }

  test('reload in the middle of the daily continues the same attempt', async ({ page }) => {
    await onboard(page);
    await playDaily(page);
    await clickLink(page, 'טחינה');
    await waitArticle(page, 'טחינה');
    await page.reload();
    await waitArticle(page, 'טחינה');
    expect(await clicks(page)).toBe(1);
    await clickLink(page, 'שוקולד');
    await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.res-stats b').first()).toHaveText('2');
  });

  test('giving up is final: the daily button shows today\'s result and a new attempt is impossible', async ({ page }) => {
    await onboard(page);
    await playDaily(page);
    await giveUp(page);
    await expect(page.locator('.res-badge')).toContainText('ויתרת', { timeout: 10_000 });
    await page.goto('./#/');
    await expect(page.locator('#daily-ring')).toContainText('ויתר');
    await page.click('.daily-card');
    await expect(page.locator('.res-badge')).toContainText('ויתרת');
    await expect(page.locator('.pregame')).toHaveCount(0);
    await page.goto('./#/pregame');
    await expect(page.locator('.pregame #ready')).toHaveCount(0);
    await page.goto('./#/daily');
    await expect(page.locator('.res-badge')).toContainText('ויתרת');
  });

  test('a completed daily cannot be played again and its result is never replaced', async ({ page }) => {
    await onboard(page);
    await playDaily(page);
    await clickLink(page, 'טחינה'); await waitArticle(page, 'טחינה');
    await clickLink(page, 'שוקולד');
    await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
    await page.goto('./#/');
    await page.click('.home-actions [data-go="/daily"]');
    await expect(page.locator('.res-hero.win')).toBeVisible();
    await expect(page.locator('.pregame')).toHaveCount(0);
    // even a forged second result of the same day does not replace the stored one
    const kept = await page.evaluate(async () => {
      const app = await import('/merotz-wiki/src/app.js');
      const { state } = await import('/merotz-wiki/src/lib/store.js');
      const date = Object.keys(state.daily)[0];
      await app.recordResult({ result: () => ({ kind: 'daily', mode: 'fewest', start: 'חומוס', target: 'שוקולד', path: [{ t: 'חומוס' }], clicks: 9, elapsed: 1, status: 'gaveup' }) }, { date });
      return state.daily[date];
    });
    expect(kept.status).toBe('finished');
    expect(kept.clicks).toBe(2);
  });
});

test.describe('decision 3: disambiguation page as a custom target asks first', () => {
  async function customTo(page, target, ctxRoom = false) {
    if (!ctxRoom) { await page.goto('./#/modes'); await page.click('[data-mode="fewest"]'); }
    await page.click('.custom summary');
    await page.fill('#cs', 'חומוס');
    await page.fill('#ct', target);
    await page.click('#next');
  }

  test('solo: "בחר יעד אחר" stays on setup with the target field focused; "המשך" starts the game', async ({ page }) => {
    await onboard(page);
    await customTo(page, 'מרקורי');
    await expect(page.locator('.modal')).toContainText('היעד הוא דף פירושונים – זה יכול להיות קשה במיוחד. להמשיך?');
    await expect(page.locator('.modal [data-close="ok"]')).toHaveText('המשך');
    await expect(page.locator('.modal [data-close="cancel"]')).toHaveText('בחר יעד אחר');
    await page.click('.modal [data-close="cancel"]');
    await expect(page.locator('.setup')).toBeVisible();
    await expect(page.locator('#ct')).toBeFocused();
    await expect(page.locator('#next')).toBeEnabled();
    await page.click('#next');
    await page.click('.modal [data-close="ok"]');
    await expect(page.locator('.pregame')).toBeVisible();
    await expect(page.locator('.pg-card.target .pg-title')).toHaveText('מרקורי');
  });

  test('a normal target shows no dialog', async ({ page }) => {
    await onboard(page);
    await customTo(page, 'שוקולד');
    await expect(page.locator('.pregame')).toBeVisible();
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('room: the host is asked too; "המשך" keeps the disambiguation target', async ({ newPlayer }) => {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    const A = await newPlayer('מארח'); await onboard(A.page, 'מארח');
    await A.page.goto(`./#/room?code=${c}&create=1`);
    await expect(A.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
    await A.page.click('#settings');
    await A.page.click('[data-mode="fewest"]');
    await customTo(A.page, 'ירדן (פירושונים)', true);
    await expect(A.page.locator('.modal')).toContainText('דף פירושונים');
    await A.page.click('.modal [data-close="cancel"]');
    await expect(A.page.locator('.setup')).toBeVisible();
    await A.page.click('#next');
    await A.page.click('.modal [data-close="ok"]');
    await expect(A.page.locator('.settings-card')).toContainText('חומוס ← ירדן (פירושונים)');
  });
});

test.describe('decision 4: duplicate names in a room are numbered by join order', () => {
  test('three players named דני: "דני", "דני 2", "דני 3" for everyone; profiles unchanged', async ({ newPlayer }) => {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    const A = await newPlayer('a'); await onboard(A.page, 'דני');
    await A.page.goto(`./#/room?code=${c}&create=1`);
    await expect(A.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
    const B = await newPlayer('b'); await onboard(B.page, 'דני', { query: `room=${c}` }); await B.page.click('#join');
    await expect(B.page.locator('.slot.filled')).toHaveCount(2, { timeout: 20_000 });
    const C = await newPlayer('c'); await onboard(C.page, 'דני', { query: `room=${c}` }); await C.page.click('#join');
    for (const p of [A, B, C]) {
      await expect(p.page.locator('.slot.filled .slot-name')).toHaveText([/^\s*דני(?! \d)/, /דני 2/, /דני 3/], { timeout: 20_000 });
    }
    await expect(C.page.locator('.slot.filled').nth(2)).toContainText('(את/ה)');
    // a round: podium / routes use the same labels
    await A.page.click('#settings'); await A.page.click('[data-mode="fewest"]'); await A.page.click('.custom summary');
    await A.page.fill('#cs', 'חומוס'); await A.page.fill('#ct', 'טחינה'); await A.page.click('#next');
    await A.page.click('#start');
    for (const p of [A, B, C]) { await expect(p.page.locator('.play')).toBeVisible({ timeout: 30_000 }); await waitArticle(p.page, 'חומוס'); }
    await clickLink(C.page, 'טחינה');
    await giveUp(A.page); await giveUp(B.page);
    for (const p of [A, B, C]) await expect(p.page.locator('.podium .pod-1 .pod-name')).toHaveText('דני 3', { timeout: 20_000 });
    const heads = await A.page.locator('.route-row-head b').allTextContents();
    expect(heads.slice().sort()).toEqual(['דני', 'דני 2', 'דני 3']);
    // the chosen name in each profile stays "דני"
    for (const p of [B, C]) {
      expect(await p.page.evaluate(async () => (await import('/merotz-wiki/src/lib/store.js')).state.profile.name)).toBe('דני');
    }
  });
});
