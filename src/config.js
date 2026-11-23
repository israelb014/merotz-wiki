// Public configuration. The Supabase publishable/anon key is public by design
// (Realtime Broadcast + Presence only; no tables are exposed except `keepalive`).
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';

export const SITE_URL = 'https://israelb014.github.io/merotz-wiki/';
export const REPO = 'israelb014/merotz-wiki';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const ASSET = {
  apk: `https://github.com/${REPO}/releases/latest/download/merotz-wiki.apk`,
  exe: `https://github.com/${REPO}/releases/latest/download/merotz-wiki-setup.exe`,
  deb: `https://github.com/${REPO}/releases/latest/download/merotz-wiki.deb`,
  appimage: `https://github.com/${REPO}/releases/latest/download/merotz-wiki.AppImage`,
};
export const WIKI_UA = 'MerotzWiki/1.0 (ib@ib-fix.com)';
export const MAX_PLAYERS = 5;
