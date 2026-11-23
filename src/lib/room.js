// Multiplayer room controller. Host-authoritative; host = state.hostId, or the oldest present player if the host left.
import { createTransport } from './transport.js';
import { MAX_PLAYERS } from '../config.js';
import { DEFAULT_GAME_SETTINGS, rankPlayers, timeLimitMs, isDone } from './modes.js';
import { pickPair, customPair, pickForbidden } from './data.js';

const SESSION_KEY = 'mw-room-session';
const ACTIVE_KEY = 'mw-active-game';
const RECONNECT_MS = 60_000;

export function randomCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

// Resume the same player within 60s (reload / app restart), but never let two tabs of one browser share an id.
const tabs = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mw-tabs') : null;
let activeRoomId = null;
tabs?.addEventListener('message', (e) => { if (e.data?.q && e.data.q === activeRoomId) tabs.postMessage({ a: activeRoomId }); });
async function idInUseByOtherTab(id) {
  if (!tabs) return false;
  return new Promise((resolve) => {
    const h = (e) => { if (e.data?.a === id) { tabs.removeEventListener('message', h); resolve(true); } };
    tabs.addEventListener('message', h);
    tabs.postMessage({ q: id });
    setTimeout(() => { tabs.removeEventListener('message', h); resolve(false); }, 200);
  });
}
async function loadSession(code) {
  try {
    const own = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (own && own.code === code) return own;
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (s && s.code === code && Date.now() - s.ts < RECONNECT_MS && !(await idInUseByOtherTab(s.id))) return s;
  } catch {}
  return null;
}
export function saveActiveGame(code, roundId, snap) {
  try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ code, roundId, snap, ts: Date.now() })); } catch {}
}
export function loadActiveGame(code, roundId) {
  try {
    const a = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
    if (a && a.code === code && a.roundId === roundId && Date.now() - a.ts < RECONNECT_MS + 15 * 60_000) return a.snap;
  } catch {}
  return null;
}
export function clearActiveGame() { try { localStorage.removeItem(ACTIVE_KEY); } catch {} }

