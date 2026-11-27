// Supabase mock: an in-process fake of the Supabase Realtime server (Phoenix protocol vsn 2.0.0:
// channels, Broadcast and Presence) plus the REST broadcast fallback. Every browser context (= device)
// is attached with hub.attach(context, tag); the real app code (SupaTransport + supabase-js) talks to it.
// Nothing ever reaches the real Supabase project.

let nextRef = 1;
const KIND_PUSH = 3;

function decodeBinaryPush(buf) {
  const b = Buffer.from(buf);
  if (b[0] !== KIND_PUSH) return null;
  const [joinLen, refLen, topicLen, evLen, metaLen, encoding] = [b[1], b[2], b[3], b[4], b[5], b[6]];
  let o = 7;
  const take = (n) => { const s = b.subarray(o, o + n).toString('utf8'); o += n; return s; };
  const join_ref = take(joinLen), ref = take(refLen), topic = take(topicLen), event = take(evLen); take(metaLen);
  const rest = b.subarray(o);
  const payload = encoding === 1 ? JSON.parse(rest.toString('utf8') || '{}') : rest;
  return { join_ref: join_ref || null, ref: ref || null, topic, event: 'broadcast', payload: { type: 'broadcast', event, payload } };
}

export class RealtimeHub {
  constructor() {
    this.clients = new Map(); // cid -> {ws, tag, topics: Map(topic -> {joinRef, key, meta, phxRef, self})}
    this.offlineTags = new Set();
    this.log = [];             // broadcast messages {topic, event, payload, tag}
    this.connections = [];     // {tag, at}
    this.dropRate = 0;         // probability of dropping a broadcast to one receiver (flaky network)
  }

  _send(c, arr) { try { c.ws.send(JSON.stringify(arr)); } catch {} }
  _members(topic) { return [...this.clients.values()].filter((c) => c.topics.has(topic)); }
  presenceState(topic) {
    const st = {};
    for (const c of this._members(topic)) {
      const t = c.topics.get(topic);
      if (t.meta) (st[t.key] ||= { metas: [] }).metas.push({ phx_ref: t.phxRef, ...t.meta });
    }
    return st;
  }
  /** Present metas in a room, e.g. presence('room-1234') */
  presence(room) { return Object.values(this.presenceState(`realtime:${room}`)).flatMap((x) => x.metas); }
  _diff(topic, joins, leaves) {
    for (const c of this._members(topic)) this._send(c, [null, null, topic, 'presence_diff', { joins, leaves }]);
  }
  _untrack(c, topic) {
    const t = c.topics.get(topic);
    if (!t?.meta) return;
    const leaves = { [t.key]: { metas: [{ phx_ref: t.phxRef, ...t.meta }] } };
    t.meta = null;
    this._diff(topic, {}, leaves);
  }
  _broadcast(fromCid, topic, event, payload, tag) {
    this.log.push({ topic, event, payload, tag, at: Date.now() });
    for (const [cid, c] of this.clients) {
      const t = c.topics.get(topic);
      if (!t || (cid === fromCid && !t.self)) continue;
      if (this.dropRate && Math.random() < this.dropRate) continue;
      this._send(c, [null, null, topic, 'broadcast', { type: 'broadcast', event, payload }]);
    }
  }

  _onFrame(cid, raw) {
    const c = this.clients.get(cid);
    if (!c) return;
    let m;
    if (typeof raw === 'string') { const [join_ref, ref, topic, event, payload] = JSON.parse(raw); m = { join_ref, ref, topic, event, payload }; }
    else m = decodeBinaryPush(raw);
    if (!m) return;
    const reply = (response = {}, status = 'ok') => this._send(c, [m.join_ref, m.ref, m.topic, 'phx_reply', { status, response }]);
    switch (m.event) {
      case 'heartbeat': return reply();
      case 'phx_join': {
        const cfg = m.payload?.config || {};
        c.topics.set(m.topic, { joinRef: m.join_ref, key: cfg.presence?.key || `anon-${cid}`, meta: null, phxRef: null, self: !!cfg.broadcast?.self });
        reply({ postgres_changes: [] });
        this._send(c, [m.join_ref, null, m.topic, 'presence_state', this.presenceState(m.topic)]);
        return;
      }
      case 'phx_leave': this._untrack(c, m.topic); reply(); c.topics.delete(m.topic); return;
      case 'access_token': return reply();
      case 'presence': {
        const t = c.topics.get(m.topic);
        if (!t) return reply({}, 'error');
        if (m.payload?.event === 'track') {
          const leaves = t.meta ? { [t.key]: { metas: [{ phx_ref: t.phxRef, ...t.meta }] } } : {};
          t.meta = m.payload.payload || {};
          t.phxRef = `F${nextRef++}`;
          reply();
          this._diff(m.topic, { [t.key]: { metas: [{ phx_ref: t.phxRef, ...t.meta }] } }, leaves);
        } else if (m.payload?.event === 'untrack') { this._untrack(c, m.topic); reply(); }
        return;
      }
      case 'broadcast':
        if (!c.topics.has(m.topic)) return;
        if (m.ref) reply();
        this._broadcast(cid, m.topic, m.payload.event, m.payload.payload, c.tag);
        return;
      default: return reply();
    }
  }

  _closeClient(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    this.clients.delete(cid);
    for (const topic of c.topics.keys()) { c.topics.set(topic, c.topics.get(topic)); }
    for (const [topic, t] of c.topics) if (t.meta) this._diff(topic, {}, { [t.key]: { metas: [{ phx_ref: t.phxRef, ...t.meta }] } });
  }

  /** Simulate a device losing / regaining its network connection to Supabase. */
  setOffline(tag, off = true) {
    if (off) {
      this.offlineTags.add(tag);
      for (const [cid, c] of [...this.clients]) if (c.tag === tag) { this._closeClient(cid); c.ws.close({ code: 1006, reason: 'offline' }).catch?.(() => {}); }
    } else this.offlineTags.delete(tag);
  }

  async attach(context, tag) {
    await context.routeWebSocket(/supabase\.co\/realtime\/v1\/websocket/, (ws) => {
      if (this.offlineTags.has(tag)) { ws.close({ code: 1006, reason: 'offline' }); return; }
      const cid = `c${nextRef++}`;
      this.clients.set(cid, { ws, tag, topics: new Map() });
      this.connections.push({ tag, at: Date.now() });
      ws.onMessage((msg) => { try { this._onFrame(cid, msg); } catch (e) { console.error('[supabase-mock]', e); } });
      ws.onClose(() => this._closeClient(cid));
    });
  }

  /** REST: POST /realtime/v1/api/broadcast (send() fallback when the socket is not joined) */
  async handleRest(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/realtime/v1/api/broadcast') && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      for (const msg of body.messages || []) this._broadcast(null, `realtime:${msg.topic}`, msg.event, msg.payload, 'rest');
      return route.fulfill({ status: 202, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    return route.fulfill({ status: 404, body: '{}' });
  }
}
