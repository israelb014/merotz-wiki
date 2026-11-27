import { expect } from '@playwright/test';

export async function onboard(page, name = 'בודק', { query = '' } = {}) {
  await page.goto(query ? `./?${query}` : './');
  await page.fill('#nick', name);
  await page.click('#go');
  await expect(page.locator('.home, .join, .lobby').first()).toBeVisible();
}

/** Start a solo game with a custom pair. */
export async function startCustom(page, { mode = 'fewest', start, target, minutes, allowBack = true }) {
  await page.goto('./#/modes');
  await page.click(`[data-mode="${mode}"]`);
  if (mode === 'clock') await page.click(`[data-min="${minutes || 2}"]`);
  await page.click('.custom summary');
  await page.fill('#cs', start);
  await page.fill('#ct', target);
  if (!allowBack) await page.locator('[data-rule="allowBack"]').uncheck({ force: true });
  await page.click('#next');
  await expect(page.locator('.pregame')).toBeVisible({ timeout: 30_000 });
  await page.click('#ready');
  await expect(page.locator('.play')).toBeVisible({ timeout: 15_000 });
  await waitArticle(page);
}

export async function waitArticle(page, title) {
  if (title) await expect(page.locator('#art-title')).toHaveText(title, { timeout: 30_000 });
  await expect(page.locator('#art-body')).not.toHaveClass(/loading/, { timeout: 30_000 });
  await expect(page.locator('#art-body .art-skel')).toHaveCount(0);
}

export async function clickLink(page, title) {
  const a = page.locator(`#art-body a.wl[data-t="${title.replace(/["\\]/g, '\\$&')}"]`).first();
  await a.scrollIntoViewIfNeeded();
  await a.click();
}

/** Click any playable link that is not the target/forbidden/current; returns its title. */
export async function clickAnyLink(page, avoid = []) {
  const t = await page.evaluate((avoid) => {
    const cur = document.querySelector('#art-title').textContent;
    const links = [...document.querySelectorAll('#art-body a.wl')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && !avoid.includes(a.dataset.t) && a.dataset.t !== cur && !a.closest('details:not([open])') && !/\d{3,4}|^\d/.test(a.dataset.t);
    });
    const a = links[Math.min(links.length - 1, 3)];
    document.querySelectorAll('[data-pick]').forEach((x) => x.removeAttribute('data-pick'));
    a.setAttribute('data-pick', '1');
    a.scrollIntoView({ block: 'center' });
    return a.dataset.t;
  }, avoid);
  await page.locator('#art-body a.wl[data-pick]').first().click();
  return t;
}

export async function clicks(page) {
  return Number(await page.locator('#clicks b').textContent());
}

/** Give up the current game via the quit button + confirm dialog. */
export async function giveUp(page) {
  await page.click('#b-quit');
  await page.click('.modal [data-close="ok"]');
}
