// One-off generator for tests/fixtures/wiki.json.gz – a saved copy of ~50 linked Hebrew Wikipedia pages
// (Parsoid HTML, as served by the REST /page/html endpoint) used by the Wikipedia mock in tests.
// Uses the cached page views (/wiki/X?useparsoid=1 and action=raw), slowly, with a descriptive UA.
// Usage: node scripts/qa/fetch-wiki-fixtures.mjs
import { parseHTML } from 'linkedom';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const UA = 'MerotzWikiQA/1.0 (test fixtures for github.com/israelb014/merotz-wiki)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (t) => encodeURIComponent(t.replace(/ /g, '_'));

const PAGES = [
  // food cluster (campaign 1-1: חומוס → טחינה → שוקולד)
  'חומוס', 'טחינה', 'שומשום', 'שוקולד', 'פלאפל', 'חמצה', 'קטניות', 'פיתה', 'שמן זית', 'לימון', 'שום', 'קקאו', 'סוכר',
  'חלב', 'גבינה', 'קפה', 'תה', 'אורז', 'חיטה', 'לחם', 'אבו גוש',
  // places / hubs (ישראל and ארצות הברית are the "huge" pages)
  'ישראל', 'ארצות הברית', 'ירושלים', 'תל אביב-יפו', 'מצרים', 'לבנון', 'סוריה', 'טורקיה', 'יוון', 'איטליה', 'צרפת', 'גרמניה',
  'הממלכה המאוחדת', 'רוסיה', 'סין', 'אירופה', 'המזרח התיכון', 'הים התיכון',
  // people / culture / science
  'יהודים', 'עברית', 'אנגלית', 'מלחמת העולם השנייה', 'האימפריה הרומית', 'מכניקת הקוונטים', 'פיזיקה', 'אלברט איינשטיין',
  'ניו יורק סיטי', 'מדע', 'מתמטיקה',
];
const REDIRECTS = ['ארה"ב', 'תל אביב', 'בריטניה', 'איינשטיין'];
const DISAMBIG = ['ירדן (פירושונים)', 'מרקורי'];
const MISSING = ['ערך שלא קיים בכלל 12345'];

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
    return r;
  }
  throw new Error('rate limited: ' + url);
}

function extract(html, title) {
  const { document } = parseHTML(html);
  const po = document.querySelector('.mw-parser-output');
  if (!po) throw new Error('no parser output for ' + title);
  po.querySelectorAll('.mw-editsection, .printfooter, #catlinks, script, noscript').forEach((n) => n.remove());
  for (const n of po.querySelectorAll('[id^="mw"]')) if (/^mw[A-Za-z0-9_-]{1,4}$/.test(n.getAttribute('id'))) n.removeAttribute('id');
  for (const a of po.querySelectorAll('a[href^="https://he.wikipedia.org/wiki/"]')) a.setAttribute('href', './' + a.getAttribute('href').slice('https://he.wikipedia.org/wiki/'.length));
  for (const a of po.querySelectorAll('a[href^="/wiki/"]')) a.setAttribute('href', './' + a.getAttribute('href').slice(6));
  const lead = [...po.querySelectorAll('section p, p')].map((p) => p.textContent.replace(/\[\d+\]/g, '').trim()).find((t) => t.length > 40) || '';
  const links = [...new Set([...po.querySelectorAll('a[rel~="mw:WikiLink"]')].map((a) => a.getAttribute('title')).filter(Boolean))];
  return { body: po.innerHTML, extract: lead.slice(0, 600), links };
}

const out = { generated: new Date().toISOString(), source: 'he.wikipedia.org (CC BY-SA 4.0)', pages: {}, redirects: {}, missing: [] };

async function page(title, { disambig = false } = {}) {
  const raw = await get(`https://he.wikipedia.org/w/index.php?title=${enc(title)}&action=raw`);
  if (raw.status === 404) { out.missing.push(title); console.log('missing', title); return; }
  const text = await raw.text();
  const red = text.match(/^#(?:הפניה|REDIRECT)\s*\[\[([^\]|#]+)/i);
  if (red) { out.redirects[title] = red[1].trim(); console.log('redirect', title, '→', red[1]); return; }
  await sleep(800);
  const r = await get(`https://he.wikipedia.org/wiki/${enc(title)}?useparsoid=1`);
  if (!r.ok) throw new Error(`${r.status} ${title}`);
  const e = extract(await r.text(), title);
  out.pages[title] = {
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${e.body}</body></html>`,
    extract: e.extract, disambiguation: disambig, links: e.links,
  };
  console.log('page', title, Math.round(out.pages[title].html.length / 1024) + 'KB', e.links.length, 'links');
}

for (const t of PAGES) { await page(t); await sleep(1000); }
for (const t of REDIRECTS) { await page(t); await sleep(800); }
for (const t of DISAMBIG) { await page(t, { disambig: true }); await sleep(1000); }
for (const t of MISSING) { await page(t); }
const json = JSON.stringify(out);
writeFileSync(new URL('../../tests/fixtures/wiki.json.gz', import.meta.url), gzipSync(json, { level: 9 }));
console.log('done', Object.keys(out.pages).length, 'pages', Math.round(json.length / 1024) + 'KB raw');
