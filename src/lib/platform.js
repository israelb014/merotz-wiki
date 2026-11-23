// Platform integration: Android (Capacitor shell loading the live site) and desktop (Electron shell).
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ASSET, RELEASES_URL } from '../config.js';
import { openOverlay } from './ui.js';
import { icon } from './icons.js';

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const desktop = () => window.merotzDesktop || null;
export const platformName = () => (isAndroid() ? 'android' : desktop() ? `desktop-${desktop().platform}` : 'web');

export function cmpVer(a, b) {
  const pa = String(a || '0').replace(/^v/, '').split('.').map(Number);
  const pb = String(b || '0').replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

export async function fetchVersion() {
  const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  return r.json();
}

export async function shellVersion() {
  if (isNative()) { try { return (await App.getInfo()).version; } catch { return null; } }
  if (desktop()) return desktop().version;
  return null;
}

/** Hardware back button (Android). handler() returns true if handled. */
export function initBackButton(handler) {
  if (!isNative()) return;
  App.addListener('backButton', () => { if (!handler()) App.exitApp(); });
}

/** Deep links: https://israelb014.github.io/merotz-wiki/?room=1234 */
export function initDeepLinks(onRoom) {
  const parse = (url) => { try { const u = new URL(url); const c = u.searchParams.get('room'); if (c && /^\d{4}$/.test(c)) onRoom(c); } catch {} };
  if (!isNative()) return;
  App.addListener('appUrlOpen', ({ url }) => parse(url));
  App.getLaunchUrl().then((r) => r?.url && parse(r.url)).catch(() => {});
}

export function openExternal(url) {
  if (desktop()?.openExternal) return desktop().openExternal(url);
  if (isNative()) { location.href = url; return; } // non-app URLs open in the system browser
  window.open(url, '_blank', 'noopener');
}

/** Shell update checks (Android APK dialog / .deb banner). */
export async function checkShellUpdates() {
  try {
    const cur = await shellVersion();
    if (!cur) return;
    const v = await fetchVersion();
    const latest = v.shell;
    if (!latest || cmpVer(latest, cur) <= 0) return;
    if (isAndroid()) {
      const key = `mw-skip-apk-${latest}`;
      if (sessionStorage.getItem(key)) return;
      const o = openOverlay(`
        <div class="center stack">
          <div class="upd-ic">${icon('download', { size: 34 })}</div>
          <h2 class="h-lg">גרסה חדשה זמינה</h2>
          <p class="muted" style="margin:0">גרסה ${latest} של האפליקציה מוכנה להורדה (יש לך ${cur}). המשחק עצמו כבר מעודכן – זה עדכון למעטפת האפליקציה.</p>
          <button class="btn primary" data-act="dl">${icon('download')} הורדה והתקנה</button>
          <button class="btn" data-close>אחר כך</button>
        </div>`, { type: 'modal' });
      o.node.querySelector('[data-act="dl"]').onclick = () => { o.close(); openExternal(ASSET.apk); };
      o.done.then(() => sessionStorage.setItem(key, '1'));
    } else if (desktop()?.isDeb) {
      showBanner(`גרסה ${latest} של מרוץ ויקי זמינה`, 'הורדה', ASSET.deb);
    }
  } catch (e) { console.warn('update check failed', e); }
}

let bannerEl = null;
export function showBanner(text, cta, url) {
  if (bannerEl) return;
  bannerEl = document.createElement('div');
  bannerEl.className = 'update-banner';
  bannerEl.innerHTML = `${icon('sparkle')}<span class="grow">${text}</span><button class="btn sm primary">${cta}</button><button class="icon-btn" aria-label="סגירה">${icon('close')}</button>`;
  bannerEl.querySelector('.btn').onclick = () => (typeof url === 'function' ? url() : openExternal(url || RELEASES_URL));
  bannerEl.querySelector('.icon-btn').onclick = () => { bannerEl.remove(); };
  document.body.appendChild(bannerEl);
}
