// Public configuration. The Supabase publishable key is public by design
// (Realtime Broadcast + Presence only; the only table this game uses is `keepalive`).
// Project: super-ramla-lod (shared Supabase project).
export const SUPABASE_URL = 'https://qyrbslobnelwdipguihs.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_8RobbG3zeN8jSGCWHEwDYA_sKfcQ6km';

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
