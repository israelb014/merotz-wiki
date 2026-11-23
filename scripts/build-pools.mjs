#!/usr/bin/env node
// Build public/data/pools.json: per-category pools of good, recognizable Hebrew Wikipedia articles.
//
// Sources:
//   1. Wikimedia pageviews monthly top-1000 lists for the last 12 complete months.
//   2. CirrusSearch topic searches (articletopic:…, sorted by incoming links) as the candidate pool.
//   3. cirrusdoc (incoming_links, popularity_score, weighted_tags = ORES topic/country scores),
//      info (length) and pageprops (disambiguation) for every candidate.
// Classification uses the ORES topic scores (+ articlecountry/Israel), then hard title/quality filters.
//
// Usage: node scripts/build-pools.mjs [--sample N] [--no-sample]
// Resumable: raw API responses are cached in scripts/.cache/, per-title info in scripts/.cache/pageinfo.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { api, apiPages, getJSON, chunk, mapLimit, normalizeTitle, isMainNamespace, writeJSON, CACHE_DIR, ROOT_DIR, stats } from './lib/wiki.mjs';

const args = process.argv.slice(2);
const SAMPLE_N = args.includes('--no-sample') ? 0 : Number(args[args.indexOf('--sample') + 1]) || 25;
const OUT = path.join(ROOT_DIR, 'public/data/pools.json');
const INFO_FILE = path.join(CACHE_DIR, 'pageinfo.json');
const POOL_SIZE = 1500;

export const CATEGORY_NAMES = {
  random: 'אקראי',
  israel: 'ישראל',
  history: 'היסטוריה',
  science: 'מדע וטבע',
  geography: 'גאוגרפיה',
  sports: 'ספורט',
  culture: 'תרבות ובידור',
  food: 'אוכל',
};

// ------------------------------------------------------------------ candidate searches
// [query, maxResults]. All sorted by incoming links (desc). Search offset is capped at 10000.
const SEARCHES = [
  ['articletopic:food-and-drink', 10000],
  ['articletopic:sports', 10000],
  ['articletopic:geographical', 10000],
  ['articletopic:europe', 5000],
  ['articletopic:asia', 5000],
  ['articletopic:africa', 3000],
  ['articletopic:north-america', 4000],
  ['articletopic:south-america', 2000],
  ['articletopic:oceania', 2000],
  ['articletopic:east-asia', 2000],
  ['articletopic:west-asia', 10000],
  ['articletopic:history', 8000],
  ['articletopic:military-and-warfare', 6000],
  ['articletopic:politics-and-government', 4000],
  ['articletopic:biography', 6000],
  ['articletopic:biology', 6000],
  ['articletopic:chemistry', 3000],
  ['articletopic:physics', 3000],
  ['articletopic:space', 3000],
  ['articletopic:earth-and-environment', 4000],
  ['articletopic:medicine-and-health', 4000],
  ['articletopic:mathematics', 2000],
  ['articletopic:films', 5000],
  ['articletopic:music', 6000],
  ['articletopic:television', 4000],
  ['articletopic:video-games', 2000],
  ['articletopic:books', 3000],
  ['articletopic:literature', 4000],
  ['articletopic:performing-arts', 2000],
  ['articletopic:entertainment', 3000],
  ['articletopic:comics-and-anime', 1500],
  ['articletopic:visual-arts', 3000],
];

