import { test, expect } from '@playwright/test';
import { WebSocketServer } from 'ws';
import { onboard, waitArticle, clickLink } from './helpers.js';

// Dedicated relay (Supabase-like broadcast+presence) so we can inspect every message.
let wss; const PORT = 8788; const log = [];
test.beforeAll(() => {
  wss = new WebSocketServer({ port: PORT });
  const rooms = new Map();
  const pres = (room) => { const m = rooms.get(room); const list = [...m.values()]; for (const ws of m.keys()) ws.readyState === 1 && ws.send(JSON.stringify({ op: 'presence', list })); };
  wss.on('connection', (ws) => {
    let room = null;
    ws.on('message', (buf) => {
      const m = JSON.parse(buf);
      if (m.op === 'join') { room = m.room; if (!rooms.has(room)) rooms.set(room, new Map()); rooms.get(room).set(ws, m.meta); pres(room); }
      else if (m.op === 'track') { rooms.get(room).set(ws, m.meta); pres(room); }
      else if (m.op === 'msg') { log.push({ room, ...m.payload }); for (const o of rooms.get(room).keys()) if (o !== ws && o.readyState === 1) o.send(JSON.stringify({ op: 'msg', payload: m.payload })); }
    });
    ws.on('close', () => { if (room) { rooms.get(room).delete(ws); pres(room); } });
  });
});
test.afterAll(() => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }));

const RELAY = `ws://localhost:${PORT}`;
const code = () => String(1000 + Math.floor(Math.random() * 9000));

