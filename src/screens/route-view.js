import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

/** Horizontal colored node-path with labels (RTL: start on the right) */
export function routeLine(path, color = 'var(--primary)', { labels = true, status = 'finished' } = {}) {
  if (!path?.length) return `<div class="route-empty muted small">המסלול יופיע בעוד רגע…</div>`;
  const last = path.length - 1;
  return `<div class="rl" style="--rc:${color}">${path.map((p, i) => `
    ${i ? `<span class="rl-e ${p.back ? 'back' : ''}"></span>` : ''}
    <span class="rl-n ${i === last && status !== 'finished' ? 'bad' : ''} ${p.back ? 'back' : ''}">
      <i></i>${labels ? `<em>${esc(p.t)}</em>` : ''}
    </span>`).join('')}</div>`;
}

/** Vertical route list (history detail / solo results) */
export function routeVertical(path, { target, status, forbidden } = {}) {
  const last = path.length - 1;
  return `<ol class="rv">${path.map((p, i) => {
    const cls = i === 0 ? 'start' : i === last && status === 'finished' ? 'end' : i === last && status === 'dq' ? 'dq' : '';
    return `<li class="${cls} ${p.back ? 'back' : ''}"><i></i><span>${esc(p.t)}</span>${p.back ? `<small>${icon('arrowRight', { size: 14 })} חזרה</small>` : ''}${i === 0 ? '<small>התחלה</small>' : ''}${cls === 'end' ? '<small>יעד</small>' : ''}${cls === 'dq' ? '<small>ערך אסור</small>' : ''}</li>`;
  }).join('')}${status !== 'finished' && status !== 'dq' && target ? `<li class="missed"><i></i><span>${esc(target)}</span><small>היעד</small></li>` : ''}</ol>`;
}
