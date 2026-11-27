// Full flows for every screen / action in qa/APP_MAP.md, for timed and untimed modes.
import { test, expect } from './fixtures.js';
import { onboard, startCustom, waitArticle, clickLink, clicks, giveUp } from './helpers.js';

test('onboarding: validation, color + avatar choice, profile saved and shown', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.onboarding')).toBeVisible();
  await page.click('#go');
  await expect(page.locator('.toast')).toContainText('לפחות 2');
  await page.fill('#nick', 'מירב');
  await page.click('.color-dot[data-color="purple"]');
  await page.click('.av-opt >> nth=3');
  await page.press('#nick', 'Enter');
  await expect(page.locator('.home .me-chip')).toContainText('מירב');
  await page.reload();
  await expect(page.locator('.home .me-chip')).toContainText('מירב');
});

test('home: every button leads to its screen and back', async ({ page }) => {
  await onboard(page);
  const cases = [['[data-go="/stats"]', '.stats'], ['.me-chip', '.settings'], ['.home-top [data-go="/settings"][aria-label="הגדרות"]', '.settings'], ['.home-actions [data-go="/modes"]', '.mode-card'], ['.home-actions [data-go="/campaign"]', '.campaign .lvl']];
  for (const [btn, screen] of cases) {
    await page.goto('./#/');
    await page.click(btn);
    await expect(page.locator(screen).first()).toBeVisible();
    await page.click('[data-back]');
    await expect(page.locator('.home')).toBeVisible();
  }
  // daily card + room sheet
  await page.click('.daily-card');
  await expect(page.locator('.pregame')).toBeVisible();
  await page.click('[data-x]');
  await page.click('[data-act="room"]');
  await expect(page.locator('.sheet')).toContainText('חדר עם חברים');
  await page.click('.sheet [data-act="join"]');
  await expect(page.locator('.join')).toBeVisible();
  await page.goto('./#/');
  await page.click('[data-act="room"]');
  await page.click('.sheet [data-act="create"]');
  await expect(page.locator('.lobby .code-big')).toHaveText(/^\d{4}$/, { timeout: 20_000 });
  await page.click('[data-back]');
  await page.click('.modal [data-close="ok"]');
  await expect(page.locator('.home')).toBeVisible();
});

for (const mode of ['race', 'clock', 'fewest', 'six', 'forbidden']) {
  test(`mode ${mode}: random pair via category + difficulty → pregame → play → arrive or give up → results → again`, async ({ page }) => {
    await onboard(page);
    await page.click('.home-actions [data-go="/modes"]');
    await page.click(`[data-mode="${mode}"]`);
    if (mode === 'clock') { await expect(page.locator('.time-opt')).toHaveCount(3); await page.click('[data-min="3"]'); }
    await expect(page.locator('.setup')).toBeVisible();
    await page.click('[data-cat="food"]');
    await expect(page.locator('[data-cat="food"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('[data-diff="easy"]');
    await page.click('#next');
    await expect(page.locator('.pregame')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.pg-rule')).toBeVisible();
    if (mode === 'forbidden') await expect(page.locator('.forbid-note')).toBeVisible();
    await page.click('#ready');
    await expect(page.locator('.play')).toBeVisible({ timeout: 15_000 });
    await waitArticle(page);
    const timed = mode === 'race' || mode === 'clock';
    await expect(page.locator('#hud-time')).toHaveText(timed ? /^\d\d:\d\d$/ : mode === 'six' ? '0/6' : '0');
    await giveUp(page);
    await expect(page.locator('.res-hero.lose')).toBeVisible({ timeout: 10_000 });
    await page.click('#again');
    await expect(page.locator('.pregame')).toBeVisible({ timeout: 30_000 });
  });
}

test('setup: custom pair with autocomplete, rules toggles respected in game', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/modes');
  await page.click('[data-mode="fewest"]');
  await page.click('.custom summary');
  await page.fill('#cs', 'חומ');
  await expect(page.locator('.ac-list li').first()).toHaveText('חומוס');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('#cs')).toHaveValue('חומוס');
  await page.fill('#ct', 'שוק');
  await page.locator('.ac-list li', { hasText: 'שוקולד' }).first().dispatchEvent('pointerdown');
  await expect(page.locator('#ct')).toHaveValue('שוקולד');
  await page.locator('[data-rule="allowFind"]').uncheck({ force: true });
  await page.locator('[data-rule="allowBack"]').uncheck({ force: true });
  // only one field → message
  await page.fill('#ct', '');
  await page.click('#next');
  await expect(page.locator('.toast').last()).toContainText('גם התחלה וגם יעד');
  await page.fill('#ct', 'שוקולד');
  await page.click('#next');
  await page.click('#ready');
  await waitArticle(page, 'חומוס');
  await expect(page.locator('#b-find')).toBeHidden();
  await expect(page.locator('#b-back')).toBeHidden();
  await page.keyboard.press('Control+f');
  await expect(page.locator('#findbar')).toBeHidden();
});

test('play: peek, article menu (open in Wikipedia + license), crumbs, find navigation, Alt+Left back', async ({ page }) => {
  let opened = null;
  await page.exposeFunction('__opened', (u) => { opened = u; });
  await page.addInitScript(() => { window.open = (u) => { window.__opened(u); return null; }; });
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'שוקולד' });
  await page.click('#peek');
  await expect(page.locator('.peek-title')).toHaveText('שוקולד');
  await expect(page.locator('.peek-text')).not.toBeEmpty();
  await page.click('.peek [data-close]');
  await page.click('#art-menu');
  await expect(page.locator('.sheet')).toContainText('CC BY-SA 4.0');
  await page.click('.sheet [data-act="wiki"]');
  await expect.poll(() => opened).toContain('he.wikipedia.org/wiki/');
  await page.keyboard.press('Control+f');
  await page.fill('#find-in', 'חומוס');
  await expect(page.locator('#find-count')).toHaveText(/^1\/\d+$/);
  await page.click('#find-next');
  await expect(page.locator('#find-count')).toHaveText(/^2\/\d+$/);
  await page.click('#find-prev');
  await expect(page.locator('#find-count')).toHaveText(/^1\/\d+$/);
  await page.press('#find-in', 'Escape');
  await expect(page.locator('#findbar')).toBeHidden();
  await clickLink(page, 'טחינה');
  await waitArticle(page, 'טחינה');
  await expect(page.locator('.crumb')).toHaveCount(2);
  await page.keyboard.press('Alt+ArrowRight');
  await waitArticle(page, 'חומוס');
  expect(await clicks(page)).toBe(2);
});

