import { SITE_URL } from '../config.js';
import { fmtTime, clicksLabel } from './dom.js';
import { MODES } from './modes.js';
import { openExternal } from './platform.js';
import { openOverlay, toast } from './ui.js';
import { icon } from './icons.js';

/** Wordle-style route: node symbols, no titles */
export function routeSymbols(path, status) {
  const nodes = path.map((p, i) => (i === 0 ? '●' : p.back ? '◌' : '○'));
  if (status === 'finished') nodes[nodes.length - 1] = '◉';
  else if (status === 'dq') nodes[nodes.length - 1] = '⊗';
  else nodes.push('✕');
  return nodes.join('━');
}

export function shareText(r, { title } = {}) {
  const lines = [];
  const date = r.date ? r.date.split('-').reverse().join('.') : '';
  lines.push(title || (r.kind === 'daily' ? `מרוץ ויקי · אתגר יומי ${date}` : r.kind === 'campaign' ? `מרוץ ויקי · שלב ${r.levelId}` : `מרוץ ויקי · ${MODES[r.mode]?.name || ''}`));
  lines.push(routeSymbols(r.path || [], r.status));
  if (r.status === 'finished') {
    let l = `הגעתי ב־${clicksLabel(r.clicks)}`;
    if (r.par) l += ` (הקצר ביותר: ${r.par})`;
    l += ` · ${fmtTime(r.elapsed)}`;
    if (r.stars) l += ` · ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}`;
    lines.push(l);
  } else {
    lines.push({ gaveup: 'הפעם ויתרתי', failed: 'נגמרו לי הצעדים', dq: 'נפסלתי בערך האסור', timeout: 'נגמר לי הזמן' }[r.status] || 'לא הגעתי הפעם');
  }
  if (r.kind !== 'daily' && r.kind !== 'campaign') lines.push(`מ־${r.start} אל ${r.target}`);
  lines.push(SITE_URL);
  return lines.join('\n');
}

export async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const o = openOverlay(`<h2 class="h-md" style="margin-bottom:12px">שיתוף תוצאה</h2>
    <pre class="share-pre">${text.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</pre>
    <div class="stack">
      <button class="btn primary" data-act="wa">${icon('whatsapp')} שליחה בוואטסאפ</button>
      <button class="btn" data-act="copy">${icon('copy')} העתקה</button>
    </div>`);
  o.node.querySelector('[data-act="wa"]').onclick = () => { openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`); o.close(); };
  o.node.querySelector('[data-act="copy"]').onclick = async () => { await copyText(text); toast('הועתק'); o.close(); };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove(); return true;
  }
}
