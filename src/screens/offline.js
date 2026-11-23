import { icon } from '../lib/icons.js';
import { go } from '../lib/router.js';
import { logo } from './home.js';

export default function offline(app, q) {
  app.innerHTML = `<main class="screen offline center">
    ${logo()}
    <div class="card stack offline-card">
      <span class="offline-ic">${icon('wifiOff', { size: 44 })}</span>
      <h2 class="h-lg">צריך אינטרנט כדי לשחק</h2>
      <p class="muted" style="margin:0">מרוץ ויקי טוען את הערכים ישירות מוויקיפדיה. בדקו את החיבור ונסו שוב.</p>
      <button class="btn primary" id="retry">${icon('refresh')} נסו שוב</button>
    </div>
  </main>`;
  const btn = app.querySelector('#retry');
  btn.onclick = async () => {
    btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> בודק…';
    try {
      const r = await fetch('https://he.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      go(q.next || '/', { replace: true });
    } catch {
      btn.disabled = false; btn.innerHTML = `${icon('refresh')} נסו שוב`;
      btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    }
  };
}
