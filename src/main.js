import '@fontsource-variable/heebo/wght.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/frank-ruhl-libre/hebrew-900.css';
import '@fontsource/frank-ruhl-libre/latin-700.css';
import '@fontsource/frank-ruhl-libre/latin-900.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/article.css';

import { loadAll, state, save } from './lib/store.js';
import { route, render, setGuard, go, currentRoute } from './lib/router.js';
import { applyTheme } from './theme.js';
import { closeTop, overlayOpen, toast } from './lib/ui.js';
import { initBackButton, initDeepLinks, checkShellUpdates, desktop, showBanner } from './lib/platform.js';
import { loadJSON } from './lib/data.js';
import { ctx, resumeSolo } from './app.js';
import { recentRoomCode } from './lib/room.js';
import { installCrashReporting } from './lib/crash.js';
import { platformName } from './lib/platform.js';

import home from './screens/home.js';
import onboarding from './screens/onboarding.js';
import modes from './screens/modes.js';
import setup from './screens/setup.js';
import pregame from './screens/pregame.js';
import playScreen, { gameApi } from './screens/play.js';
import results from './screens/results.js';
import lobby from './screens/lobby.js';
import join from './screens/join.js';
import campaign from './screens/campaign.js';
import daily from './screens/daily.js';
import stats from './screens/stats.js';
import settings, { showChangelog } from './screens/settings.js';
import offline from './screens/offline.js';

installCrashReporting({ version: __APP_VERSION__, platform: platformName, screen: () => currentRoute()?.path || location.hash.replace(/\?.*$/, ''), name: () => state.profile?.name });

route('/', home);
route('/onboarding', onboarding);
route('/modes', modes);
route('/setup', setup);
route('/pregame', pregame);
route('/play', playScreen);
route('/results', results);
route('/room', lobby);
route('/join', join);
route('/campaign', campaign);
route('/daily', daily);
route('/stats', stats);
route('/settings', settings);
route('/offline', offline);

setGuard((r) => {
  if (!state.profile && r.path !== '/onboarding' && r.path !== '/offline') {
    const q = new URLSearchParams({ next: r.path === '/' ? '/' : r.path, ...(r.query.code ? { code: r.query.code } : {}) });
    return `/onboarding?${q}`;
  }
  if (!navigator.onLine && r.path !== '/offline') return `/offline?next=${encodeURIComponent(r.path)}`;
  return null;
});

async function leaveRoomConfirm() {
  const { confirmDialog } = await import('./lib/ui.js');
  if (await confirmDialog({ title: 'לצאת מהחדר?', ok: 'יציאה', danger: true })) {
    await ctx.room?.leave(); ctx.room = null; go('/', { replace: true });
  }
}

function openRoomLink(code) {
  go('/join', { query: { code } });
}

async function boot() {
  await loadAll();
  applyTheme();

  // invite link ?room=1234 → join screen prefilled
  const params = new URLSearchParams(location.search);
  const roomCode = params.get('room');
  if (roomCode && /^\d{4}$/.test(roomCode)) {
    params.delete('room');
    const qs = params.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? '?' + qs : ''}#/join?code=${roomCode}`);
  }
  // reload / app restart during a room round: go back through the room (resumes the same player + game)
  const hashPath = location.hash.replace(/^#/, '').split('?')[0];
  const rc = ['/play', '/pregame', '/results'].includes(hashPath) ? recentRoomCode() : null;
  if (rc) history.replaceState(null, '', `${location.pathname}${location.search}#/room?code=${rc}`);
  // otherwise a saved solo game continues (unless an invite / room link was opened)
  else if (state.profile && !['/join', '/room', '/onboarding'].includes(hashPath)) {
    const to = await resumeSolo();
    if (to) history.replaceState(null, '', `${location.pathname}${location.search}#${to}`);
  }
  await render();

  initDeepLinks(openRoomLink);
  initBackButton(() => {
    if (gameApi.onBack) return gameApi.onBack();
    if (overlayOpen()) { closeTop(); return true; }
    const path = currentRoute()?.path;
    if (path === '/' ) return false;
    if (ctx.room) {
      if (path === '/room') { leaveRoomConfirm(); return true; }
      if (path === '/results' || path === '/pregame') { go('/room', { replace: true, query: { code: ctx.room.code } }); return true; }
    }
    if (path === '/results' || path === '/pregame') { go('/', { replace: true }); return true; }
    if (history.length > 1) { history.back(); return true; }
    go('/', { replace: true });
    return true;
  });

  window.addEventListener('offline', () => toast('החיבור לאינטרנט נותק'));
  window.addEventListener('online', () => toast('חזרנו לרשת'));

  // "What's new" once per content version (not on first launch)
  try {
    const cl = await loadJSON('changelog', { fresh: true });
    const latest = cl?.[0]?.version;
    if (latest && state.seenChangelog !== latest) {
      const firstRun = !state.seenChangelog && localStorage.getItem('mw-seen-cl-first');
      state.seenChangelog = latest; await save('seenChangelog');
      if (!firstRun && state.profile && !currentRoute()?.path.match(/^\/(play|pregame)$/)) setTimeout(() => showChangelog(cl), 600);
    }
  } catch {}

  // shell updates
  setTimeout(checkShellUpdates, 2500);
  desktop()?.onUpdateStatus?.((s) => {
    if (s?.type === 'downloaded') showBanner(`עדכון ${s.version} מוכן – יותקן בהפעלה הבאה`, 'הפעלה מחדש עכשיו', () => desktop().quitAndInstall?.());
  });

  // keep room alive notice
  window.addEventListener('beforeunload', () => { ctx.room?.persistSession(); });
}

boot();
