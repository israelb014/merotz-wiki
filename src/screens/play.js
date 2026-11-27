import { icon, avatarBadge } from '../lib/icons.js';
import { esc, on, ring, setRing, fmtTime, clicksLabel } from '../lib/dom.js';
import { go, currentRoute } from '../lib/router.js';
import { openOverlay, confirmDialog, toast, closeTop, overlayOpen } from '../lib/ui.js';
import { fetchArticle, fetchSummary, articleUrl, OfflineError, sameTitle } from '../lib/wiki.js';
import { MODES, STATUS_LABEL } from '../lib/modes.js';
import { play as sfx } from '../lib/sound.js';
import { vibrate } from '../lib/haptics.js';
import { ctx, recordResult } from '../app.js';
import { saveActiveGame } from '../lib/room.js';
import { openExternal } from '../lib/platform.js';

// exposed for the hardware back button
export const gameApi = { onBack: null };

export default function playScreen(app) {
  const g = ctx.session;
  const room = ctx.room && g?.kind === 'mp' ? ctx.room : null;
  if (!g) { go('/', { replace: true }); return; }
  const mode = MODES[g.settings.mode];
  const timed = !!g.limit;

  app.innerHTML = `<main class="screen play flush">
    <div class="play-top">
      <div class="hud">
        <button class="pill target-pill" id="peek" aria-label="הצצה בערך היעד">${icon('target', { size: 22 })}<span>יעד: <b>${esc(g.target)}</b></span></button>
        <div class="hud-ring" id="hud-ring"></div>
        <div class="pill clicks-pill" id="clicks" aria-live="polite"></div>
      </div>
      ${room ? `<div class="players-strip" id="strip"></div>` : ''}
      ${g.forbidden ? `<div class="forbid-pill">${icon('ban', { size: 18 })} אסור: <b>${esc(g.forbidden)}</b></div>` : ''}
      <div class="crumbs" id="crumbs" aria-label="המסלול שלך"></div>
    </div>
    <section class="article-shell">
      <article class="card article" id="article" lang="he" dir="rtl">
        <header class="article-head"><h1 id="art-title"></h1><button class="icon-btn" id="art-menu" aria-label="אפשרויות ערך">${icon('dots')}</button></header>
        <div class="article-body" id="art-body"></div>
      </article>
    </section>
    <div class="findbar" id="findbar" hidden>
      <input class="input" id="find-in" placeholder="חיפוש בערך…" enterkeyhint="search" autocomplete="off">
      <span class="find-count num" id="find-count"></span>
      <button class="icon-btn" id="find-prev" aria-label="הקודם">${icon('chevronUp')}</button>
      <button class="icon-btn" id="find-next" aria-label="הבא">${icon('chevronDown')}</button>
      <button class="icon-btn" id="find-close" aria-label="סגירת חיפוש">${icon('close')}</button>
    </div>
    <nav class="bottombar" aria-label="פעולות משחק">
      <button class="bb" id="b-back" ${g.settings.allowBack ? '' : 'hidden'}>${icon('arrowRight', { size: 24 })}<span>חזרה</span><i class="plus1">+1</i></button>
      <button class="bb" id="b-find" ${g.settings.allowFind ? '' : 'hidden'}>${icon('search', { size: 24 })}<span>חיפוש בערך</span></button>
      <button class="bb" id="b-quit">${icon('flag', { size: 24 })}<span>פרישה</span></button>
    </nav>
  </main>`;

  const $ = (s) => app.querySelector(s);
  const body = $('#art-body');
  let loadingTitle = null;
  let ended = false;
  let alive = true;

  // ---------- HUD ----------
  const hudRing = $('#hud-ring');
  if (timed) hudRing.innerHTML = ring({ size: 92, stroke: 7, pct: 1, inner: `<span class="num hud-time" id="hud-time">--:--</span>` });
  else if (mode.maxClicks) hudRing.innerHTML = ring({ size: 92, stroke: 7, pct: 1, inner: `<span class="num hud-time" id="hud-time"></span><span class="hud-sub">צעדים</span>` });
  else hudRing.innerHTML = ring({ size: 92, stroke: 7, pct: 0, inner: `<span class="num hud-time" id="hud-time">0</span><span class="hud-sub">קליקים</span>`, cls: 'calm' });

  const updateHud = () => {
    $('#clicks').innerHTML = `<b class="num">${g.clicks}</b> קליקים`;
    $('#b-back').disabled = !g.canBack;
    const r = hudRing.querySelector('.ring'), t = $('#hud-time');
    if (timed) {
      const rem = g.remaining();
      t.textContent = fmtTime(rem);
      setRing(r, rem / g.limit);
      r.classList.toggle('warn', rem < 60000 && rem >= 20000);
      r.classList.toggle('danger', rem < 20000);
    } else if (mode.maxClicks) {
      t.textContent = `${g.clicks}/${mode.maxClicks}`;
      setRing(r, 1 - g.clicks / mode.maxClicks);
      r.classList.toggle('danger', g.clicksLeft <= 1);
    } else {
      t.textContent = g.clicks;
      setRing(r, Math.min(1, g.clicks / 10));
    }
  };

  const renderCrumbs = () => {
    const items = g.path.map((p, i) => ({ ...p, i }));
    const cur = items.length - 1;
    $('#crumbs').innerHTML = `<div class="crumbs-track">${items.reverse().map((p) => `<span class="crumb ${p.i === cur ? 'cur' : ''} ${p.back ? 'back' : ''}">${p.i === cur ? '<i class="dot"></i>' : ''}${esc(p.t)}</span>`).join('<span class="crumb-edge"></span>')}<span class="crumb-edge tail"></span></div>`;
    $('#crumbs').scrollTo({ left: 0, behavior: 'smooth' });
  };

  // ---------- players strip (MP) ----------
  const renderStrip = () => {
    if (!room) return;
    const el = $('#strip');
    if (!el) return;
    el.innerHTML = room.round.players.map((p) => {
      const pr = p.id === room.me.id ? g.progress() : room.progress[p.id];
      const st = pr?.status || 'playing';
      const absent = room.absentSince[p.id];
      const badge = st === 'finished' ? `<i class="pb ok">${icon('check', { size: 12, sw: 3 })}</i>` : st !== 'playing' ? `<i class="pb bad">${icon('close', { size: 11, sw: 3 })}</i>` : `<i class="pb num">${pr?.clicks ?? 0}</i>`;
      return `<span class="ps ${p.id === room.me.id ? 'me' : ''} ${absent ? 'absent' : ''}" title="${esc(p.name)} · ${STATUS_LABEL[st]}">${avatarBadge(p, 42)}${badge}</span>`;
    }).join('');
  };

  // ---------- article ----------
  async function show(title, { scroll = true } = {}) {
    loadingTitle = title;
    $('#art-title').textContent = title;
    body.classList.add('loading');
    if (!body.innerHTML) body.innerHTML = skeleton();
    try {
      const a = await fetchArticle(title);
      if (!alive || loadingTitle !== title) return;
      body.innerHTML = a.html;
      body.classList.remove('loading');
      if (scroll) { $('#article').scrollIntoView?.({ block: 'start' }); window.scrollTo({ top: 0 }); }
      decorateLinks();
      if (findOpen) runFind();
    } catch (e) {
      if (!alive) return;
      body.classList.remove('loading');
      body.innerHTML = `<div class="art-error">${icon(e instanceof OfflineError ? 'wifiOff' : 'info', { size: 36 })}<p>${e instanceof OfflineError ? 'אין חיבור לאינטרנט' : 'לא הצלחנו לטעון את הערך'}</p><button class="btn sm primary" id="retry">${icon('refresh')} נסו שוב</button></div>`;
      body.querySelector('#retry').onclick = () => show(title);
    }
  }
  const skeleton = () => `<div class="art-skel">${'<span class="skeleton"></span>'.repeat(9)}</div>`;

  function decorateLinks() {
    const disabled = !g.canMove;
    body.classList.toggle('links-off', disabled);
  }

  // link clicks
  on(body, 'click', 'a', async (e, a) => {
    e.preventDefault();
    if (a.classList.contains('anchor')) {
      const id = a.dataset.anchor;
      const tgt = id && (body.querySelector(`[id="${CSS.escape(id)}"]`) || body.querySelector(`[id="${CSS.escape(decodeURIComponent(id))}"]`));
      tgt?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!a.classList.contains('wl') || ended) return;
    if (!g.canMove) { toast('אין יותר קליקים'); return; }
    a.classList.add('pending');
    sfx('click'); vibrate('light');
    const res = await g.navigate(a.dataset.t);
    a.classList.remove('pending');
    if (!alive) return;
    if (res.event === 'missing') { toast('הערך הזה לא קיים'); return; }
    if (res.event === 'same') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!res.ok) return;
    afterMove();
    if (!alive) return;
    if (res.event === 'move') show(res.title);
    else end(res.event, res.title);
  });

  const roundId = g.meta?.roundId;
  function afterMove() {
    if (room) { room.sendProgress(g.progress(), roundId); saveActiveGame(room.code, roundId, g.snapshot()); }
    if (!alive) return;
    updateHud(); renderCrumbs(); renderStrip();
  }

  // ---------- back ----------
  function doBack() {
    if (ended) return false;
    if (!g.settings.allowBack) return false;
    if (!g.canBack) { toast(g.stack.length > 1 ? 'אין יותר קליקים' : 'זה ערך ההתחלה'); return true; }
    const t = g.back();
    if (!t) return true;
    sfx('back'); vibrate('light');
    afterMove();
    if (!alive) return true;
    if (g.status === 'failed') { end('failed'); return true; }
    show(t);
    return true;
  }
  $('#b-back').onclick = doBack;
  gameApi.onBack = () => {
    if (overlayOpen()) { closeTop(); return true; }
    if (findOpen) { closeFind(); return true; }
    if (ended) return false;
    if (g.settings.allowBack && g.canBack) { doBack(); return true; }
    quit();
    return true;
  };

  // ---------- give up ----------
  async function quit() {
    if (ended) return;
    if (await confirmDialog({ title: 'לפרוש מהמשחק?', text: 'התוצאה תסומן כ"ויתר".', ok: 'כן, אני פורש', cancel: 'ממשיכים לשחק', danger: true })) {
      if (ended || !alive) return;
      g.giveUp(); afterMove(); if (alive) end('gaveup');
    }
  }
  $('#b-quit').onclick = quit;

  // ---------- peek ----------
  $('#peek').onclick = () => peekTarget(g.target);

  // ---------- article menu ----------
  $('#art-menu').onclick = () => {
    const t = g.current;
    const o = openOverlay(`<h2 class="h-md" style="margin-bottom:10px">${esc(t)}</h2>
      <div class="list">
        <button class="list-row" data-act="wiki"><span class="ic-wrap">${icon('external')}</span><span class="lbl">פתיחת הערך בוויקיפדיה<span class="sub">he.wikipedia.org</span></span></button>
        <div class="list-row"><span class="ic-wrap">${icon('info')}</span><span class="lbl">התוכן מוויקיפדיה העברית<span class="sub">ברישיון CC BY-SA 4.0 · הכותבים: עורכי ויקיפדיה</span></span></div>
      </div>`);
    o.node.querySelector('[data-act="wiki"]').onclick = () => { openExternal(articleUrl(t)); o.close(); };
  };

  // ---------- find in article ----------
  let findOpen = false, hits = [], hitIdx = 0;
  const findbar = $('#findbar'), findIn = $('#find-in');
  function openFind() {
    if (!g.settings.allowFind || ended) return;
    findOpen = true; findbar.hidden = false; findIn.focus(); findIn.select();
  }
  function closeFind() { findOpen = false; findbar.hidden = true; clearMarks(); const fc = $('#find-count'); if (fc) fc.textContent = ''; }
  function clearMarks() {
    body.querySelectorAll('mark.fm').forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    body.normalize(); hits = [];
  }
  function runFind() {
    clearMarks();
    const q = findIn.value.trim();
    if (q.length < 2) { $('#find-count').textContent = ''; return; }
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('details:not([open])') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const ql = q.toLowerCase();
    for (const n of nodes) {
      const txt = n.nodeValue; const low = txt.toLowerCase();
      let i = low.indexOf(ql); if (i < 0) continue;
      const frag = document.createDocumentFragment(); let last = 0;
      while (i >= 0) {
        frag.append(txt.slice(last, i));
        const m = document.createElement('mark'); m.className = 'fm'; m.textContent = txt.slice(i, i + q.length);
        frag.append(m); hits.push(m); last = i + q.length; i = low.indexOf(ql, last);
      }
      frag.append(txt.slice(last));
      n.replaceWith(frag);
    }
    hitIdx = 0; focusHit();
  }
  function focusHit() {
    $('#find-count').textContent = hits.length ? `${hitIdx + 1}/${hits.length}` : '0';
    hits.forEach((h, i) => h.classList.toggle('cur', i === hitIdx));
    hits[hitIdx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  let findTimer;
  findIn.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 180); });
  findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits.length) { hitIdx = (hitIdx + (e.shiftKey ? hits.length - 1 : 1)) % hits.length; focusHit(); } } if (e.key === 'Escape') closeFind(); });
  $('#find-next').onclick = () => { if (hits.length) { hitIdx = (hitIdx + 1) % hits.length; focusHit(); } };
  $('#find-prev').onclick = () => { if (hits.length) { hitIdx = (hitIdx + hits.length - 1) % hits.length; focusHit(); } };
  $('#find-close').onclick = closeFind;
  $('#b-find').onclick = () => (findOpen ? closeFind() : openFind());
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); if (g.settings.allowFind) openFind(); }
    if (e.altKey && e.key === 'ArrowRight' || e.key === 'BrowserBack') { e.preventDefault(); doBack(); }
  };
  window.addEventListener('keydown', onKey);

  // ---------- timer ----------
  const tick = () => {
    if (!alive || ended) return;
    if (g.tick()) { afterMove(); if (alive) end('timeout'); return; }
    if (timed) updateHud();
  };
  const timerId = setInterval(tick, 250);
  const progressBeat = room ? setInterval(() => room.sendProgress(g.progress(), roundId), 3000) : null;
  const offRoom = room?.on((type) => { if (type === 'progress' || type === 'presence' || type === 'change') renderStrip(); });

  // ---------- end ----------
  async function end(event, title) {
    if (ended || !alive) return;
    ended = true;
    clearInterval(timerId);
    closeFind();
    body.classList.add('links-off');
    const won = event === 'arrived';
    sfx(won ? 'win' : 'fail'); vibrate(won ? 'success' : 'error');
    const msg = { arrived: 'הגעת ליעד!', dq: 'נכנסת לערך האסור', failed: 'נגמרו הצעדים', timeout: 'נגמר הזמן', gaveup: 'פרשת מהמשחק' }[event] || '';
    const overlay = document.createElement('div');
    overlay.className = `end-flash ${won ? 'win' : 'lose'}`;
    overlay.innerHTML = `<div class="end-card">${icon(won ? 'trophy' : event === 'dq' ? 'ban' : event === 'timeout' ? 'clock' : 'flag', { size: 46 })}<b>${msg}</b>${won ? `<span>${clicksLabel(g.clicks)} · ${fmtTime(g.elapsed())}</span>` : ''}</div>`;
    app.appendChild(overlay);
    const stillHere = () => alive && currentRoute()?.path === '/play';
    if (room) {
      // keep the final snapshot so a reload/rejoin can't replay this round; results are recorded on the results screen
      room.sendProgress(g.progress(), roundId);
      saveActiveGame(room.code, roundId, g.snapshot());
      setTimeout(() => stillHere() && ctx.session === g && go('/results', { replace: true }), 1500);
    } else {
      await recordResult(g);
      setTimeout(() => stillHere() && go('/results', { replace: true }), 1500);
    }
  }

  // ---------- init ----------
  updateHud(); renderCrumbs(); renderStrip();
  show(g.current, { scroll: false });
  if (g.status !== 'playing') end(g.status === 'finished' ? 'arrived' : g.status);
  if (room) { room.sendProgress(g.progress(), roundId); saveActiveGame(room.code, roundId, g.snapshot()); }

  return () => {
    alive = false;
    clearInterval(timerId); clearInterval(progressBeat);
    offRoom?.();
    window.removeEventListener('keydown', onKey);
    gameApi.onBack = null;
  };
}

export async function peekTarget(title) {
  const o = openOverlay(`<div class="peek">
    <span class="peek-badge">${icon('route', { size: 18 })} ערך היעד שלך</span>
    <div class="peek-img skeleton"></div>
    <h2 class="peek-title">${esc(title)}</h2>
    <p class="peek-text"><span class="skeleton" style="display:block;height:16px;margin:8px 0"></span><span class="skeleton" style="display:block;height:16px;width:80%"></span></p>
    <button class="btn primary rect" data-close>המשך</button>
  </div>`, { cls: 'peek-sheet' });
  try {
    const s = await fetchSummary(title);
    const img = o.node.querySelector('.peek-img');
    if (s.image || s.thumb) { img.classList.remove('skeleton'); img.innerHTML = `<img src="${esc(s.thumb && s.image && s.image.length > 400 ? s.thumb : s.image || s.thumb)}" alt="">`; }
    else img.remove();
    o.node.querySelector('.peek-text').textContent = s.extract || s.description || '';
  } catch {
    o.node.querySelector('.peek-text').textContent = 'לא הצלחנו לטעון את התקציר';
    o.node.querySelector('.peek-img')?.remove();
  }
}
