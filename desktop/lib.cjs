// Pure helpers of the Electron shell (no Electron imports) – unit tested in tests/unit/desktop.test.mjs.
const SITE = 'https://israelb014.github.io/merotz-wiki/';
const SITE_ORIGIN = 'https://israelb014.github.io';

/** URLs that stay inside the app window (everything else opens in the system browser). */
function isSiteUrl(url) {
  try { const u = new URL(url); return u.origin === SITE_ORIGIN && (u.pathname === '/merotz-wiki' || u.pathname.startsWith('/merotz-wiki/')); } catch { return false; }
}
const isExternalHttp = (url) => /^https?:\/\//i.test(String(url || ''));

/** Which updater a build uses: electron-updater for exe/AppImage, an in-app banner for .deb, none in dev. */
function updateMode({ isPackaged, platform, appImage }) {
  if (!isPackaged) return 'none';
  if (platform === 'linux' && !appImage) return 'deb-banner';
  return 'auto';
}

module.exports = { SITE, SITE_ORIGIN, isSiteUrl, isExternalHttp, updateMode };
