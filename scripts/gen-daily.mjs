#!/usr/bin/env node
// Generate daily challenges into public/data/daily.json.
//
//   node scripts/gen-daily.mjs [--days 14]
//
// - Dates are Asia/Jerusalem calendar days starting today.
// - Existing entries for today/future are kept untouched (stability); entries older than 7 days are pruned.
// - Pairs are drawn from pools.json (popular/mid articles, varied categories), seeded by the date so reruns are stable.
// - Each pair is validated with the playable-link shortest path: length 3-4 preferred, 2-5 accepted.
// - Pairs (and start/target titles) used in the last 60 days are not reused. A compact "recent" list keeps that history
//   after the full entries are pruned.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, writeJSON, seededRandom, stats } from './lib/wiki.mjs';
import { shortestPath } from './shortest-path.mjs';

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 14;
const OUT = path.join(ROOT_DIR, 'public/data/daily.json');
const POOLS = path.join(ROOT_DIR, 'public/data/pools.json');
const CAMPAIGN = path.join(ROOT_DIR, 'public/data/campaign.json');
const KEEP_PAST_DAYS = 7;
const HISTORY_DAYS = 60;
const MAX_TRIES_PER_DAY = 14;
const TIME_LIMIT_MS = Number(process.env.DAILY_TIME_LIMIT_MS || 17 * 60 * 1000);

const CATS = ['food', 'sports', 'geography', 'israel', 'culture', 'history', 'science'];

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayIndex(iso) {
  return Math.round(Date.parse(iso + 'T12:00:00Z') / 86400000);
}
const pairKey = (a, b) => `${a}\u0001${b}`;

async function readJSON(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const t0 = Date.now();
  const today = jerusalemToday();
  const pools = await readJSON(POOLS, null);
  if (!pools) throw new Error('pools.json missing – run build-pools.mjs first');
  const campaign = await readJSON(CAMPAIGN, { worlds: [] });
  const daily = await readJSON(OUT, { version: 1, days: {} });
  daily.version = 1;
  daily.days ||= {};
  daily.recent ||= [];

  // History of used pairs/titles (last 60 days), from both full entries and the compact list.
  const oldest = addDays(today, -HISTORY_DAYS);
  const recent = new Map(); // date -> [start, target]
  for (const [d, s, t] of daily.recent) if (d >= oldest) recent.set(d, [s, t]);
  for (const [d, e] of Object.entries(daily.days)) if (d >= oldest) recent.set(d, [e.start, e.target]);
  const usedPairs = new Set();
  const usedTitles = new Set();
  for (const [s, t] of recent.values()) {
    usedPairs.add(pairKey(s, t)).add(pairKey(t, s));
    usedTitles.add(s).add(t);
  }
  for (const w of campaign.worlds || []) for (const l of w.levels || []) usedPairs.add(pairKey(l.start, l.target)).add(pairKey(l.target, l.start));

  // Prune old entries
  const cutoff = addDays(today, -KEEP_PAST_DAYS);
  for (const d of Object.keys(daily.days)) if (d < cutoff) delete daily.days[d];

  const catArticles = {};
  for (const c of CATS) catArticles[c] = pools.categories[c]?.articles || [];

  let generated = 0;
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(today, i);
    if (daily.days[date]) continue;
    if (Date.now() - t0 > TIME_LIMIT_MS) {
      console.warn(`time limit reached, stopping before ${date}`);
      break;
    }
    const rng = seededRandom(`merotz-daily-${date}`);
    const di = dayIndex(date);
    let best = null;
    for (let attempt = 0; attempt < MAX_TRIES_PER_DAY; attempt++) {
      // rotate categories by day, vary per attempt
      const startCat = CATS[(di + attempt) % CATS.length];
      let targetCat = CATS[(di * 3 + 2 + attempt * 2) % CATS.length];
      if (targetCat === startCat) targetCat = CATS[(CATS.indexOf(startCat) + 3) % CATS.length];
      const sa = catArticles[startCat];
      const ta = catArticles[targetCat].filter((a) => a[2] >= 30);
      if (!sa.length || !ta.length) continue;
      // start: popular tier (top 30%); target: upper-mid (3%..45%) – recognizable, yet usually 3-4 clicks away
      const start = sa[Math.floor(rng() * sa.length * 0.3)][0];
      const target = ta[Math.floor(ta.length * (0.03 + rng() * 0.42))][0];
      if (start === target || usedPairs.has(pairKey(start, target)) || usedTitles.has(start) || usedTitles.has(target)) continue;
      const res = await shortestPath(start, target, { maxDepth: 5, budget: 250 });
      const len = res?.length ?? 0;
      console.log(`  ${date} try ${attempt + 1}: ${start} → ${target} [${startCat}→${targetCat}] = ${len || 'none'}`);
      if (!res || len < 2 || len > 5) continue;
      const score = len === 3 || len === 4 ? 2 : 1;
      if (!best || score > best.score) best = { score, start, target, res, cat: targetCat };
      if (score === 2) break;
    }
    if (!best) {
      console.warn(`  !! no pair found for ${date}`);
      continue;
    }
    daily.days[date] = { start: best.start, target: best.target, par: best.res.length, path: best.res.path, category: best.cat };
    usedPairs.add(pairKey(best.start, best.target)).add(pairKey(best.target, best.start));
    usedTitles.add(best.start).add(best.target);
    recent.set(date, [best.start, best.target]);
    generated++;
    console.log(`✓ ${date}: ${best.start} → ${best.target} (par ${best.res.length}) ${best.res.path.join(' → ')}`);
  }

  // Sort days, rebuild compact history (dates not covered by full entries)
  const days = {};
  for (const d of Object.keys(daily.days).sort()) days[d] = daily.days[d];
  const recentList = [...recent.entries()]
    .filter(([d]) => d >= oldest && !days[d])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, [s, t]]) => [d, s, t]);
  await writeJSON(OUT, { version: 1, days, recent: recentList }, true);
  console.log(
    `\nWrote ${OUT}: ${Object.keys(days).length} days (${generated} new) in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${stats.requests} requests`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
