// Multiplayer over the real production transport (supabase-js + SupaTransport) talking to the in-process
// Supabase Realtime mock (tests/mocks/supabase-mock.js). Each player is a separate browser context.
import { test, expect } from './fixtures.js';
import { onboard, waitArticle, clickLink, giveUp } from './helpers.js';

test.describe.configure({ mode: 'parallel' });
const code = () => String(1000 + Math.floor(Math.random() * 9000));
const filled = (p) => p.page.locator('.slot.filled');

async function host(newPlayer, c, name = 'נועה') {
  const p = await newPlayer(name);
  await onboard(p.page, name);
  await p.page.goto(`./#/room?code=${c}&create=1`);
  await expect(p.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  await expect(p.page.locator('.code-card')).not.toContainText('מצב בדיקה מקומי');
  return p;
}
async function joiner(newPlayer, c, name) {
  const p = await newPlayer(name);
  await onboard(p.page, name, { query: `room=${c}` });
  await expect(p.page.locator('.join .code-box').first()).toHaveValue(c[0]);
  await p.page.click('#join');
  await expect(p.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  return p;
}
async function setPair(H, start, target, mode = 'fewest') {
  await H.page.click('#settings');
  await H.page.click(`[data-mode="${mode}"]`);
  if (mode === 'clock') await H.page.click('[data-min="2"]');
  await H.page.click('.custom summary');
  await H.page.fill('#cs', start); await H.page.fill('#ct', target);
  await H.page.click('#next');
  await expect(H.page.locator('.settings-card')).toContainText(`${start} ← ${target}`);
}
async function startAndPlay(H, all, start) {
  await H.page.click('#start');
  for (const p of all) { await expect(p.page.locator('.play')).toBeVisible({ timeout: 30_000 }); await waitArticle(p.page, start); }
}

test('5 players: full round, live strip, podium and routes; privacy of progress messages', async ({ newPlayer, hub }) => {
  const c = code();
  const A = await host(newPlayer, c, 'אחת');
  const others = [];
  for (const n of ['שתיים', 'שלוש', 'ארבע', 'חמש']) others.push(await joiner(newPlayer, c, n));
  const all = [A, ...others];
  for (const p of all) await expect(filled(p)).toHaveCount(5);
  expect(hub.presence(`room-${c}`)).toHaveLength(5);
  await setPair(A, 'חומוס', 'שוקולד');
  for (const p of others) await expect(p.page.locator('.settings-card')).toContainText('חומוס ← שוקולד');
  await startAndPlay(A, all, 'חומוס');
  await expect(A.page.locator('#strip .ps')).toHaveCount(5);
  // everyone moves to טחינה; players 2..5 arrive, A gives up
  for (const p of others) { await clickLink(p.page, 'טחינה'); await waitArticle(p.page, 'טחינה'); }
  for (const p of others) await clickLink(p.page, 'שוקולד');
  await expect(A.page.locator('#strip .pb.ok')).toHaveCount(4, { timeout: 15_000 });
  await giveUp(A.page);
  for (const p of all) {
    await expect(p.page.locator('.podium .pod-1')).toBeVisible({ timeout: 20_000 });
    await expect(p.page.locator('.route-row')).toHaveCount(5);
  }
  await expect(A.page.locator('.route-row').last()).toContainText('אחת');
  const prog = hub.log.filter((m) => m.topic === `realtime:room-${c}` && m.payload?.type === 'progress');
  expect(prog.length).toBeGreaterThan(5);
  for (const m of prog) expect(Object.keys(m.payload).sort()).toEqual(['clicks', 'elapsed', 'from', 'roundId', 'status', 'type']);
  // stats: five_players achievement for everyone
  await others[0].page.goto('./#/stats?tab=ach');
  await expect(others[0].page.locator('.ach.got')).toContainText(['בית מלא']);
});

test('a 6th player is refused with "החדר מלא" and does not disturb the room', async ({ newPlayer, hub }) => {
  const c = code();
  const ps = [await host(newPlayer, c, 'אחד')];
  for (const n of ['שתיים', 'שלוש', 'ארבע', 'חמש']) ps.push(await joiner(newPlayer, c, n));
  await expect(filled(ps[0])).toHaveCount(5);
  const six = await newPlayer('שש');
  await onboard(six.page, 'שש', { query: `room=${c}` });
  await six.page.click('#join');
  await expect(six.page.locator('.room-error')).toContainText('החדר מלא', { timeout: 20_000 });
  await expect(filled(ps[0])).toHaveCount(5);
  await expect.poll(() => hub.presence(`room-${c}`).length, { timeout: 10_000 }).toBe(5);
});

test('disconnect + reconnect (reload) within 60s keeps the same player; mid-game reload resumes the game', async ({ newPlayer }) => {
  const c = code();
  const A = await host(newPlayer, c, 'מארחת');
  const B = await joiner(newPlayer, c, 'חוזר');
  await expect(filled(A)).toHaveCount(2);
  const id = await B.page.evaluate(() => JSON.parse(localStorage.getItem('mw-room-session')).id);
  await B.page.reload();
  await expect(B.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  expect(await B.page.evaluate(() => JSON.parse(localStorage.getItem('mw-room-session')).id)).toBe(id);
  await expect(filled(A)).toHaveCount(2);
  await setPair(A, 'חומוס', 'שוקולד');
  await startAndPlay(A, [A, B], 'חומוס');
  await clickLink(B.page, 'טחינה'); await waitArticle(B.page, 'טחינה');
  await B.page.reload();
  await expect(B.page.locator('.play')).toBeVisible({ timeout: 30_000 });
  await waitArticle(B.page, 'טחינה');
  await expect(B.page.locator('#clicks b')).toHaveText('1');
  await clickLink(B.page, 'שוקולד');
  await giveUp(A.page);
  for (const p of [A, B]) await expect(p.page.locator('.podium .pod-1')).toContainText('חוזר', { timeout: 20_000 });
});

test('host leaves in the middle of a round: new host takes over and the round ends without waiting', async ({ newPlayer }) => {
  const c = code();
  const A = await host(newPlayer, c, 'מארח');
  const B = await joiner(newPlayer, c, 'בת');
  const C = await joiner(newPlayer, c, 'גל');
  await setPair(A, 'חומוס', 'שוקולד');
  await startAndPlay(A, [A, B, C], 'חומוס');
  // host exits the room explicitly (X on the game? → quit then leave from results). Simulate closing the app.
  await A.page.evaluate(async () => { const { ctx } = await import('/merotz-wiki/src/app.js'); await ctx.room.leave(); });
  await A.context.close();
  await expect(B.page.locator('.toast')).toContainText(/המארח/, { timeout: 15_000 });
  await clickLink(B.page, 'טחינה'); await waitArticle(B.page, 'טחינה'); await clickLink(B.page, 'שוקולד');
  await giveUp(C.page);
  for (const p of [B, C]) {
    await expect(p.page.locator('.podium .pod-1')).toContainText('בת', { timeout: 15_000 });
    await expect(p.page.locator('.route-row')).toHaveCount(3);
  }
  await expect(B.page.locator('.route-row').filter({ hasText: 'מארח' })).toContainText('התנתק');
  await expect(B.page.locator('#again')).toBeVisible();
});

test('two players reach the target in the same second: deterministic ranking, both finished', async ({ newPlayer }) => {
  const c = code();
  const A = await host(newPlayer, c, 'ראשון');
  const B = await joiner(newPlayer, c, 'שנייה');
  await setPair(A, 'חומוס', 'טחינה', 'race');
  await startAndPlay(A, [A, B], 'חומוס');
  await Promise.all([clickLink(A.page, 'טחינה'), clickLink(B.page, 'טחינה')]);
  for (const p of [A, B]) await expect(p.page.locator('.podium .pod-2')).toBeVisible({ timeout: 20_000 });
  const names = [];
  for (const p of [A, B]) names.push([await p.page.locator('.podium .pod-1 .pod-name').textContent(), await p.page.locator('.podium .pod-2 .pod-name').textContent()]);
  expect(names[0]).toEqual(names[1]); // same ranking on both devices
  await expect(A.page.locator('.route-row .muted')).toHaveText([/קליק אחד/, /קליק אחד/]);
});

test('wrong / stale room code: "החדר לא נמצא"; back to join works', async ({ newPlayer }) => {
  const c = code();
  // stale: a room that existed and was left
  const A = await host(newPlayer, c, 'היה');
  await A.page.click('[data-back]'); await A.page.click('.modal [data-close="ok"]');
  await expect(A.page.locator('.home')).toBeVisible();
  const B = await newPlayer('מחפש');
  await onboard(B.page, 'מחפש', { query: `room=${c}` });
  await B.page.click('#join');
  await expect(B.page.locator('.room-error')).toContainText('החדר לא נמצא', { timeout: 20_000 });
  await B.page.click('.room-error [data-go="/join"]');
  await expect(B.page.locator('.join')).toBeVisible();
  // malformed codes never reach the network
  await B.page.goto('./#/room?code=12a4');
  await expect(B.page.locator('.home')).toBeVisible();
  await B.page.goto('./#/join');
  await B.page.fill('.code-box[data-i="0"]', '1');
  await B.page.click('#join');
  await expect(B.page.locator('.toast').last()).toContainText('4 ספרות');
});

test('duplicate player names are both shown and ranked separately', async ({ newPlayer }) => {
  const c = code();
  const A = await host(newPlayer, c, 'דני');
  const B = await joiner(newPlayer, c, 'דני');
  await expect(filled(A)).toHaveCount(2);
  await expect(filled(A)).toHaveText([/דני/, /דני/]);
  await setPair(A, 'חומוס', 'טחינה');
  await startAndPlay(A, [A, B], 'חומוס');
  await clickLink(B.page, 'טחינה');
  await giveUp(A.page);
  for (const p of [A, B]) await expect(p.page.locator('.route-row')).toHaveCount(2, { timeout: 20_000 });
  await expect(B.page.locator('.route-row.best')).toBeVisible();
});

test('a player loses network mid-game, comes back, and is still part of the round', async ({ newPlayer, hub }) => {
  const c = code();
  const A = await host(newPlayer, c, 'יציב');
  const B = await joiner(newPlayer, c, 'נופל');
  await setPair(A, 'חומוס', 'שוקולד');
  await startAndPlay(A, [A, B], 'חומוס');
  await B.setOffline(true);
  await expect(A.page.locator('#strip .ps.absent')).toHaveCount(1, { timeout: 15_000 });
  await B.page.waitForTimeout(3000);
  await B.setOffline(false);
  await expect(A.page.locator('#strip .ps.absent')).toHaveCount(0, { timeout: 30_000 });
  await clickLink(B.page, 'טחינה'); await waitArticle(B.page, 'טחינה'); await clickLink(B.page, 'שוקולד');
  await giveUp(A.page);
  for (const p of [A, B]) await expect(p.page.locator('.podium .pod-1')).toContainText('נופל', { timeout: 30_000 });
});

test('timed room (clock): host-side timeout ends the round for everyone', async ({ newPlayer }) => {
  const c = code();
  const A = await host(newPlayer, c, 'שעון');
  const B = await joiner(newPlayer, c, 'מחוג');
  for (const p of [A, B]) await p.page.clock.install();
  await setPair(A, 'חומוס', 'שוקולד', 'clock');
  await startAndPlay(A, [A, B], 'חומוס');
  for (const p of [A, B]) await p.page.clock.fastForward('02:05');
  for (const p of [A, B]) await p.page.clock.runFor(4000);
  for (const p of [A, B]) await expect(p.page.locator('.route-row')).toHaveCount(2, { timeout: 30_000 });
  await expect(A.page.locator('.route-row').first()).toContainText('נגמר הזמן');
});