// ------------------------------------------------------------------ filters
const META_TITLES = new Set(
  [
    'WorldCat', 'IMDb', 'MusicBrainz', 'Discogs', 'SNAC', 'KinoPoisk', 'AllMusic', 'Rotten Tomatoes', 'Songkick',
    'Box Office Mojo', 'Transfermarkt', 'Metacritic', 'Find a Grave', 'Internet Archive', 'Wayback Machine', 'JSTOR',
    'Google Books', 'VIAF', 'Goodreads', 'Last.fm', 'Genius (אתר אינטרנט)', 'Soccerway', 'National Football Teams',
    'FBref', 'Basketball-Reference.com', 'Olympedia', 'Sports-Reference', 'ESPN', 'Spotify', 'Deezer', 'Apple Music',
    'iTunes', 'קואורדינטות גאוגרפיות', 'הספרייה הלאומית', 'ספריית הקונגרס', 'ויקיפדיה', 'ויקיפדיה העברית',
    'ויקיפדיה האנגלית', 'ויקינתונים', 'ויקימינים', 'ויקישיתוף', 'ויקימילון', 'ויקיציטוט', 'ויקיטקסט', 'קרן ויקימדיה',
    'מדיה ויקי', 'המרכז הלאומי למידע ביוטכנולוגי', 'האנציקלופדיה של החיים', 'קוד מזהה בין-לאומי',
    'מערכת המידע הגלובלית למגוון ביולוגי', 'הרשימה האדומה של IUCN', 'ללא חשש', 'קרוב לסיכון', 'פגיע (שימור)', 'פות', 'פין', 'דגדגן', 'אשכים',
    'מצב שימור', 'טקסון מונוטיפי', 'מספר סידורי בין-לאומי לספר', 'ISBN', 'ISSN', 'מזהה עצם דיגיטלי',
    'מערכת לאחזור מידע', 'אינדקס', 'בקרת זהויות', 'אנציקלופדיה בריטניקה', 'האנציקלופדיה העברית',
    'אנציקלופדיה יהודית', 'אנציקלופדיה ynet', 'דבר (עיתון)', 'עיתונות עברית היסטורית', 'גובה פני הים', 'אזור זמן',
    'זמן אוניברסלי מתואם', 'שעון קיץ', 'קידומת טלפון בין-לאומית', 'מספר שלם', 'קילומטר רבוע', 'צפיפות אוכלוסייה',
    'שם מדעי', 'טקסונומיה (ביולוגיה)', 'משפחה (טקסונומיה)', 'סדרה (טקסונומיה)', 'ממלכה (טקסונומיה)',
    'מערכה (טקסונומיה)', 'מחלקה (טקסונומיה)', 'מין (טקסונומיה)', 'סוג (טקסונומיה)', 'תת-מין', 'מערכת-על (טקסונומיה)',
    'הגאזט האנטארקטי המשווה SCAR', 'Ethnologue', 'ISO 639', 'ISO 3166', 'ISO 4217', 'Rate Your Music', 'TheTVDB',
    'TV.com', 'Allociné', 'Filmweb', 'Letterboxd', 'Tvmaze', 'Billboard.com', 'Spotify (חברה)', 'גוגל ספרים',
    'ארכיון האינטרנט', 'ספר הזיכרון', 'יד ושם', 'אתר הכנסת', 'פרויקט בן-יהודה', 'לקסיקון הספרות העברית החדשה',
    'Stack Overflow', 'GitHub', 'Instagram', 'אינסטגרם', 'X (רשת חברתית)', 'Ynet', 'וואלה', 'מאקו', 'nrg', 'TheMarker',
    'כלכליסט', 'גלובס', 'הארץ', 'מעריב', 'ישראל היום', 'ידיעות אחרונות', 'מקור ראשון', 'זמן ישראל', 'Mako', 'ערוץ 7',
    'וואלה!', 'nrg מעריב', 'NRG', 'בבלי', 'Haaretz', 'The Jerusalem Post', 'The Times of Israel', 'הניו יורק טיימס',
    'The New York Times', 'BBC', 'CNN', 'הגרדיאן', 'The Guardian', 'רויטרס', 'סוכנות הידיעות AP', 'Associated Press',
  ].map((t) => t),
);
// Adult / unsuitable for a family game
const UNSUITABLE_RE = /פורנו|(^|[\s(])(סקס|אונס|זנות|אוננות|ערום|ערווה)([\s)]|$)|מין אוראלי|BDSM|אורגזמה|נרתיק|דגדגן|פדופיל|זונה|מינית|מיניות|נוזל זרע|תא זרע|עוררות/;
const MONTHS_RE = '(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)';
const HEB_MONTHS_RE = '(תשרי|חשוון|חשון|מרחשוון|כסלו|כסליו|טבת|שבט|אדר|אדר א\'|אדר ב\'|ניסן|אייר|סיוון|סיון|תמוז|אב|אלול)';
const TITLE_RES = [
  /^רשימ/, /רשימת/, /רשימה של/, /\(פירושונים\)$/, /\(פירושון\)$/,
  /^-?\d[\d,.]*$/, // pure numbers
  /^\d{1,4}( לפנה"ס| לספירה| לפני הספירה)?$/, // years
  /^\d{1,4}\s*ב/, // "2013 בספורט", "1948 בישראל"
  /^\d{1,4} (לפנה"ס|לפני הספירה)/,
  /שנות ה-/, /המאה ה-/, /האלף ה-/, /^המאה /, /^שנת /, /^עשור/,
  /^ה'?\s?ת[א-ת]/, // Hebrew years: ה'תש"ח, התשפ"ה
  /^ת[א-ת]["״][א-ת]$/, // תש"ח
  new RegExp(`^\\d{1,2} ב${MONTHS_RE}$`),
  new RegExp(`^${MONTHS_RE}( \\d{4})?$`),
  new RegExp(`^[א-ת]{1,2}['"״׳]?[א-ת]? ב${HEB_MONTHS_RE}$`),
  /\d{4}[\/–-]\d{2,4}/, // seasons 2023/24, 2019–2020
  /^עונת /, / בעונת /, /\(עונה/, /עונה \d/, /^פרק /,
  /^ויקיפדיה/, /ויקי(מדיה|נתונים|מילון|שיתוף|ציטוט|טקסט|מינים)/,
  /^ISO /, /^ISBN/, /^קוד /, /^תקן /,
  /^הבחירות למועצ/, /^הבחירות המקומיות/, /^הבחירות לרשות/,
  /^\d+ \(/, // "13 (סרט)"
  /^\d+[–-]\d+ לפנה"ס/, /עונת /, / - /, /^(רצח|פרשת|פרשיית) /, /^(תנוחות|יחסי) מין/,
  /^(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר) \d{4}$/,
];
const KEEP_EXCEPTIONS = new Set(['רצח רבין', 'ט"ו בשבט', 'ט"ו באב', 'ל"ג בעומר', 'תשעה באב', '1984 (ספר)', '1984 (רומן)']);
// Patterns allowed only a few times per category (most popular kept)
const CAPPED = [
  [/^הבחירות לכנסת/, 3],
  [/^הבחירות לנשיאות/, 2],
  [/^הכנסת ה/, 2],
  [/^ממשלת ישראל ה/, 2],
  [/^מבצע /, 25],
  [/^נבחרת /, 40],
  [/אירוויזיון \d{4}/, 6],
  [/^(גביע|ליגת|אליפות|טורניר|המשחקים|אולימפיאדת|מונדיאל|יורו).*\d{4}/, 30],
];

function titleOk(t) {
  if (KEEP_EXCEPTIONS.has(t)) return true;
  if (!isMainNamespace(t)) return false;
  if (META_TITLES.has(t)) return false;
  if (UNSUITABLE_RE.test(t)) return false;
  for (const re of TITLE_RES) if (re.test(t)) return false;
  if (t.length > 45) return false; // overly long titles are rarely recognizable
  return true;
}

// ------------------------------------------------------------------ helpers
function lastMonths(n) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const out = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based current month => previous month is m (1-based)
  for (let i = 0; i < n; i++) {
    if (m === 0) {
      y--;
      m = 12;
    }
    out.push([y, m]);
    m--;
  }
  return out.reverse();
}

async function loadInfo() {
  if (!existsSync(INFO_FILE)) return {};
  return JSON.parse(await readFile(INFO_FILE, 'utf8'));
}
async function saveInfo(info) {
  await mkdir(path.dirname(INFO_FILE), { recursive: true });
  await writeFile(INFO_FILE, JSON.stringify(info));
}

function topicScores(tags) {
  const topics = {};
  let israel = 0;
  for (const t of tags || []) {
    let m = t.match(/^classification\.prediction\.articletopic\/(.+)\|(\d+)$/);
    if (m) {
      topics[m[1]] = Number(m[2]);
      continue;
    }
    m = t.match(/^classification\.prediction\.articlecountry\/Israel\|(\d+)$/);
    if (m) israel = Number(m[1]);
  }
  return { topics, israel };
}

// ------------------------------------------------------------------ main steps
async function topViews() {
  const views = new Map(); // title -> {views, months}
  for (const [y, m] of lastMonths(12)) {
    const mm = String(m).padStart(2, '0');
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/he.wikipedia/all-access/${y}/${mm}/all-days`;
    const json = await getJSON(url, { kind: 'pageviews' });
    if (!json) {
      console.warn(`  no top list for ${y}-${mm}`);
      continue;
    }
    const arts = json.items[0].articles;
    for (const a of arts) {
      const t = normalizeTitle(a.article);
      if (t === 'עמוד ראשי' || !isMainNamespace(t) || t.startsWith('מיוחד:')) continue;
      const v = views.get(t) || { views: 0, months: 0 };
      v.views += a.views;
      v.months++;
      views.set(t, v);
    }
    console.log(`  top list ${y}-${mm}: ${arts.length} articles (union now ${views.size})`);
  }
  return views;
}

async function searchCandidates() {
  const cands = new Set();
  for (const [q, max] of SEARCHES) {
    let got = 0;
    for (let off = 0; off < max && off < 10000; off += 500) {
      const lim = Math.min(500, max - off, 10000 - off);
      const json = await api({
        action: 'query', list: 'search', srsearch: q, srsort: 'incoming_links_desc', srnamespace: '0',
        srlimit: String(lim), sroffset: String(off), srprop: '', srinfo: '',
      });
      const res = json.query?.search || [];
      for (const r of res) cands.add(r.title);
      got += res.length;
      if (res.length < lim) break;
    }
    console.log(`  ${q}: ${got} (candidates ${cands.size})`);
  }
  return cands;
}

async function fetchInfo(titles, info) {
  const todo = titles.filter((t) => !(t in info));
  console.log(`  page info: ${titles.length - todo.length} cached, ${todo.length} to fetch`);
  const batches = chunk(todo, 50);
  let done = 0;
  await mapLimit(batches, 3, async (batch) => {
    const json = await api({
      action: 'query', prop: 'cirrusdoc|info|pageprops', cdincludes: 'incoming_links|popularity_score|weighted_tags',
      ppprop: 'disambiguation', titles: batch.join('|'), redirects: '1',
    });
    const q = json.query || {};
    const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects || []).map((r) => [r.from, r.to]));
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      let cur = norm.get(t) || t;
      for (let i = 0; i < 5 && redir.has(cur); i++) cur = redir.get(cur);
      const p = pages.get(cur);
      if (!p || p.missing || p.invalid || p.ns !== 0) {
        info[t] = null;
        continue;
      }
      if (cur !== t) info[t] = { r: cur }; // redirect/normalization pointer
      if (!(cur in info) || info[cur]?.r) {
        const src = p.cirrusdoc?.[0]?.source || {};
        const { topics, israel } = topicScores(src.weighted_tags);
        info[cur] = {
          len: p.length || 0,
          bl: src.incoming_links || 0,
          pop: src.popularity_score || 0,
          dis: p.pageprops && 'disambiguation' in p.pageprops ? 1 : 0,
          tp: topics,
          il: israel,
          nocd: p.cirrusdoc?.length ? 0 : 1,
        };
      }
    }
    done += batch.length;
    if (done % 2500 < 50) {
      console.log(`    ${done}/${todo.length} (requests ${stats.requests})`);
      await saveInfo(info);
    }
  });
  await saveInfo(info);
}

// ------------------------------------------------------------------ classification
const T = 600;
const SCI = ['STEM.Biology', 'STEM.Chemistry', 'STEM.Physics', 'STEM.Space', 'STEM.Earth_and_environment', 'STEM.Medicine_&_Health', 'STEM.Mathematics'];
const CULT = [
  'Culture.Media.Films', 'Culture.Media.Music', 'Culture.Media.Television', 'Culture.Media.Video_games',
  'Culture.Media.Books', 'Culture.Literature', 'Culture.Media.Entertainment', 'Culture.Performing_arts',
  'Culture.Visual_arts.Comics_and_Anime', 'Culture.Visual_arts.Visual_arts*', 'Culture.Media.Radio',
  'Culture.Internet_culture',
];
const GEO_REGION_PREFIX = 'Geography.Regions.';
const NOT_PLACE_RE = /^(אוניברסיטת|האוניברסיטה|הספרייה|ספריית|בית הקברות|בית קברות|בסיס|מוזיאון|נמל התעופה|תחנת|בית הספר|בית חולים|המרכז הרפואי|מכון|קבר|היכל|אצטדיון|תיאטרון|קניון|מלון|מגדל|כנסיית|מסגד|בית הכנסת)|צוותא/;
const WAR_RE = /מלחמ|קרב |^קרב|מבצע|מרד|מצור|פלישת|כיבוש|מהפכ|טבח|התקוממות|אינתיפאדה|משבר|הסכם|ועידת|חוזה|שואה|האימפריה|ממלכת|שושלת|הצהרת|פוגרום|גירוש|עלייה/;
function classify(d, title) {
  const tp = d.tp || {};
  const s = (k) => tp[k] || 0;
  const bio = s('Culture.Biography.Biography*');
  const sport = s('Culture.Sports');
  const cats = [];
  if (s('Culture.Food_and_drink') >= 700 && bio < 300 && s('History_and_Society.Business_and_economics') < 500 && d.bl >= 20)
    cats.push('food');
  if (sport >= T) cats.push('sports');
  if (SCI.some((k) => s(k) >= T) && bio < 500 && sport < 500) cats.push('science');
  if (CULT.some((k) => s(k) >= T) && sport < 500) cats.push('culture');
  const hist = s('History_and_Society.History');
  const mil = s('History_and_Society.Military_and_warfare');
  if (sport < 500 && (hist >= T || (mil >= T && (bio >= 500 || WAR_RE.test(title))))) cats.push('history');
  if (d.il >= T) cats.push('israel');
  // geography (provisional): explicitly geographical, or only-regional topics; confirmed later by place templates
  let regionMax = 0;
  let otherMax = 0;
  for (const [k, v] of Object.entries(tp)) {
    if (k.startsWith(GEO_REGION_PREFIX)) regionMax = Math.max(regionMax, v);
    else if (k !== 'Geography.Geographical') otherMax = Math.max(otherMax, v);
  }
  if (bio < 500 && !NOT_PLACE_RE.test(title) && (s('Geography.Geographical') >= 500 || (regionMax >= 700 && otherMax < 500)))
    cats.push('geography');
  return cats;
}

// Infobox / map templates that mark an article as a place
const PLACE_TEMPLATES = [
  'מפת מיקום', 'מדינה', 'עיר', 'יבשת', 'גוף מים', 'אי', 'הר', 'נהר', 'יישוב בישראל/1', 'מדבר', 'אגם', 'ים', 'מפל',
  'שמורת טבע', 'פארק לאומי', 'אזור גאוגרפי', 'מחוז', 'מדינה בארצות הברית', 'יישוב', 'כפר', 'רכס הרים', 'הר געש',
  'מערה', 'עמק', 'חצי אי', 'מפרץ', 'נחל', 'קרחון', 'מדינה לשעבר', 'טריטוריה',
].map((t) => 'תבנית:' + t);

async function fetchPlaceFlags(titles, info) {
  const todo = titles.filter((t) => info[t] && info[t].pl === undefined);
  console.log(`  place templates: ${titles.length - todo.length} cached, ${todo.length} to fetch`);
  await mapLimit(chunk(todo, 50), 3, async (batch) => {
    const hits = new Set();
    for await (const json of apiPages({
      action: 'query', prop: 'templates', titles: batch.join('|'), tlnamespace: '10', tllimit: 'max',
      tltemplates: PLACE_TEMPLATES.join('|'),
    })) {
      for (const p of json.query?.pages || []) if (p.templates?.length) hits.add(p.title);
    }
    for (const t of batch) info[t].pl = hits.has(t) ? 1 : 0;
  });
  await saveInfo(info);
}

// ------------------------------------------------------------------ main
async function main() {
  const t0 = Date.now();
  console.log('1) Pageviews top lists (12 months)');
  const tv = await topViews();

  console.log('2) Topic searches');
  const searchSet = await searchCandidates();

  console.log('3) Page info');
  const info = await loadInfo();
  const all = [...new Set([...tv.keys(), ...searchSet])].sort();
  await fetchInfo(all, info);

  // Resolve top-view titles to canonical, summing views
  const views = new Map();
  for (const [t, v] of tv) {
    let c = t;
    for (let i = 0; i < 5 && info[c]?.r; i++) c = info[c].r;
    if (!info[c]) continue;
    const cur = views.get(c) || { views: 0, months: 0 };
    cur.views += v.views;
    cur.months = Math.max(cur.months, v.months);
    views.set(c, cur);
  }

  // Calibrate popularity_score -> annual views using stable top-list articles
  const ratios = [];
  for (const [t, v] of views) if (v.months === 12 && info[t].pop > 0) ratios.push(v.views / info[t].pop);
  ratios.sort((a, b) => a - b);
  const K = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1e9;
  console.log(`  calibration: ${ratios.length} stable articles, K=${K.toExponential(3)}`);

  // Build article records
  const recs = new Map();
  for (const t of all) {
    let c = t;
    for (let i = 0; i < 5 && info[c]?.r; i++) c = info[c].r;
    const d = info[c];
    if (!d || d.r || recs.has(c)) continue;
    if (d.dis || d.len < 4000 || d.nocd || d.bl < 10) continue;
    if (!titleOk(c)) continue;
    const est = d.pop * K;
    const v = views.get(c);
    let views12 = est;
    if (v) views12 = Math.max(est, (est + v.views) / 2) * (1 + (0.25 * v.months) / 12);
    // Popularity: mostly (estimated) yearly views, tempered by how linked/central the article is.
    // This keeps short-lived news spikes from dominating and favours broadly recognizable topics.
    const score = Math.pow(views12 + 1, 0.65) * Math.pow(d.bl + 10, 0.35);
    recs.set(c, { title: c, bl: d.bl, score, cats: classify(d, c), tv: v ? v.months : 0 });
  }
  console.log(`  ${recs.size} articles pass filters`);

  // Confirm geography candidates with place templates
  const geoCands = [...recs.values()].filter((r) => r.cats.includes('geography')).map((r) => r.title);
  await fetchPlaceFlags(geoCands, info);
  for (const t of geoCands) {
    const r = recs.get(t);
    if (!info[t].pl) r.cats = r.cats.filter((c) => c !== 'geography');
  }

  // Pools
  const byScore = [...recs.values()].sort((a, b) => b.score - a.score);
  const pools = {};
  for (const key of Object.keys(CATEGORY_NAMES)) pools[key] = [];
  const capCount = {};
  const pushCapped = (key, r) => {
    for (const [re, max] of CAPPED) {
      if (re.test(r.title)) {
        const ck = key + re;
        capCount[ck] = (capCount[ck] || 0) + 1;
        if (capCount[ck] > max) return;
      }
    }
    pools[key].push(r);
  };
  for (const r of byScore) {
    for (const c of r.cats) if (pools[c].length < POOL_SIZE) pushCapped(c, r);
    // random: well-known general articles (in top lists, or heavily linked)
    if (pools.random.length < POOL_SIZE && (r.tv > 0 || r.bl >= 150)) pushCapped('random', r);
  }

  // Global popularity rank across all pool articles
  const union = new Map();
  for (const arr of Object.values(pools)) for (const r of arr) union.set(r.title, r);
  const ranked = [...union.values()].sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => (r.rank = i + 1));

  const out = { version: 1, generated: new Date().toISOString().slice(0, 10), categories: {} };
  for (const [key, name] of Object.entries(CATEGORY_NAMES)) {
    out.categories[key] = { name, articles: pools[key].map((r) => [r.title, r.rank, r.bl]) };
  }
  await writeJSON(OUT, out);
  const size = (await readFile(OUT)).length;
  console.log(`\nWrote ${OUT} (${(size / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(0)}s, requests=${stats.requests}, cacheHits=${stats.cacheHits}`);

  // Report
  for (const [key, { articles }] of Object.entries(out.categories)) {
    const n = articles.length;
    const tiers = [
      ['popular', articles.slice(0, Math.floor(n * 0.3))],
      ['mid', articles.slice(Math.floor(n * 0.3), Math.floor(n * 0.65))],
      ['lower', articles.slice(Math.floor(n * 0.65))],
    ];
    const tierStats = tiers.map(([nm, a]) => {
      const bls = a.map((x) => x[2]).sort((x, y) => x - y);
      const med = bls[Math.floor(bls.length / 2)] || 0;
      const ge30 = bls.filter((b) => b >= 30).length;
      return `${nm}: n=${a.length} medBL=${med} BL>=30=${ge30}`;
    });
    console.log(`\n=== ${key} (${CATEGORY_NAMES[key]}) ${n} articles | ${tierStats.join(' | ')}`);
    if (SAMPLE_N) {
      for (const [nm, a] of tiers) {
        const sample = [...a].sort(() => Math.random() - 0.5).slice(0, SAMPLE_N).map((x) => x[0]);
        console.log(`  [${nm}] ${sample.join(' · ')}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
