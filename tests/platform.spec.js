// Shell integration seen from the web app: update checks with a simulated Electron bridge, version compare.
import { test, expect } from './fixtures.js';
import { onboard } from './helpers.js';

const bridge = ({ isDeb, version, platform = 'linux' }) => `
  window.__calls = [];
  window.merotzDesktop = {
    platform: '${platform}', version: '${version}', isDeb: ${isDeb},
    openExternal: (u) => window.__calls.push(['open', u]),
    setTheme: (t) => window.__calls.push(['theme', t]),
    quitAndInstall: () => window.__calls.push(['install']),
    onUpdateStatus: (cb) => { window.__updateCb = cb; },
  };`;
const versionJson = (context, shell) => context.route(/version\.json/, (r) => r.fulfill({ json: { version: '1.0.1', content: '1.0.1', shell } }));

test('cmpVer orders versions (with or without "v")', async ({ page }) => {
  await page.goto('./');
  const r = await page.evaluate(async () => {
    const { cmpVer } = await import('/merotz-wiki/src/lib/platform.js');
    return [cmpVer('1.0.1', '1.0.0'), cmpVer('v1.0.0', '1.0.0'), cmpVer('1.0.0', '1.0.10'), cmpVer('2.0', '1.9.9'), cmpVer(null, '0.0.1')];
  });
  expect(r[0]).toBeGreaterThan(0); expect(r[1]).toBe(0); expect(r[2]).toBeLessThan(0); expect(r[3]).toBeGreaterThan(0); expect(r[4]).toBeLessThan(0);
});

test('Linux .deb shell: banner offers the new .deb when a newer shell version is released', async ({ page, context }) => {
  await versionJson(context, '1.0.1');
  await page.addInitScript(bridge({ isDeb: true, version: '1.0.0' }));
  await onboard(page);
  await expect(page.locator('.update-banner')).toContainText('גרסה 1.0.1', { timeout: 10_000 });
  await page.click('.update-banner .btn');
  expect(await page.evaluate(() => window.__calls.find((c) => c[0] === 'open')?.[1])).toMatch(/merotz-wiki\.deb$/);
  await page.click('.update-banner .icon-btn');
  await expect(page.locator('.update-banner')).toHaveCount(0);
  // theme changes are forwarded to the window background
  expect(await page.evaluate(() => window.__calls.some((c) => c[0] === 'theme'))).toBe(true);
});

test('Linux .deb shell: no banner when already up to date', async ({ page, context }) => {
  await versionJson(context, '1.0.1');
  await page.addInitScript(bridge({ isDeb: true, version: '1.0.1' }));
  await onboard(page);
  await page.waitForTimeout(3500);
  await expect(page.locator('.update-banner')).toHaveCount(0);
});

test('Windows / AppImage shell: "update downloaded" from electron-updater → restart banner → quitAndInstall', async ({ page, context }) => {
  await versionJson(context, '1.0.1');
  await page.addInitScript(bridge({ isDeb: false, version: '1.0.0', platform: 'win32' }));
  await onboard(page);
  await page.waitForFunction(() => !!window.__updateCb);
  await page.evaluate(() => window.__updateCb({ type: 'downloaded', version: '1.0.1' }));
  await expect(page.locator('.update-banner')).toContainText('עדכון 1.0.1 מוכן');
  await page.click('.update-banner .btn');
  expect(await page.evaluate(() => window.__calls.some((c) => c[0] === 'install'))).toBe(true);
  // the web app reports the desktop platform (used by crash reports)
  expect(await page.evaluate(async () => (await import('/merotz-wiki/src/lib/platform.js')).platformName())).toBe('desktop-win32');
});

test('desktop shell: download link is hidden inside the app; external links go through the bridge', async ({ page }) => {
  await page.addInitScript(bridge({ isDeb: false, version: '1.0.1', platform: 'win32' }));
  await onboard(page);
  await expect(page.locator('.home-foot .foot-link')).toHaveCount(0);
  await page.goto('./#/settings');
  await page.click('#about');
  await page.locator('.sheet [data-ext]').first().click();
  expect(await page.evaluate(() => window.__calls.find((c) => c[0] === 'open')?.[1])).toContain('wikipedia.org');
});
