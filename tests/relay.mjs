// Test relay emulating Supabase Realtime Broadcast (self:false) + Presence, so separate browser
// contexts behave like separate devices. Usage: node tests/relay.mjs [port]
import { WebSocketServer } from 'ws';

export function startRelay(port = 8787) {
  const wss = new WebSocketServer({ port });
  const rooms = new Map(); // room -> Map(ws -> meta)
  const presence = (room) => {
    const m = rooms.get(room); if (!m) return;
    const list = [...m.values()];
    for (const ws of m.keys()) ws.readyState === 1 && ws.send(JSON.stringify({ op: 'presence', list }));
  };
  wss.on('connection', (ws) => {
    let room = null;
    ws.on('message', (buf) => {
      const m = JSON.parse(buf);
      if (m.op === 'join') { room = m.room; if (!rooms.has(room)) rooms.set(room, new Map()); rooms.get(room).set(ws, m.meta); presence(room); }
      else if (m.op === 'track' && room) { rooms.get(room).set(ws, m.meta); presence(room); }
      else if (m.op === 'msg' && room) {
        for (const other of rooms.get(room).keys()) if (other !== ws && other.readyState === 1) other.send(JSON.stringify({ op: 'msg', payload: m.payload }));
      }
    });
    ws.on('close', () => { if (room && rooms.get(room)) { rooms.get(room).delete(ws); presence(room); } });
  });
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRelay(Number(process.argv[2]) || 8787);
  console.log('relay listening');
}