async function player(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  return { ctx, page, name };
}
async function host(browser, c, name = 'נועה') {
  const p = await player(browser, name);
  await onboard(p.page, name, { query: `relay=${RELAY}` });
  await p.page.goto(`./?relay=${RELAY}#/room?code=${c}&create=1`);
  await expect(p.page.locator('.lobby .code-big')).toHaveText(c);
  return p;
}
async function joiner(browser, c, name) {
  const p = await player(browser, name);
  await onboard(p.page, name, { query: `relay=${RELAY}&room=${c}` });
  await expect(p.page.locator('.join .code-box').first()).toHaveValue(c[0]);
  await p.page.click('#join');
  await expect(p.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  return p;
}
const filled = (p) => p.page.locator('.slot.filled');

test('3 players: lobby, host settings, synced start, live strip, results with routes', async ({ browser }) => {
  const c = code();
  const A = await host(browser, c, 'נועה');
  const B = await joiner(browser, c, 'איתי');
  const C = await joiner(browser, c, 'מאיה');
  for (const p of [A, B, C]) await expect(filled(p)).toHaveCount(3);
  await expect(A.page.locator('.slot.filled').first()).toContainText('נועה');
  await expect(B.page.locator('#start')).toHaveCount(0); // only host can start

  // host changes settings: fewest clicks + custom pair
  await A.page.click('#settings');
  await A.page.click('[data-mode="fewest"]');
  await A.page.click('.custom summary');
  await A.page.fill('#cs', 'חומוס');
  await A.page.fill('#ct', 'טחינה');
  await A.page.click('#next');
  await expect(A.page.locator('.settings-card')).toContainText('חומוס ← טחינה');
  await expect(B.page.locator('.settings-card')).toContainText('הכי מעט קליקים');

  await A.page.click('#start');
  for (const p of [A, B, C]) await expect(p.page.locator('.pregame')).toBeVisible({ timeout: 20_000 });
  for (const p of [A, B, C]) { await expect(p.page.locator('.play')).toBeVisible({ timeout: 20_000 }); await waitArticle(p.page, 'חומוס'); }
  await expect(A.page.locator('#strip .ps')).toHaveCount(3);

  // B arrives (1 click); A and C give up
  await clickLink(B.page, 'טחינה');
  await expect(B.page.locator('.end-flash.win')).toBeVisible();
  await expect(A.page.locator('#strip .pb.ok')).toHaveCount(1, { timeout: 10_000 });
  for (const p of [A, C]) { await p.page.click('#b-quit'); await p.page.click('.modal [data-close="ok"]'); }

  for (const p of [A, B, C]) {
    await expect(p.page.locator('.podium .pod-1')).toContainText('איתי', { timeout: 20_000 });
    await expect(p.page.locator('.route-row')).toHaveCount(3);
  }
  // full routes revealed only on results
  await expect(A.page.locator('.route-row.best')).toContainText('איתי');
  await expect(A.page.locator('.best-banner')).toContainText('חומוס ← טחינה');
  await expect(C.page.locator('.route-row .rl-n em').filter({ hasText: 'טחינה' }).first()).toBeVisible();

  // privacy: progress messages never contain article titles; routes are sent only after results
  const prog = log.filter((m) => m.room === c && m.type === 'progress');
  expect(prog.length).toBeGreaterThan(3);
  for (const m of prog) expect(Object.keys(m).filter((k) => k !== 'room').sort()).toEqual(['clicks', 'elapsed', 'from', 'roundId', 'status', 'type'].sort());
  const firstRoute = log.findIndex((m) => m.room === c && m.type === 'route');
  const resultsIdx = log.findIndex((m) => m.room === c && m.type === 'state' && m.state.phase === 'results');
  expect(firstRoute).toBeGreaterThan(resultsIdx);

  // another round: host only
  await expect(B.page.locator('button:has-text("ממתינים למארח")')).toBeVisible();
  await A.page.click('#again');
  for (const p of [A, B, C]) await expect(p.page.locator('.pregame')).toBeVisible({ timeout: 20_000 });
  for (const p of [A, B, C]) await p.ctx.close();
});

test('host migration: when the host leaves, the oldest remaining player becomes host', async ({ browser }) => {
  const c = code();
  const A = await host(browser, c, 'מארח');
  const B = await joiner(browser, c, 'שני');
  const C = await joiner(browser, c, 'שלישי');
  await expect(filled(C)).toHaveCount(3);
  await A.ctx.close();
  await expect(filled(B)).toHaveCount(2, { timeout: 15_000 });
  await expect(B.page.locator('#start')).toBeVisible({ timeout: 15_000 });
  await expect(B.page.locator('.slot.filled').first()).toContainText('שני');
  await expect(B.page.locator('.slot.filled').first().locator('.ic').first()).toBeVisible(); // crown
  await expect(C.page.locator('#start')).toHaveCount(0);
  await expect(C.page.locator('button:has-text("ממתינים שהמארח יתחיל")')).toBeVisible();
  await B.ctx.close(); await C.ctx.close();
});

test('room full: a 6th player sees "החדר מלא"', async ({ browser }) => {
  const c = code();
  const ps = [await host(browser, c, 'אחד')];
  for (const n of ['שתיים', 'שלוש', 'ארבע', 'חמש']) ps.push(await joiner(browser, c, n));
  await expect(filled(ps[0])).toHaveCount(5);
  const six = await player(browser, 'שש');
  await onboard(six.page, 'שש', { query: `relay=${RELAY}&room=${c}` });
  await six.page.click('#join');
  await expect(six.page.locator('.room-error')).toContainText('החדר מלא', { timeout: 20_000 });
  await expect(filled(ps[0])).toHaveCount(5);
  for (const p of [...ps, six]) await p.ctx.close();
});

test('reconnect within 60s resumes the same player; late joiner waits for next round', async ({ browser }) => {
  const c = code();
  const A = await host(browser, c, 'מארחת');
  const B = await joiner(browser, c, 'חוזר');
  await expect(filled(A)).toHaveCount(2);
  const idBefore = await B.page.evaluate(() => JSON.parse(localStorage.getItem('mw-room-session')).id);
  await B.page.reload();
  await expect(B.page.locator('.lobby .code-big')).toHaveText(c, { timeout: 20_000 });
  const idAfter = await B.page.evaluate(() => JSON.parse(localStorage.getItem('mw-room-session')).id);
  expect(idAfter).toBe(idBefore);
  await expect(filled(A)).toHaveCount(2);
  await expect(B.page.locator('.slot.filled').nth(1)).toContainText('חוזר');

  // start a round, then a late joiner arrives
  await A.page.click('#settings');
  await A.page.click('[data-mode="fewest"]');
  await A.page.click('.custom summary');
  await A.page.fill('#cs', 'חומוס'); await A.page.fill('#ct', 'שומשום');
  await A.page.click('#next');
  await A.page.click('#start');
  await expect(A.page.locator('.play')).toBeVisible({ timeout: 20_000 });
  const L = await joiner(browser, c, 'מאחר');
  await expect(L.page.locator('.banner')).toContainText('סיבוב בעיצומו');
  await expect(L.page.locator('.play')).toHaveCount(0);
  for (const p of [A, B, L]) await p.ctx.close();
});