test('results: share sheet (WhatsApp + copy), home, history entry', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined }); window.open = () => null; });
  await onboard(page);
  await startCustom(page, { start: 'חומוס', target: 'טחינה' });
  await clickLink(page, 'טחינה');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
  await page.click('#share');
  await expect(page.locator('.share-pre')).toContainText('מ־חומוס אל טחינה');
  await page.click('.sheet [data-act="copy"]');
  await expect(page.locator('.toast').last()).toContainText('הועתק');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('מרוץ ויקי');
  await page.click('[data-go="/"]');
  await expect(page.locator('.home')).toBeVisible();
});

test('campaign: locked level/world messages, level → results → next level', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/campaign');
  await page.click('[data-lvl="1-2"]');
  await expect(page.locator('.toast')).toContainText('סיימו את השלב הקודם');
  await page.locator('[data-lvl="2-1"]').click({ force: true });
  await expect(page.locator('.toast').last()).toContainText('העולם הזה עוד נעול');
  await page.click('[data-lvl="1-1"]');
  await page.click('#ready');
  await waitArticle(page, 'חומוס');
  await clickLink(page, 'טחינה'); await waitArticle(page, 'טחינה');
  await clickLink(page, 'שוקולד');
  await expect(page.locator('.stars-big .on')).toHaveCount(3, { timeout: 15_000 });
  await page.click('#next');
  await expect(page.locator('.pregame')).toBeVisible();
});

test('daily: play, result with countdown; second visit shows the stored result; stats streak', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/daily');
  await page.click('#ready');
  await waitArticle(page, 'חומוס');
  await clickLink(page, 'טחינה'); await waitArticle(page, 'טחינה');
  await clickLink(page, 'שוקולד');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#cd')).toHaveText(/^\d\d:\d\d:\d\d$/);
  await page.goto('./#/');
  await expect(page.locator('#daily-ring')).toContainText('100%');
  await page.goto('./#/daily');
  await expect(page.locator('.res-hero.win')).toBeVisible();
  await page.goto('./#/stats');
  await expect(page.locator('.ring-tile').nth(1)).toContainText('1');
});

test('daily: missing day shows "not ready" state', async ({ page, context }) => {
  await context.route(/\/data\/daily\.json/, (r) => r.fulfill({ json: { version: 1, days: {} } }));
  await onboard(page);
  await expect(page.locator('#daily-pair')).toHaveText('בקרוב');
  await page.goto('./#/daily');
  await expect(page.locator('main')).toContainText('האתגר של היום עוד לא מוכן');
});

test('stats: empty states, then tabs with data and history detail', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/stats?tab=history');
  await expect(page.locator('#tab-body')).toContainText('עוד לא שיחקתם');
  await startCustom(page, { start: 'חומוס', target: 'טחינה' });
  await clickLink(page, 'טחינה');
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 10_000 });
  await page.goto('./#/stats');
  for (const tab of ['history', 'ach', 'stats']) {
    await page.click(`[data-tab="${tab}"]`);
    await expect(page.locator(`[data-tab="${tab}"]`)).toHaveClass(/on/);
  }
  await page.click('[data-tab="ach"]');
  await expect(page.locator('.ach.got')).not.toHaveCount(0);
});

