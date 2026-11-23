import '@fontsource-variable/heebo/wght.css';
import '@fontsource/frank-ruhl-libre/hebrew-900.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/download.css';
import { icon } from './lib/icons.js';
import { logo } from './screens/home.js';
import { ASSET, REPO, RELEASES_URL } from './config.js';

const t = localStorage.getItem('mw-theme-hint');
const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme = dark ? 'dark' : 'light';

document.querySelector('.dl-logo').innerHTML = logo();
const ua = navigator.userAgent;
const guess = /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Linux/i.test(ua) ? 'linux' : 'web';
const items = [
  { id: 'windows', name: 'Windows', sub: 'מתקין ‎.exe · Windows 10/11', ic: 'windows', href: ASSET.exe },
  { id: 'linux', name: 'Linux', sub: '‎.deb או AppImage', ic: 'linux', href: ASSET.deb, alt: { label: 'AppImage', href: ASSET.appimage } },
  { id: 'android', name: 'Android', sub: 'קובץ APK · אנדרואיד 7 ומעלה', ic: 'android', href: ASSET.apk },
  { id: 'web', name: 'שחק בדפדפן', sub: 'בלי התקנה, מכל מכשיר', ic: 'browser', href: '../' },
];
items.sort((a, b) => (b.id === guess) - (a.id === guess));
document.getElementById('dl-grid').innerHTML = items.map((i) => `
  <div class="dl-item ${i.id === guess ? 'rec' : ''}">
    <a class="dl-btn ${i.id === guess ? 'primary' : ''}" href="${i.href}" data-id="${i.id}">
      <span class="dl-ic">${icon(i.ic, { size: 34 })}</span>
      <span class="dl-txt"><b>${i.name}</b><span>${i.sub}</span></span>
      ${icon(i.id === 'web' ? 'arrowUpLeft' : 'download', { size: 24 })}
    </a>
    ${i.alt ? `<a class="dl-alt" href="${i.alt.href}">${icon('download', { size: 16 })} ${i.alt.label}</a>` : ''}
    ${i.id === guess ? '<span class="dl-rec">מומלץ למכשיר שלך</span>' : ''}
  </div>`).join('');

fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => r.ok && r.json()).then((rel) => {
  if (!rel?.tag_name) return;
  const assets = Object.fromEntries((rel.assets || []).map((a) => [a.name, a]));
  const size = (n) => (assets[n] ? ` · ${(assets[n].size / 1048576).toFixed(0)}MB` : '');
  document.getElementById('dl-ver').innerHTML = `גרסה אחרונה: <b class="ltr">${rel.tag_name}</b> · <a href="${RELEASES_URL}">כל הקבצים</a>`;
  for (const [id, n] of [['windows', 'merotz-wiki-setup.exe'], ['linux', 'merotz-wiki.deb'], ['android', 'merotz-wiki.apk']]) {
    const s = document.querySelector(`[data-id="${id}"] .dl-txt span`);
    if (s) s.textContent += size(n);
  }
}).catch(() => {});
