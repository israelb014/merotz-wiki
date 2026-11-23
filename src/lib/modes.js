// Game modes, categories, difficulty and ranking rules.
export const MODES = {
  race: { id: 'race', name: 'מרוץ', desc: 'הראשון שמגיע לערך היעד מנצח', icon: 'link', timed: true, group: 'time', cap: 10 * 60 * 1000 },
  clock: { id: 'clock', name: 'נגד השעון', desc: '2, 3 או 5 דקות — הכי מעט קליקים', icon: 'clock', timed: true, group: 'time', limits: [2, 3, 5] },
  fewest: { id: 'fewest', name: 'הכי מעט קליקים', desc: 'הגיעו ליעד במינימום מעברים', icon: 'book', timed: false, group: 'notime' },
  six: { id: 'six', name: '6 צעדים', desc: 'מקסימום 6 קליקים להגיע ליעד', icon: 'steps', timed: false, group: 'notime', maxClicks: 6 },
  forbidden: { id: 'forbidden', name: 'אסור לעבור דרך', desc: 'הימנעו מערך חסום בדרך ליעד', icon: 'ban', timed: false, group: 'notime' },
};
export const MODE_LIST = Object.values(MODES);

export const CATEGORIES = [
  { id: 'random', name: 'אקראי', icon: 'search' },
  { id: 'israel', name: 'ישראל', icon: 'trend' },
  { id: 'history', name: 'היסטוריה', icon: 'history' },
  { id: 'science', name: 'מדע וטבע', icon: 'science' },
  { id: 'sports', name: 'ספורט', icon: 'ball' },
  { id: 'geography', name: 'גאוגרפיה', icon: 'globe' },
  { id: 'food', name: 'אוכל', icon: 'bowl' },
  { id: 'culture', name: 'תרבות ובידור', icon: 'film' },
];
export const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || 'אקראי';

export const DIFFICULTIES = [
  { id: 'easy', name: 'קל' },
  { id: 'medium', name: 'בינוני' },
  { id: 'hard', name: 'קשה' },
];
export const diffName = (id) => DIFFICULTIES.find((d) => d.id === id)?.name || 'בינוני';

export const DEFAULT_GAME_SETTINGS = {
  mode: 'race', timeLimit: 3, category: 'random', difficulty: 'medium',
  allowBack: true, allowFind: true, customStart: '', customTarget: '',
};

/** Time limit in ms for a mode (null = untimed / no visible timer) */
export function timeLimitMs(settings) {
  const m = MODES[settings.mode];
  if (m.id === 'race') return m.cap;
  if (m.id === 'clock') return (settings.timeLimit || 3) * 60 * 1000;
  return null;
}

export const STATUS_LABEL = {
  playing: 'משחק', finished: 'הגיע', gaveup: 'ויתר', failed: 'נכשל', dq: 'נפסל', timeout: 'נגמר הזמן', left: 'התנתק',
};

/** Rank players. p = {id, status, clicks, elapsed}. Returns sorted array with .rank (1-based) for finishers. */
export function rankPlayers(mode, players) {
  const fin = players.filter((p) => p.status === 'finished');
  const rest = players.filter((p) => p.status !== 'finished');
  if (mode === 'race') fin.sort((a, b) => a.elapsed - b.elapsed || a.clicks - b.clicks);
  else fin.sort((a, b) => a.clicks - b.clicks || a.elapsed - b.elapsed);
  const order = ['timeout', 'failed', 'gaveup', 'dq', 'left', 'playing'];
  rest.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.clicks - b.clicks);
  fin.forEach((p, i) => (p.rank = i + 1));
  rest.forEach((p) => (p.rank = null));
  return [...fin, ...rest];
}

export const isDone = (status) => status && status !== 'playing';
