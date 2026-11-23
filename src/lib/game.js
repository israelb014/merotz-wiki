// Pure game engine – independent of UI.
import { MODES, timeLimitMs } from './modes.js';
import { resolveTitle, sameTitle } from './wiki.js';

export class GameSession {
  /**
   * @param {object} o
   * o.start, o.target (canonical), o.forbidden (canonical|null), o.settings {mode,timeLimit,allowBack,allowFind}
   * o.kind 'solo'|'mp'|'campaign'|'daily', o.meta (extra data stored with result)
   */
  constructor(o) {
    Object.assign(this, {
      start: o.start, target: o.target, forbidden: o.forbidden || null,
      settings: { allowBack: true, allowFind: true, ...o.settings },
      kind: o.kind || 'solo', meta: o.meta || {},
      path: [{ t: o.start }], stack: [o.start], clicks: 0, status: 'playing',
      startAt: o.startAt || Date.now(), endAt: null, busy: false,
    });
    this.mode = MODES[this.settings.mode] || MODES.fewest;
    this.limit = o.limit !== undefined ? o.limit : timeLimitMs(this.settings);
  }
  get current() { return this.stack[this.stack.length - 1]; }
  get maxClicks() { return this.mode.maxClicks || Infinity; }
  get clicksLeft() { return this.maxClicks - this.clicks; }
  get canBack() { return this.status === 'playing' && this.settings.allowBack && this.stack.length > 1 && this.clicks < this.maxClicks; }
  get canMove() { return this.status === 'playing' && this.clicks < this.maxClicks; }
  elapsed(now = Date.now()) { return Math.max(0, (this.endAt || now) - this.startAt); }
  remaining(now = Date.now()) { return this.limit ? Math.max(0, this.limit - this.elapsed(now)) : null; }

  _end(status) {
    if (this.status !== 'playing') return;
    this.status = status;
    this.endAt = Date.now();
    if (this.limit && this.endAt - this.startAt > this.limit) this.endAt = this.startAt + this.limit;
  }

  /** Follow a link. Returns {ok, title, event} event ∈ 'move'|'arrived'|'dq'|'failed'|'missing'|'blocked' */
  async navigate(rawTitle) {
    if (!this.canMove || this.busy) return { ok: false, event: 'blocked' };
    this.busy = true;
    try {
      const title = await resolveTitle(rawTitle);
      if (this.status !== 'playing') return { ok: false, event: 'blocked' };
      if (!title) return { ok: false, event: 'missing' };
      if (sameTitle(title, this.current)) return { ok: false, event: 'same', title };
      this.clicks++;
      this.path.push({ t: title });
      this.stack.push(title);
      if (this.forbidden && sameTitle(title, this.forbidden)) { this._end('dq'); return { ok: true, title, event: 'dq' }; }
      if (sameTitle(title, this.target)) { this._end('finished'); return { ok: true, title, event: 'arrived' }; }
      if (this.clicks >= this.maxClicks) { this._end('failed'); return { ok: true, title, event: 'failed' }; }
      return { ok: true, title, event: 'move' };
    } finally {
      this.busy = false;
    }
  }

  back() {
    if (!this.canBack || this.busy) return null;
    this.stack.pop();
    this.clicks++;
    const title = this.current;
    this.path.push({ t: title, back: true });
    if (this.clicks >= this.maxClicks) this._end('failed');
    return title;
  }

  giveUp() { this._end('gaveup'); }
  timeout() { this._end('timeout'); }

  /** Called each tick; returns true if time ran out */
  tick(now = Date.now()) {
    if (this.status === 'playing' && this.limit && now - this.startAt >= this.limit) { this.timeout(); return true; }
    return false;
  }

  progress() {
    return { clicks: this.clicks, status: this.status, finished: this.status === 'finished', gaveUp: this.status === 'gaveup', elapsed: this.elapsed() };
  }

  result() {
    return {
      kind: this.kind, mode: this.settings.mode, start: this.start, target: this.target, forbidden: this.forbidden,
      path: this.path, clicks: this.clicks, elapsed: this.elapsed(), status: this.status,
      settings: this.settings, ...this.meta,
    };
  }

  snapshot() {
    const { start, target, forbidden, settings, kind, meta, path, stack, clicks, status, startAt, endAt, limit } = this;
    return { start, target, forbidden, settings, kind, meta, path, stack, clicks, status, startAt, endAt, limit };
  }
  static restore(s) {
    const g = new GameSession({ ...s, limit: s.limit });
    Object.assign(g, { path: s.path, stack: s.stack, clicks: s.clicks, status: s.status, startAt: s.startAt, endAt: s.endAt });
    return g;
  }
}
