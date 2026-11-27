// Unit tests for the Electron shell's own code (no Electron needed). Run: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const lib = require('../../desktop/lib.cjs');
const { createReporter, scrub, loadConfig } = require('../../desktop/crash-reporter.cjs');
const CFG = JSON.parse(readFileSync(new URL('../../config/crash-reporting.json', import.meta.url)));

test('isSiteUrl: only the game site stays in the window', () => {
  assert.equal(lib.isSiteUrl('https://israelb014.github.io/merotz-wiki/'), true);
  assert.equal(lib.isSiteUrl('https://israelb014.github.io/merotz-wiki/#/play'), true);
  assert.equal(lib.isSiteUrl('https://israelb014.github.io/merotz-wiki'), true);
  assert.equal(lib.isSiteUrl('https://israelb014.github.io/merotz-wiki-evil/'), false); // was true in 1.0.0
  assert.equal(lib.isSiteUrl('https://israelb014.github.io/other/'), false);
  assert.equal(lib.isSiteUrl('https://he.wikipedia.org/wiki/x'), false);
  assert.equal(lib.isSiteUrl('javascript:alert(1)'), false);
  assert.equal(lib.isSiteUrl('not a url'), false);
});

test('isExternalHttp: only http(s) URLs go to the system browser', () => {
  assert.equal(lib.isExternalHttp('https://wa.me/?text=x'), true);
  assert.equal(lib.isExternalHttp('file:///etc/passwd'), false);
  assert.equal(lib.isExternalHttp('javascript:alert(1)'), false);
  assert.equal(lib.isExternalHttp(undefined), false);
});

test('updateMode: auto update for exe/AppImage, banner for deb, none in dev', () => {
  assert.equal(lib.updateMode({ isPackaged: false, platform: 'win32' }), 'none');
  assert.equal(lib.updateMode({ isPackaged: true, platform: 'win32' }), 'auto');
  assert.equal(lib.updateMode({ isPackaged: true, platform: 'linux', appImage: '/tmp/x.AppImage' }), 'auto');
  assert.equal(lib.updateMode({ isPackaged: true, platform: 'linux' }), 'deb-banner');
});

test('desktop crash reporter reads the single config file', () => {
  assert.deepEqual(loadConfig(), CFG);
});

function fakeFetch(fail = () => false) {
  const calls = [];
  const fn = async (url, opts) => { if (fail()) throw new Error('offline'); calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; };
  fn.calls = calls;
  return fn;
}
const tmpStore = () => join(mkdtempSync(join(tmpdir(), 'mwcr-')), 'q.json');

test('reporter: payload has app, version, platform, message, stack, screen; scrubbed', async () => {
  const f = fakeFetch();
  const r = createReporter({ config: CFG, storeFile: tmpStore(), fetchFn: f, version: '1.0.1', platform: 'win32' });
  const e = new Error('failed at C:\\Users\\israel\\AppData room-1234 a@b.co');
  r.report(e, 'main');
  await r.flush();
  assert.equal(f.calls.length, 1);
  const b = f.calls[0].body;
  assert.equal(f.calls[0].url, 'https://ntfy.sh/');
  assert.equal(b.topic, CFG.topic);
  assert.match(b.title, /מרוץ ויקי 1\.0\.1 · desktop-win32/);
  assert.match(b.message, /מסך: main/);
  assert.doesNotMatch(JSON.stringify(b), /israel|1234|a@b\.co/);
});

test('reporter: at most 5 per hour, the rest waits in the queue', async () => {
  let t = 1_000_000;
  const f = fakeFetch();
  const store = tmpStore();
  const r = createReporter({ config: CFG, storeFile: store, fetchFn: f, now: () => t });
  for (let i = 0; i < 8; i++) { r.report(new Error(`e${i}`)); await r.flush(); }
  assert.equal(f.calls.length, 5);
  assert.equal(r._load().queue.length, 3);
  t += 3_600_001;
  await r.flush();
  assert.equal(f.calls.length, 8);
  assert.equal(r._load().queue.length, 0);
});

test('reporter: offline → queued, sent when the network is back; duplicates once', async () => {
  let offline = true;
  const f = fakeFetch(() => offline);
  const r = createReporter({ config: CFG, storeFile: tmpStore(), fetchFn: f });
  r.report(new Error('x')); r.report(new Error('x'));
  await r.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(r._load().queue.length, 1);
  offline = false;
  await r.flush();
  assert.equal(f.calls.length, 1);
});

test('reporter: disabled → never sends', async () => {
  const f = fakeFetch();
  const r = createReporter({ config: CFG, storeFile: tmpStore(), fetchFn: f, enabled: false });
  r.report(new Error('x')); await r.flush();
  assert.equal(f.calls.length, 0);
});

test('scrub removes home directories', () => {
  assert.equal(scrub('/home/dana/x and /Users/dan/y'), '/home/[user]/x and /Users/[user]/y');
});
