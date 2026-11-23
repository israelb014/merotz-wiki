import { icon, avatarBadge, colorHex } from '../lib/icons.js';
import { esc, on } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { appBar, confirmDialog, toast } from '../lib/ui.js';
import { MODES, catName, diffName, STATUS_LABEL } from '../lib/modes.js';
import { MAX_PLAYERS, SITE_URL } from '../config.js';
import { Room } from '../lib/room.js';
import { state } from '../lib/store.js';
import { ctx } from '../app.js';
import { copyText } from '../lib/share.js';
import { openExternal } from '../lib/platform.js';
import { play } from '../lib/sound.js';
import { attachRoom } from '../room-coordinator.js';
import { transportKind } from '../lib/transport.js';

export const inviteUrl = (code) => `${SITE_URL}?room=${code}`;

export default async function lobby(app, q) {
  const code = q.code;
  if (!/^\d{4}$/.test(code || '')) { go('/', { replace: true }); return; }

  if (!ctx.room || ctx.room.code !== code) {
    if (ctx.room) { await ctx.room.leave(); ctx.room = null; }
    app.innerHTML = `<main class="screen">${appBar({ title: 'חדר משחק', navy: true })}<div class="center mt-l"><div class="spinner"></div><p class="muted">מתחבר לחדר ${esc(code)}…</p></div></main>`;
    app.querySelector('[data-back]').onclick = () => go('/', { replace: true });
    const room = new Room({ code, profile: state.profile, create: q.create === '1' });
    room.defaultSettings = { allowBack: state.settings.allowBack, allowFind: state.settings.allowFind };
    try {
      await room.connect();
    } catch (e) {
      const msg = e.message === 'full' ? 'החדר מלא' : e.message === 'notfound' ? 'החדר לא נמצא' : 'לא הצלחנו להתחבר לחדר';
      const sub = e.message === 'full' ? `בחדר כבר ${MAX_PLAYERS} שחקנים.` : e.message === 'notfound' ? 'בדקו את הקוד ונסו שוב, או פתחו חדר חדש.' : 'בדקו את החיבור לאינטרנט ונסו שוב.';
      if (!app.isConnected) return;
      app.innerHTML = `<main class="screen">${appBar({ title: 'חדר משחק', navy: true })}
        <div class="card center stack mt-l room-error">${icon(e.message === 'full' ? 'users' : 'info', { size: 44 })}<h2 class="h-lg">${msg}</h2><p class="muted" style="margin:0">${sub}</p>
        <button class="btn primary" data-go="/join">${icon('keyboard')} קוד אחר</button><button class="btn" data-go="/">${icon('home')} לתפריט</button></div></main>`;
      on(app, 'click', '[data-go]', (ev, t) => go(t.dataset.go, { replace: true }));
      app.querySelector('[data-back]').onclick = () => go('/', { replace: true });
      return;
    }
    if (!app.isConnected) { /* navigated away while connecting */ }
    ctx.room = room;
    attachRoom(room);
    // already in a running round (reconnect)?
    if (room.phase === 'playing' && room.inRound) { go('/pregame', { replace: true }); return; }
    if (room.phase === 'results' && room.inRound) { /* show lobby; results only for participants with session */ }
  }
  const room = ctx.room;

  const render = () => {
    if (!app.isConnected) return;
    const st = room.state;
    const s = room.settings;
    const players = room.players;
    const isHost = room.isHost;
    const midRound = room.phase === 'playing' && !room.inRound;
    const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => players[i] || null);
    app.innerHTML = `<main class="screen lobby">
      ${appBar({ title: 'חדר משחק', navy: true, backLabel: 'יציאה מהחדר' })}
      <section class="card code-card">
        <div class="code-big num ltr" aria-label="קוד חדר ${code}">${code}</div>
        <svg class="code-deco" viewBox="0 0 200 40" fill="none" aria-hidden="true"><path d="M10 30h70m40-18 30 14 25-12 25 8" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"/><circle cx="80" cy="30" r="4" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/><circle cx="150" cy="26" r="3" fill="var(--card)" stroke="var(--ink-3)" stroke-width="1.5"/><circle cx="175" cy="14" r="3" fill="var(--card)" stroke="var(--ink-3)" stroke-width="1.5"/></svg>
        <div class="code-actions">
          <button class="btn sm rect" id="wa">${icon('whatsapp', { size: 20 })} שתף בוואטסאפ</button>
          <button class="btn sm rect" id="copy">${icon('copy', { size: 20 })} העתק קוד</button>
        </div>
        ${transportKind() === 'local' ? '<p class="muted small center" style="margin:8px 0 0">מצב בדיקה מקומי</p>' : ''}
      </section>
      ${midRound ? `<div class="banner">${icon('hourglass')} סיבוב בעיצומו – תצטרפו אוטומטית לסיבוב הבא</div>` : ''}
      <section class="slots" aria-label="שחקנים">
        ${slots.map((p, i) => p ? `<div class="slot filled" style="--pc:${colorHex(p.color)}">
            <span class="slot-name">${p.id === room.hostId ? `${icon('crown', { size: 20 })} ` : ''}${esc(p.name)}${p.id === room.me.id ? ' <small>(את/ה)</small>' : ''}${midRound && room.round?.players.some((x) => x.id === p.id) ? ` <small>· ${STATUS_LABEL[room.progress[p.id]?.status || 'playing']}</small>` : ''}</span>
            ${avatarBadge(p, 46, 'slot-av')}<b class="slot-num num">${i + 1}</b>
          </div>` : `<div class="slot empty"><span class="slot-name">ממתין...</span><b class="slot-num num">${i + 1}</b></div>`).join('')}
      </section>
      <button class="card settings-card ${isHost ? 'editable' : ''}" id="settings" ${isHost ? '' : 'tabindex="-1"'}>
        <span class="settings-title">הגדרות${isHost ? ` <span class="muted small">· לחצו לשינוי</span>` : ''}</span>
        <span class="settings-chips">
          <span class="tag">${MODES[s.mode].name}${s.mode === 'clock' ? ` · ${s.timeLimit} דק׳` : ''}</span>
          ${s.customStart && s.customTarget ? `<span class="tag">${esc(s.customStart)} ← ${esc(s.customTarget)}</span>` : `<span class="tag">${catName(s.category)}</span><span class="tag">${diffName(s.difficulty)}</span>`}
        </span>
        <span class="settings-rules muted small">${s.allowBack ? 'חזרה מותרת (+1)' : 'בלי חזרה'} · ${s.allowFind ? 'חיפוש בערך מותר' : 'בלי חיפוש בערך'}</span>
      </button>
      ${st?.msg ? `<p class="center muted">${esc(st.msg)}</p>` : ''}
      <div class="sticky-cta">
        ${isHost ? `<button class="btn primary rect" id="start" ${room.busy || midRound ? 'disabled' : ''}>${room.busy ? '<span class="spinner sm"></span> בוחר זוג…' : 'התחל'}</button>`
          : `<button class="btn primary rect" disabled>${midRound ? 'ממתינים לסוף הסיבוב…' : 'ממתינים שהמארח יתחיל…'}</button>`}
      </div>
    </main>`;
    app.querySelector('[data-back]').onclick = leave;
    app.querySelector('#copy').onclick = async () => { await copyText(`${code}\n${inviteUrl(code)}`); toast('הקוד והקישור הועתקו'); };
    app.querySelector('#wa').onclick = () => openExternal(`https://wa.me/?text=${encodeURIComponent(`בואו לשחק איתי מרוץ ויקי! קוד החדר: ${code}\n${inviteUrl(code)}`)}`);
    if (isHost) {
      app.querySelector('#settings').onclick = () => { ctx.roomSettingsDraft = { ...room.settings }; go('/modes', { query: { ctx: 'room' } }); };
      const start = app.querySelector('#start');
      if (start) start.onclick = async () => {
        try { await room.startRound(); } catch (e) { toast(e.message || 'שגיאה בבחירת זוג'); render(); }
      };
    }
  };

  async function leave() {
    if (await confirmDialog({ title: 'לצאת מהחדר?', text: room.isHost && room.players.length > 1 ? 'מישהו אחר יהפוך למארח.' : '', ok: 'יציאה', danger: true })) {
      await room.leave(); ctx.room = null; go('/', { replace: true });
    }
  }

  const off = room.on((type, data) => {
    if (type === 'joined') play('join');
    if (['change', 'presence', 'progress', 'status'].includes(type)) render();
  });
  render();
  return () => off();
}
