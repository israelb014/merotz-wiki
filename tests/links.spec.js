import { test, expect } from '@playwright/test';
import { onboard, startCustom, clicks } from './helpers.js';

// Synthetic start article to test link rules deterministically (real API still resolves titles).
const HTML = `<!DOCTYPE html><html><head><style>.x{}</style></head><body>
<section data-mw-section-id="0">
<p id="lead">ערך בדיקה עם <a rel="mw:WikiLink" href="./טחינה" title="טחינה">טחינה</a>,
הפניה: <a rel="mw:WikiLink" href="./ארה&quot;ב" title='ארה"ב' class="mw-redirect">ארה"ב</a>,
קישור אדום: <a rel="mw:WikiLink" href="./ערך_שלא_קיים_בכלל_12345?action=edit&amp;redlink=1" title="ערך שלא קיים בכלל 12345" class="new">אדום</a>,
קטגוריה: <a rel="mw:WikiLink" href="./קטגוריה:מאכלים" title="קטגוריה:מאכלים">קטגוריה</a>,
תבנית: <a rel="mw:WikiLink" href="./תבנית:מאכלים" title="תבנית:מאכלים">תבנית</a>,
ויקיפדיה: <a rel="mw:WikiLink" href="./ויקיפדיה:עזרה" title="ויקיפדיה:עזרה">ויקיפדיה</a>,
משתמש: <a rel="mw:WikiLink" href="./משתמש:בודק" title="משתמש:בודק">משתמש</a>,
פורטל: <a rel="mw:WikiLink" href="./פורטל:מזון" title="פורטל:מזון">פורטל</a>,
עזרה: <a rel="mw:WikiLink" href="./עזרה:תוכן" title="עזרה:תוכן">עזרה</a>,
שיחה: <a rel="mw:WikiLink" href="./שיחה:חומוס" title="שיחה:חומוס">שיחה</a>,
מיוחד: <a rel="mw:WikiLink" href="./מיוחד:חיפוש" title="מיוחד:חיפוש">מיוחד</a>,
בינוויקי: <a rel="mw:WikiLink/Interwiki" href="https://en.wikipedia.org/wiki/Hummus" title="en:Hummus">אנגלית</a>,
חיצוני: <a rel="mw:ExtLink" href="https://example.com" class="external">חיצוני</a>,
עוגן: <a href="#סעיף_בדיקה" class="anchor-test">לסעיף</a>.
<sup class="mw-ref reference" typeof="mw:Extension/ref"><a href="./ירושלים" rel="mw:WikiLink" title="ירושלים">[1]</a></sup></p>
<figure typeof="mw:File/Thumb"><a href="./קובץ:Hummus.jpg" class="mw-file-description"><img src="//upload.wikimedia.org/x.jpg" width="10" height="10"></a><figcaption>תמונה</figcaption></figure>
</section>
<section data-mw-section-id="1"><h2 id="סעיף_בדיקה">סעיף בדיקה</h2><p>${'טקסט ארוך. '.repeat(400)}</p></section>
<section data-mw-section-id="2"><h2 id="הערות_שוליים">הערות שוליים</h2><p><a rel="mw:WikiLink" href="./ירושלים" title="ירושלים">ירושלים</a></p></section>
<section data-mw-section-id="3"><h2 id="קישורים_חיצוניים">קישורים חיצוניים</h2><ul><li><a rel="mw:WikiLink" href="./מצרים" title="מצרים">מצרים</a></li></ul></section>
</body></html>`;

test('link rules: only main-namespace links playable, disabled links inert, anchors free, redirects canonicalized', async ({ page }) => {
  await page.route(/api\/rest_v1\/page\/html\/(%D7%97%D7%95%D7%9E%D7%95%D7%A1|חומוס)/, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
  await onboard(page);
  // target typed as a redirect – must be canonicalized at game creation
  await startCustom(page, { mode: 'fewest', start: 'חומוס', target: 'ארה"ב' });
  await expect(page.locator('.target-pill b')).toHaveText('ארצות הברית');

  const wl = await page.$$eval('#art-body a.wl', (a) => a.map((x) => x.dataset.t));
  expect(wl.sort()).toEqual(['ארה"ב', 'טחינה'].sort());
  const dead = await page.$$eval('#art-body .dead', (a) => a.map((x) => x.textContent));
  for (const t of ['אדום', 'קטגוריה', 'תבנית', 'ויקיפדיה', 'משתמש', 'פורטל', 'עזרה', 'שיחה', 'מיוחד', 'אנגלית', 'חיצוני']) expect(dead).toContain(t);
  // references, reference sections and external-links sections are removed
  await expect(page.locator('#art-body')).not.toContainText('הערות שוליים');
  await expect(page.locator('#art-body')).not.toContainText('קישורים חיצוניים');
  await expect(page.locator('#art-body sup.reference')).toHaveCount(0);
  // images kept, lazy, https
  const img = page.locator('#art-body img').first();
  await expect(img).toHaveAttribute('loading', 'lazy');
  await expect(img).toHaveAttribute('src', /^https:\/\//);

  // dead links do nothing
  await page.locator('#art-body .dead', { hasText: 'אדום' }).click();
  await page.locator('#art-body .dead', { hasText: 'קטגוריה' }).click();
  await page.waitForTimeout(500);
  expect(await clicks(page)).toBe(0);
  await expect(page.locator('#art-title')).toHaveText('חומוס');

  // same-page anchor scrolls without counting
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('#art-body a.anchor').click();
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 200);
  expect(await clicks(page)).toBe(0);

  // clicking a redirect link resolves to the canonical title → arrival
  await page.locator('#art-body a.wl[data-t=\'ארה"ב\']').scrollIntoViewIfNeeded();
  await page.locator('#art-body a.wl[data-t=\'ארה"ב\']').click();
  await expect(page.locator('.res-hero.win')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.rv li').last()).toContainText('ארצות הברית');
});

test('title resolution follows redirects and rejects missing pages', async ({ page }) => {
  await page.goto('./');
  const r = await page.evaluate(async () => {
    const m = await import('/merotz-wiki/src/lib/wiki.js');
    return m.resolveTitles(['ארה"ב', 'תל אביב', 'בריטניה', 'ערך_שלא_קיים_בכלל_98765', 'קטגוריה:מאכלים']);
  });
  expect(r['ארה"ב']).toBe('ארצות הברית');
  expect(r['תל אביב']).toBe('תל אביב-יפו');
  expect(r['בריטניה']).toBe('הממלכה המאוחדת');
  expect(r['ערך_שלא_קיים_בכלל_98765']).toBeNull();
  expect(r['קטגוריה:מאכלים']).toBeNull();
});
