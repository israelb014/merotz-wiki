// Navigates between lobby / pregame / results when the host changes the room phase.
import { go, currentRoute } from './lib/router.js';
import { toast } from './lib/ui.js';
import { ctx } from './app.js';

const attached = new WeakSet();
export function attachRoom(room) {
  if (attached.has(room)) return;
  attached.add(room);
  room.on((type, data) => {
    if (ctx.room !== room) return;
    const path = currentRoute()?.path;
    if (type === 'phase') {
      if (data === 'playing' && room.inRound) {
        if (path !== '/pregame' && path !== '/play') { ctx.session = null; ctx.pending = null; go('/pregame', { replace: path === '/results' }); }
        else if (path === '/play' && ctx.session?.meta?.roundId !== room.round.id) { ctx.session = null; ctx.pending = null; go('/pregame', { replace: true }); }
      } else if (data === 'results') {
        if (path === '/play' && ctx.session?.status === 'playing') {
          // time is up on host side – end locally
          ctx.session.timeout();
        }
        if (ctx.session?.kind === 'mp' && path !== '/results') go('/results', { replace: true });
      } else if (data === 'lobby') {
        if (path !== '/room' && path !== '/modes' && path !== '/setup') go('/room', { replace: true, query: { code: room.code } });
      }
    } else if (type === 'full') {
      room.leave().then(() => { if (ctx.room === room) ctx.room = null; go('/room', { replace: true, query: { code: room.code, full: '1' } }); });
    } else if (type === 'host-changed') {
      if (room.isHost) toast('המארח יצא – עכשיו את/ה המארח/ת');
      else toast('המארח התחלף');
    }
  });
}
