// Realtime transport. Production: Supabase Realtime (Broadcast + Presence) on channel "room-{code}".
// Tests / no-config fallback: BroadcastChannel transport with the same interface (same-browser only).
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const realtimeConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);
export function transportKind() {
  const q = new URLSearchParams(location.search);
  if (q.get('transport') === 'local' || sessionStorage.getItem('mw-transport') === 'local') { sessionStorage.setItem('mw-transport', 'local'); return 'local'; }
  return realtimeConfigured() ? 'supabase' : 'local';
}

export function createTransport(code, meta) {
  return transportKind() === 'supabase' ? new SupaTransport(code, meta) : new LocalTransport(code, meta);
}

class Base {
  constructor(code, meta) { this.code = code; this.meta = meta; this.msgCbs = []; this.presCbs = []; this.statusCbs = []; }
  onMessage(cb) { this.msgCbs.push(cb); }
  onPresence(cb) { this.presCbs.push(cb); }
  onStatus(cb) { this.statusCbs.push(cb); }
  _emitMsg(m) { for (const cb of this.msgCbs) try { cb(m); } catch (e) { console.error(e); } }
  _emitPres() { const l = this.presence(); for (const cb of this.presCbs) try { cb(l); } catch (e) { console.error(e); } }
  _emitStatus(s) { for (const cb of this.statusCbs) try { cb(s); } catch (e) { console.error(e); } }
}

class SupaTransport extends Base {
  async connect() {
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 }, heartbeatIntervalMs: 15000 },
    });
    this.ch = this.client.channel(`room-${this.code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.meta.id } },
    });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => this._emitMsg(payload));
    this.ch.on('presence', { event: 'sync' }, () => this._emitPres());
    await new Promise((resolve, reject) => {
      let first = true;
      const to = setTimeout(() => first && reject(new Error('timeout')), 15000);
      this.ch.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          await this.ch.track(this.meta).catch(() => {});
          this._emitStatus('online');
          if (first) { first = false; clearTimeout(to); resolve(); }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this._emitStatus('offline');
          if (first && status !== 'CLOSED') { first = false; clearTimeout(to); reject(err || new Error(status)); }
        }
      });
    });
  }
  send(type, payload = {}) {
    this.ch?.send({ type: 'broadcast', event: 'm', payload: { type, from: this.meta.id, ...payload } });
  }
  track(meta) { this.meta = meta; return this.ch?.track(meta); }
  presence() {
    const st = this.ch?.presenceState() || {};
    return Object.values(st).map((arr) => arr[arr.length - 1]).filter((m) => m && m.id);
  }
  async close() {
    try { await this.ch?.untrack(); } catch {}
    try { await this.client?.removeAllChannels(); } catch {}
  }
}

class LocalTransport extends Base {
  async connect() {
    this.bc = new BroadcastChannel(`mw-room-${this.code}`);
    this.peers = new Map(); // id -> {meta, seen}
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.from === this.meta.id) return;
      if (m.type === '__hb') {
        const had = this.peers.has(m.from);
        this.peers.set(m.from, { meta: m.meta, seen: Date.now() });
        if (!had) this._emitPres();
        if (m.ask) this._hb(false);
      } else if (m.type === '__bye') {
        if (this.peers.delete(m.from)) this._emitPres();
      } else this._emitMsg(m);
    };
    this.timer = setInterval(() => {
      this._hb(false);
      const now = Date.now();
      let changed = false;
      for (const [id, p] of this.peers) if (now - p.seen > 3500) { this.peers.delete(id); changed = true; }
      if (changed) this._emitPres();
    }, 1000);
    this._hb(true);
    await new Promise((r) => setTimeout(r, 400));
    this._emitStatus('online');
    this._emitPres();
    this._unload = () => this.bc?.postMessage({ type: '__bye', from: this.meta.id });
    window.addEventListener('pagehide', this._unload);
  }
  _hb(ask) { this.bc?.postMessage({ type: '__hb', from: this.meta.id, meta: this.meta, ask }); }
  send(type, payload = {}) { this.bc?.postMessage({ type, from: this.meta.id, ...payload }); }
  track(meta) { this.meta = meta; this._hb(false); }
  presence() { return [this.meta, ...[...this.peers.values()].map((p) => p.meta)]; }
  async close() {
    clearInterval(this.timer);
    this._unload?.();
    window.removeEventListener('pagehide', this._unload);
    this.bc?.close(); this.bc = null;
  }
}
