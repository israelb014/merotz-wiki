import { test, expect } from '@playwright/test';
import { onboard, waitArticle, clickLink } from './helpers.js';

// Real multiplayer over Supabase Realtime (no relay). Run with SUPABASE_E2E=1 (optionally BASE_URL=live site).
test.skip(!process.env.SUPABASE_E2E, 'set SUPABASE_E2E=1 to run against the real Supabase project');

test('real room over Supabase Realtime: join, start, arrive, results', async ({ browser }) => {
  const c = String(1000 + Math.floor(Math.random() * 9000));
  const mk = async (name) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' }); return { ctx, page: await ctx.newPage() }; };
  const A = await mk('מארח'), B = await mk('אורח');
  await onboard(A.page, 'מארח');
  await A.page.goto(`./#/room?code=${c}&create=1`);
  await expect(A.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 30_000 });
  await expect(A.page.locator('.code-card')).not.toContainText('מצב בדיקה מקומי');
  await onboard(B.page, 'אורח', { query: `room=${c}` });
  await B.page.click('#join');
  await expect(B.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 30_000 });
  for (const p of [A, B]) await expect(p.page.locator('.slot.filled')).toHaveCount(2, { timeout: 20_000 });
  await A.page.click('#settings');
  await A.page.click('[data-mode="fewest"]');
  await A.page.click('.custom summary');
  await A.page.fill('#cs', 'חומוס'); await A.page.fill('#ct', 'טחינה');
  await A.page.click('#next');
  await expect(B.page.locator('.settings-card')).toContainText('חומוס ← טחינה', { timeout: 15_000 });
  await A.page.click('#start');
  for (const p of [A, B]) { await expect(p.page.locator('.play')).toBeVisible({ timeout: 30_000 }); await waitArticle(p.page, 'חומוס'); }
  await clickLink(B.page, 'טחינה');
  await expect(A.page.locator('#strip .pb.ok')).toHaveCount(1, { timeout: 15_000 });
  await A.page.click('#b-quit'); await A.page.click('.modal [data-close="ok"]');
  for (const p of [A, B]) {
    await expect(p.page.locator('.podium .pod-1')).toContainText('אורח', { timeout: 30_000 });
    await expect(p.page.locator('.route-row')).toHaveCount(2);
  }
  await expect(A.page.locator('.best-banner')).toContainText('חומוס ← טחינה', { timeout: 15_000 });
  await A.ctx.close(); await B.ctx.close();
});
