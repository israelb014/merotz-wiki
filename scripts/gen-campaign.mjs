#!/usr/bin/env node
// Generate public/data/campaign.json: 6 themed worlds x 10 handcrafted levels.
//
//   node scripts/gen-campaign.mjs [--verbose]
//
// The pairs below are curated by hand (recognizable, thematic, fun). The script canonicalizes titles,
// computes the validated shortest playable path (par = number of clicks), and checks constraints:
// par within the world's range, par >= 2 (never directly linked), no duplicates across the campaign.
// Inside each world levels are ordered by rising difficulty (par, then obscurity).
// Candidate lists are longer than 10 so a pair whose par drifts out of range (Wikipedia edits) is replaced.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, writeJSON, canonicalTitle, stats } from './lib/wiki.mjs';
import { shortestPath } from './shortest-path.mjs';

const VERBOSE = process.argv.includes('--verbose');
const OUT = path.join(ROOT_DIR, 'public/data/campaign.json');
const POOLS = path.join(ROOT_DIR, 'public/data/pools.json');

// [start, target] in preferred order; the first 10 that satisfy the world's par range are used.
export const WORLDS = [
  {
    id: 1,
    name: 'המטבח',
    category: 'food',
    par: [2, 3],
    pairs: [],
  },
  {
    id: 2,
    name: 'האצטדיון',
    category: 'sports',
    par: [2, 3],
    pairs: [],
  },
  {
    id: 3,
    name: 'מסביב לעולם',
    category: 'geography',
    par: [2, 4],
    pairs: [],
  },
  {
    id: 4,
    name: 'ארץ ישראל',
    category: 'israel',
    par: [3, 4],
    pairs: [],
  },
  {
    id: 5,
    name: 'על המסך',
    category: 'culture',
    par: [3, 4],
    pairs: [],
  },
  {
    id: 6,
    name: 'מסע בזמן ובמדע',
    category: 'history',
    par: [4, 5],
    pairs: [],
  },
];

async function main() {
  const t0 = Date.now();
  const rank = new Map();
  if (existsSync(POOLS)) {
    const pools = JSON.parse(await readFile(POOLS, 'utf8'));
    for (const c of Object.values(pools.categories)) for (const [t, r] of c.articles) rank.set(t, r);
  }
  const used = new Set();
  const usedPair = new Set();
  const out = { version: 1, worlds: [] };
  let problems = 0;
  for (const w of WORLDS) {
    const levels = [];
    for (const [a, b] of w.pairs) {
      if (levels.length >= 10) break;
      const s = await canonicalTitle(a);
      const t = await canonicalTitle(b);
      if (!s || !t) {
        console.warn(`  [w${w.id}] missing page: ${!s ? a : b}`);
        problems++;
        continue;
      }
      if (s === t || usedPair.has(`${s}|${t}`)) {
        console.warn(`  [w${w.id}] duplicate/identical pair: ${s} → ${t}`);
        continue;
      }
      const res = await shortestPath(s, t, { maxDepth: 6, budget: 6000, verbose: VERBOSE });
      if (!res) {
        console.warn(`  [w${w.id}] no path: ${s} → ${t}`);
        problems++;
        continue;
      }
      const ok = res.length >= Math.max(2, w.par[0]) && res.length <= w.par[1];
      console.log(`  [w${w.id}] ${ok ? '✓' : '✗'} ${s} → ${t}: par ${res.length} (${res.path.join(' → ')})`);
      if (!ok) continue;
      usedPair.add(`${s}|${t}`).add(`${t}|${s}`);
      used.add(s).add(t);
      const obscurity = (rank.get(s) || 20000) + (rank.get(t) || 20000);
      levels.push({ start: s, target: t, par: res.length, path: res.path, obscurity });
    }
    if (levels.length < 10) {
      console.warn(`!! world ${w.id} has only ${levels.length} valid levels`);
      problems++;
    }
    levels.sort((x, y) => x.par - y.par || x.obscurity - y.obscurity);
    out.worlds.push({
      id: w.id,
      name: w.name,
      category: w.category,
      levels: levels.map((l, i) => ({ id: `${w.id}-${i + 1}`, start: l.start, target: l.target, par: l.par, path: l.path })),
    });
  }
  await writeJSON(OUT, out, true);
  const n = out.worlds.reduce((a, w) => a + w.levels.length, 0);
  console.log(`\nWrote ${OUT}: ${n} levels in ${((Date.now() - t0) / 1000).toFixed(0)}s (${stats.requests} requests)${problems ? `, ${problems} problems` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