test('settings: theme, sound, vibration, default rules, profile edit, what\'s new, about, export + import backup', async ({ page }) => {
  await onboard(page, 'מקורי');
  await page.goto('./#/settings');
  for (const t of ['dark', 'light', 'system']) {
    await page.click(`[data-theme="${t}"]`);
    if (t !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', t);
  }
  for (const k of ['sound', 'vibration', 'allowBack', 'allowFind']) await page.locator(`[data-set="${k}"]`).click({ force: true });
  await page.reload();
  for (const k of ['sound', 'vibration', 'allowBack', 'allowFind']) await expect(page.locator(`[data-set="${k}"]`)).not.toBeChecked();
  await page.click('#profile');
  await page.fill('.sheet #nick', 'x');
  await page.click('.sheet #save');
  await expect(page.locator('.toast').last()).toContainText('לפחות 2');
  await page.fill('.sheet #nick', 'חדש');
  await page.click('.sheet #save');
  await expect(page.locator('.profile-card')).toContainText('חדש');
  await page.click('#whatsnew');
  await expect(page.locator('.modal .changelog section')).not.toHaveCount(0);
  await page.click('.modal [data-close]');
  await page.click('#about');
  await expect(page.locator('.sheet')).toContainText('אין קשר לוויקימדיה');
  await page.click('.sheet .btn[data-close]');
  // export
  const dl = page.waitForEvent('download');
  await page.click('#export');
  const file = await dl;
  const data = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(data.app).toBe('merotz-wiki');
  expect(data.kv.profile.name).toBe('חדש');
  // import: invalid file
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.locator('.toast').last()).toContainText('לא תקין');
  // import: valid file
  data.kv.profile.name = 'משוחזר';
  await page.setInputFiles('#import-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await page.click('.modal [data-close="ok"]');
  await expect(page.locator('.profile-card')).toContainText('משוחזר');
  // import: right app but broken profile → refused, current data kept
  await page.setInputFiles('#import-file', { name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'merotz-wiki', kv: { profile: 5 } })) });
  await page.click('.modal [data-close="ok"]');
  await expect(page.locator('.toast').last()).toContainText('לא תקין');
  await expect(page.locator('.profile-card')).toContainText('משוחזר');
});

test('join screen: paste 4 digits, backspace navigation, invite link prefill', async ({ page }) => {
  await onboard(page);
  await page.goto('./#/join');
  await page.locator('.code-box[data-i="0"]').fill('9876');
  for (const [i, d] of [[0, '9'], [1, '8'], [2, '7'], [3, '6']]) await expect(page.locator(`.code-box[data-i="${i}"]`)).toHaveValue(d);
  await page.locator('.code-box[data-i="3"]').fill('');
  await page.locator('.code-box[data-i="3"]').press('Backspace');
  await expect(page.locator('.code-box[data-i="2"]')).toHaveValue('');
  await page.goto('./?room=4455');
  await expect(page.locator('.code-box[data-i="0"]')).toHaveValue('4');
  await expect(page).not.toHaveURL(/room=4455/);
});

test('room settings by host: mode + clock time + category/difficulty shown to guests', async ({ newPlayer }) => {
  const c = String(1000 + Math.floor(Math.random() * 9000));
  const A = await newPlayer('מארח'); await onboard(A.page, 'מארח');
  await A.page.goto(`./#/room?code=${c}&create=1`);
  await expect(A.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  const B = await newPlayer('אורח'); await onboard(B.page, 'אורח', { query: `room=${c}` }); await B.page.click('#join');
  await expect(B.page.locator('.slot.filled')).toHaveCount(2, { timeout: 20_000 });
  await A.page.click('#settings');
  await A.page.click('[data-mode="clock"]');
  await A.page.click('[data-min="5"]');
  await A.page.click('[data-cat="science"]');
  await A.page.click('[data-diff="hard"]');
  await A.page.click('#next');
  await expect(B.page.locator('.settings-card')).toContainText('נגד השעון · 5 דק׳');
  await expect(B.page.locator('.settings-card')).toContainText('מדע וטבע');
  await expect(B.page.locator('.settings-card')).toContainText('קשה');
  await A.page.click('#start');
  for (const p of [A, B]) await expect(p.page.locator('.pregame')).toBeVisible({ timeout: 30_000 });
  for (const p of [A, B]) await expect(p.page.locator('.play')).toBeVisible({ timeout: 30_000 });
  for (const p of [A, B]) await expect(p.page.locator('#hud-time')).toHaveText(/^0[45]:\d\d$/);
});

test('download page renders all platforms with the recommendation', async ({ page }) => {
  await page.goto('./download/');
  await expect(page.locator('.dl-item')).toHaveCount(4);
  await expect(page.locator('.dl-rec')).toHaveCount(1);
});
