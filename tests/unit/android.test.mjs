// Static checks of the Android shell: permissions, version code, crash config wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

test('Android permissions: only INTERNET and VIBRATE (no runtime/dangerous permissions)', () => {
  const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(perms, ['android.permission.INTERNET', 'android.permission.VIBRATE']);
});

test('App Links: invite links open the app, only on the game path', () => {
  assert.match(manifest, /android:autoVerify="true"/);
  assert.match(manifest, /android:host="israelb014\.github\.io" android:pathPrefix="\/merotz-wiki"/);
});

test('versionCode grows with the version (auto-update / APK install over the old one)', () => {
  const code = (v) => { const p = v.split('.').map(Number); return p[0] * 10000 + p[1] * 100 + p[2]; };
  assert.match(gradle, /vParts\[0\] \* 10000 \+ vParts\[1\] \* 100 \+ vParts\[2\]/);
  assert.ok(code('1.0.1') > code('1.0.0'));
});

test('crash reporting topic comes from config/crash-reporting.json (BuildConfig)', () => {
  assert.match(gradle, /config\/crash-reporting\.json/);
  assert.match(gradle, /buildConfigField "String", "NTFY_TOPIC"/);
});
