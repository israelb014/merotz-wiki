// Statistics + achievements, computed from history & kv state.
import { state, save, listGames } from './store.js';
import { MODE_LIST } from './modes.js';
import { jerusalemDate } from './data.js';

export const ACHIEVEMENTS = [
  { id: 'first_game', name: 'צעד ראשון', desc: 'שחקו את המשחק הראשון', icon: 'flag' },
  { id: 'first_win', name: 'ניצחון ראשון', desc: 'הגיעו ליעד (או נצחו בחדר) לראשונה', icon: 'trophy' },
  { id: 'three_clicks', name: 'שלושה קליקים', desc: 'הגיעו ליעד ב־3 קליקים או פחות', icon: 'bolt' },
  { id: 'under_30', name: 'ברק', desc: 'הגיעו ליעד בפחות מ־30 שניות', icon: 'clock' },
  { id: 'beat_shortest', name: 'בקו ישר', desc: 'הגיעו ליעד במסלול קצר או שווה למסלול הקצר ביותר', icon: 'route' },
  { id: 'daily_7', name: 'שבוע רצוף', desc: '7 ימים רצופים של אתגר יומי', icon: 'fire' },
  { id: 'world_3stars', name: 'עולם מושלם', desc: 'שלושה כוכבים בכל שלבי עולם אחד', icon: 'starFill' },
  { id: 'all_modes', name: 'רב־גוני', desc: 'נצחו בכל חמשת מצבי המשחק', icon: 'medal' },
  { id: 'five_players', name: 'בית מלא', desc: 'שחקו בחדר עם 5 שחקנים', icon: 'users' },
  { id: 'six_win', name: 'שישה צעדים', desc: 'הגיעו ליעד במצב 6 צעדים', icon: 'steps' },
  { id: 'forbidden_win', name: 'מעקף', desc: 'הגיעו ליעד במצב אסור לעבור דרך', icon: 'ban' },
  { id: 'hard_win', name: 'קשוח', desc: 'הגיעו ליעד ברמת קושי קשה', icon: 'shield' },
  { id: 'no_back', name: 'בלי להסתכל אחורה', desc: 'הגיעו ליעד ב־5 קליקים לפחות בלי ללחוץ חזרה', icon: 'arrowUpLeft' },
  { id: 'games_25', name: 'מתמיד', desc: 'שחקו 25 משחקים', icon: 'calendar' },
  { id: 'room_win', name: 'מלך החדר', desc: 'נצחו סיבוב בחדר עם חברים', icon: 'crown' },
  { id: 'campaign_done', name: 'סוף המסלול', desc: 'השלימו את כל 60 השלבים', icon: 'sparkle' },
];

export function isWin(g) {
  if (g.kind === 'mp') return g.rank === 1;
  return g.status === 'finished';
}

export function dailyStreak(daily = state.daily) {
  const done = new Set(Object.entries(daily).filter(([, r]) => r?.status === 'finished').map(([d]) => d));
  const step = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  let cur = 0;
  let d = jerusalemDate();
  if (!done.has(d)) d = step(d, -1);
  while (done.has(d)) { cur++; d = step(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const day of [...done].sort()) { run = prev && step(prev, 1) === day ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  return { current: cur, best };
}

export async function computeStats() {
  const games = await listGames();
  const wins = games.filter(isWin);
  const arrived = games.filter((g) => g.status === 'finished');
  const bestTime = {};
  for (const m of MODE_LIST) {
    const t = arrived.filter((g) => g.mode === m.id).map((g) => g.elapsed);
    bestTime[m.id] = t.length ? Math.min(...t) : null;
  }
  const stars = Object.values(state.campaign || {}).reduce((a, b) => a + (b || 0), 0);
  return {
    games: games.length, wins: wins.length,
    winRate: games.length ? wins.length / games.length : 0,
    avgClicks: arrived.length ? arrived.reduce((a, g) => a + g.clicks, 0) / arrived.length : null,
    bestTime, streak: dailyStreak(), stars,
    bestClicks: arrived.length ? Math.min(...arrived.map((g) => g.clicks)) : null,
  };
}

/** Evaluate achievements after a game. Returns newly unlocked list. */
export async function checkAchievements(lastGame, { campaign } = {}) {
  const games = await listGames();
  const got = state.achievements;
  const unlocked = [];
  const give = (id) => { if (!got[id]) { got[id] = Date.now(); unlocked.push(ACHIEVEMENTS.find((a) => a.id === id)); } };
  const fin = games.filter((g) => g.status === 'finished');
  if (games.length) give('first_game');
  if (games.some(isWin)) give('first_win');
  if (fin.some((g) => g.clicks <= 3)) give('three_clicks');
  if (fin.some((g) => g.elapsed < 30000)) give('under_30');
  if (fin.some((g) => g.par && g.clicks <= g.par)) give('beat_shortest');
  if (dailyStreak().best >= 7) give('daily_7');
  if (fin.some((g) => g.mode === 'six')) give('six_win');
  if (fin.some((g) => g.mode === 'forbidden')) give('forbidden_win');
  if (fin.some((g) => g.difficulty === 'hard')) give('hard_win');
  if (fin.some((g) => g.clicks >= 5 && !g.path?.some((p) => p.back))) give('no_back');
  if (games.length >= 25) give('games_25');
  if (games.some((g) => g.kind === 'mp' && (g.playerCount || 0) >= 5)) give('five_players');
  if (games.some((g) => g.kind === 'mp' && g.rank === 1 && (g.playerCount || 0) > 1)) give('room_win');
  const wonModes = new Set(games.filter(isWin).map((g) => g.mode));
  if (MODE_LIST.every((m) => wonModes.has(m.id))) give('all_modes');
  if (campaign) {
    for (const w of campaign.worlds) if (w.levels.every((l) => (state.campaign[l.id] || 0) >= 3)) give('world_3stars');
    const total = campaign.worlds.reduce((a, w) => a + w.levels.length, 0);
    if (Object.values(state.campaign).filter((s) => s >= 1).length >= total) give('campaign_done');
  }
  if (unlocked.length) await save('achievements');
  return unlocked;
}