export class Room {
  constructor({ code, profile, create = false }) {
    this.code = code;
    this.create = create;
    this.profile = profile;
    this.state = null;
    this.present = [];
    this.progress = {};   // pid -> {roundId, clicks, status, elapsed}
    this.routes = {};     // pid -> path (current results round)
    this.absentSince = {};
    this.clockOffset = 0; // hostNow - localNow
    this.listeners = new Set();
    this.status = 'connecting';
    this.error = null;
    this.busy = false;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) try { fn(type, data); } catch (e) { console.error(e); } }

  get isHost() { return !!this.me && this.state?.hostId === this.me.id; }
  get hostId() { return this.state?.hostId; }
  get phase() { return this.state?.phase || 'connecting'; }
  get settings() { return this.state?.settings || DEFAULT_GAME_SETTINGS; }
  get round() { return this.state?.round || null; }
  get inRound() { return !!this.me && !!this.round?.players?.some((p) => p.id === this.me.id); }
  hostToLocal(t) { return t - this.clockOffset; }
  localNow() { return Date.now(); }

  /** Players to display (present, sorted by joinedAt, max 5) */
  get players() {
    return [...this.present].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1)).slice(0, MAX_PLAYERS);
  }

  persistSession() {
    if (!this.me) return;
    const v = JSON.stringify({ code: this.code, id: this.me.id, joinedAt: this.me.joinedAt, ts: Date.now() });
    try { localStorage.setItem(SESSION_KEY, v); sessionStorage.setItem(SESSION_KEY, v); } catch {}
  }

  async connect() {
    const prev = await loadSession(this.code);
    const profile = this.profile;
    this.me = {
      id: prev?.id || profile.id + '-' + Math.random().toString(36).slice(2, 6),
      name: profile.name, avatar: profile.avatar, color: profile.color,
      joinedAt: prev?.joinedAt || Date.now(),
    };
    this.resumed = !!prev;
    activeRoomId = this.me.id;
    this.t = createTransport(this.code, this.me);
    this.t.onMessage((m) => this._onMessage(m));
    this.t.onPresence((list) => this._onPresence(list));
    this.t.onStatus((s) => { this.status = s; this.emit('status', s); if (s === 'online' && this.state && !this.isHost) this.t.send('hello', { meta: this.me }); });
    await this.t.connect();
    this.persistSession();
    this._persistTimer = setInterval(() => this.persistSession(), 5000);
    this._tick = setInterval(() => this._hostTick(), 1000);
    this.t.send('hello', { meta: this.me });

    // decide: create / wait for host state
    const others = () => this.present.filter((p) => p.id !== this.me.id);
    if (this.create && others().length === 0) {
      this._becomeHost(true);
    } else {
      const t0 = Date.now();
      while (!this.state && Date.now() - t0 < 6000) {
        await new Promise((r) => setTimeout(r, 250));
        if (Date.now() - t0 > 2500 && Date.now() - t0 < 2800) this.t.send('hello', { meta: this.me });
      }
      if (!this.state) {
        if (others().length === 0) {
          if (this.create) this._becomeHost(true);
          else { await this.leave(); throw new Error('notfound'); }
        } else if (this.players[0]?.id === this.me.id) this._becomeHost(true);
      }
    }
    if (this._isOverflow()) { await this.leave(); throw new Error('full'); }
    this.status = 'online';
    this.emit('change');
  }

  _isOverflow() {
    const idx = [...this.present].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1)).findIndex((p) => p.id === this.me.id);
    const known = this.state?.round?.players?.some((p) => p.id === this.me.id);
    return idx >= MAX_PLAYERS && !known;
  }

  _becomeHost(fresh) {
    const prev = this.state;
    this.state = {
      v: (prev?.v || 0) + 1,
      hostId: this.me.id,
      code: this.code,
      phase: prev?.phase || 'lobby',
      settings: prev?.settings || { ...DEFAULT_GAME_SETTINGS, ...(this.defaultSettings || {}) },
      round: prev?.round || null,
      results: prev?.results || null,
      routes: prev?.routes || {},
      roster: prev?.roster || [],
      msg: null,
    };
    if (!fresh) this.emit('host-changed');
    this._updateRoster();
    this._broadcastState();
  }

  _broadcastState() {
    if (!this.isHost) return;
    this.state.hostNow = Date.now();
    this.t.send('state', { state: this.state });
    this.emit('change');
  }

  _onMessage(m) {
    switch (m.type) {
      case 'state': {
        const s = m.state;
        if (!s) return;
        if (this.state && s.v < this.state.v && s.hostId === this.state.hostId) return;
        if (this.state && this.isHost && s.hostId !== this.me.id) {
          // Two hosts: the older joinedAt wins
          const other = this.present.find((p) => p.id === s.hostId);
          if (other && other.joinedAt > this.me.joinedAt) { this._broadcastState(); return; }
        }
        const prevPhase = this.state?.phase;
        const prevRound = this.state?.round?.id;
        this.clockOffset = (s.hostNow || Date.now()) - Date.now();
        this.state = s;
        if (s.routes) for (const [pid, path] of Object.entries(s.routes)) this.routes[pid] = path;
        if (s.round?.id !== prevRound) { this.routes = { ...(s.routes || {}) }; }
        this.emit('change');
        if (prevPhase !== s.phase || prevRound !== s.round?.id) this.emit('phase', s.phase);
        break;
      }
      case 'hello':
        if (this.isHost) { this._updateRoster(); this._broadcastState(); }
        break;
      case 'progress':
        if (!m.roundId || m.roundId !== this.round?.id) return;
        this.progress[m.from] = { roundId: m.roundId, clicks: m.clicks, status: m.status, elapsed: m.elapsed };
        this.emit('progress');
        if (this.isHost) this._checkRoundEnd();
        break;
      case 'route':
        if (m.roundId !== this.round?.id) return;
        this.routes[m.from] = m.path;
        if (this.isHost) { this.state.routes = { ...(this.state.routes || {}), [m.from]: m.path }; this._broadcastState(); }
        this.emit('routes');
        break;
      case 'ping-req':
        if (this.isHost) this._broadcastState();
        break;
    }
  }

  _onPresence(list) {
    const before = new Set(this.present.map((p) => p.id));
    this.present = list;
    const now = Date.now();
    const ids = new Set(list.map((p) => p.id));
    for (const p of this.round?.players || []) {
      if (!ids.has(p.id)) this.absentSince[p.id] ??= now;
      else delete this.absentSince[p.id];
    }
    const joined = list.filter((p) => !before.has(p.id) && p.id !== this.me.id);
    if (joined.length && before.size) this.emit('joined', joined);

    if (this.state) {
      if (!ids.has(this.state.hostId)) {
        // host left → oldest remaining player becomes host
        const next = this.players[0];
        if (next?.id === this.me.id) this._becomeHost(false);
      } else if (this.isHost) {
        this._updateRoster();
        this._broadcastState();
      }
    }
    this.emit('presence');
  }

  _updateRoster() {
    if (!this.isHost) return;
    const roster = new Map((this.state.roster || []).map((p) => [p.id, p]));
    for (const p of this.players) roster.set(p.id, { id: p.id, name: p.name, avatar: p.avatar, color: p.color, joinedAt: p.joinedAt });
    this.state.roster = [...roster.values()].slice(-12);
  }

  // ---------- host actions ----------
  updateSettings(patch) {
    if (!this.isHost) return;
    this.state.settings = { ...this.state.settings, ...patch };
    this.state.v++;
    this._broadcastState();
  }

  async startRound() {
    if (!this.isHost || this.busy) return;
    this.busy = true;
    this.state.msg = 'בוחרים זוג ערכים…';
    this._broadcastState();
    try {
      const s = this.state.settings;
      let pair;
      if (s.customStart && s.customTarget) pair = await customPair(s.customStart, s.customTarget);
      else pair = await pickPair({ category: s.category, difficulty: s.difficulty, exclude: this._recent || [] });
      this._recent = [...(this._recent || []), pair.start, pair.target].slice(-20);
      const forbidden = s.mode === 'forbidden' ? await pickForbidden(pair.start, pair.target) : null;
      const players = this.players.map(({ id, name, avatar, color }) => ({ id, name, avatar, color }));
      this.progress = {};
      this.routes = {};
      this.absentSince = {};
      this.state.round = {
        id: Math.random().toString(36).slice(2, 10),
        start: pair.start, target: pair.target, forbidden,
        startAt: Date.now() + 6000,
        limit: timeLimitMs(s),
        settings: { ...s },
        players,
      };
      this.state.results = null;
      this.state.routes = {};
      this.state.phase = 'playing';
      this.state.msg = null;
      this.state.v++;
      this._broadcastState();
      this.emit('phase', 'playing');
    } catch (e) {
      this.state.msg = null;
      this._broadcastState();
      throw e;
    } finally {
      this.busy = false;
    }
  }

  backToLobby() {
    if (!this.isHost) return;
    this.state.phase = 'lobby';
    this.state.v++;
    this._broadcastState();
    this.emit('phase', 'lobby');
  }

  _hostTick() {
    if (!this.isHost || !this.state) return;
    if (this.state.phase === 'playing') this._checkRoundEnd();
    if (!this._lastBeat || Date.now() - this._lastBeat > 4000) { this._lastBeat = Date.now(); this._broadcastState(); }
  }

  _checkRoundEnd() {
    const r = this.round;
    if (!r || this.state.phase !== 'playing') return;
    const now = Date.now();
    const allDone = r.players.every((p) => {
      const pr = this.progress[p.id];
      if (pr && isDone(pr.status)) return true;
      const abs = this.absentSince[p.id];
      return abs && now - abs > RECONNECT_MS;
    });
    const timeUp = r.limit && now > r.startAt + r.limit + 2500;
    if (allDone || timeUp) this._finishRound();
  }

  _finishRound() {
    const r = this.round;
    const list = r.players.map((p) => {
      const pr = this.progress[p.id] || { clicks: 0, status: 'playing', elapsed: null };
      let status = pr.status;
      if (status === 'playing') status = this.absentSince[p.id] ? 'left' : r.limit ? 'timeout' : 'left';
      return { ...p, clicks: pr.clicks || 0, elapsed: pr.elapsed ?? (r.limit || 0), status };
    });
    const ranking = rankPlayers(r.settings.mode, list);
    this.state.results = { roundId: r.id, ranking, mode: r.settings.mode };
    this.state.phase = 'results';
    this.state.v++;
    this._broadcastState();
    this.emit('phase', 'results');
  }

  // ---------- player actions ----------
  sendProgress(p) {
    if (!this.round) return;
    const msg = { roundId: this.round.id, clicks: p.clicks, status: p.status, elapsed: p.elapsed };
    this.progress[this.me.id] = msg;
    this.t.send('progress', msg);
    this.emit('progress');
    if (this.isHost) this._checkRoundEnd();
  }
  sendRoute(path) {
    if (!this.round) return;
    this.routes[this.me.id] = path;
    this.t.send('route', { roundId: this.round.id, path });
    if (this.isHost) { this.state.routes = { ...(this.state.routes || {}), [this.me.id]: path }; this._broadcastState(); }
    this.emit('routes');
  }

  async leave() {
    clearInterval(this._tick); clearInterval(this._persistTimer);
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch {}
    activeRoomId = null;
    await this.t?.close();
    this.listeners.clear();
  }
}
