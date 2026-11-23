#!/usr/bin/env node
// Shortest playable path between two Hebrew Wikipedia articles.
//
// Bidirectional BFS over the link graph:
//   - forward layer 1 comes straight from the start page's Parsoid HTML (exactly the playable links);
//     deeper forward layers use generator=links&redirects=1 (targets resolved to canonical titles in bulk).
//     Parents of a forward node are recovered lazily (only for meeting nodes) with prop=links&pltitles=…
//   - backward layers use prop=linkshere (redirect pages are followed: links to a redirect R→T count as links to T).
//   - the smaller frontier is always expanded; meetings are checked after every batch so the search stops early.
// Every candidate path is validated hop-by-hop against the game's playable-link rule (Parsoid HTML, see lib/wiki.mjs).
// If no candidate of the minimal length validates, the search continues to longer paths.
//
// CLI: node scripts/shortest-path.mjs "חומוס" "הירח" [--max-depth 6] [--budget 3000] [-v]

import { pathToFileURL } from 'node:url';
import {
  api, apiPages, chunk, canonicalTitle, resolveTitles, playableLinks, aliasesOf, isPlayableHop, stats,
} from './lib/wiki.mjs';

class BudgetExceeded extends Error {}

/**
 * @param {string} start
 * @param {string} target
 * @param {{maxDepth?:number, budget?:number, maxCandidatesPerLength?:number, verbose?:boolean, cache?:boolean}} opts
 *   budget = max number of HTTP requests (cache hits are free).
 * @returns {Promise<{length:number, path:string[]}|null>}
 */
export async function shortestPath(start, target, opts = {}) {
  const { maxDepth = 6, budget = 3000, maxCandidatesPerLength = 60, verbose = false, cache = true } = opts;
  const log = verbose ? (...a) => console.error('  ·', ...a) : () => {};
  const req0 = stats.requests;
  const checkBudget = () => {
    if (stats.requests - req0 > budget) throw new BudgetExceeded(`budget of ${budget} requests exceeded`);
  };
  const o = { cache };

  const s = await canonicalTitle(start, o);
  const t = await canonicalTitle(target, o);
  if (!s || !t) {
    log(`missing page: ${!s ? start : target}`);
    return null;
  }
  if (s === t) return { length: 0, path: [s] };

  // Forward: node -> {d, batch} (batch = array of depth d-1 sources one of which links to node)
  const F = new Map([[s, { d: 0, batch: null }]]);
  // Backward: node -> {d, kids:Set} (kids = depth d-1 nodes this node links to)
  const B = new Map([[t, { d: 0, kids: new Set() }]]);
  let fFront = [s];
  let bFront = [t];
  let fD = 0;
  let bD = 0;

  // ---------------------------------------------------------------- candidate validation
  const candidatesByLen = new Map(); // length -> Set(meeting nodes)
  const triedByLen = new Map(); // length -> number of meeting nodes validated
  let curLen = 1; // smallest length not yet ruled out

  const parentMemo = new Map();
  async function forwardParents(m) {
    if (parentMemo.has(m)) return parentMemo.get(m);
    const info = F.get(m);
    if (!info || info.d === 0) return [];
    if (info.d === 1) return [s];
    const aliases = [...(await aliasesOf(m, o))].slice(0, 50);
    const parents = [];
    for (const batch of chunk(info.batch, 50)) {
      for await (const json of apiPages(
        { action: 'query', prop: 'links', titles: batch.join('|'), plnamespace: '0', pllimit: 'max', pltitles: aliases.join('|') },
        o,
      )) {
        for (const p of json.query?.pages || []) if (p.links?.length) parents.push(p.title);
      }
    }
    checkBudget();
    parentMemo.set(m, parents);
    return parents;
  }

  async function forwardPaths(m, cap = 6) {
    const info = F.get(m);
    if (info.d === 0) return [[s]];
    const out = [];
    for (const p of (await forwardParents(m)).slice(0, 4)) {
      // the hop p -> m must be playable; check it before recursing deeper
      if (!(await isPlayableHop(p, m, o))) continue;
      checkBudget();
      for (const pre of await forwardPaths(p, cap)) {
        out.push([...pre, m]);
        if (out.length >= cap) return out;
      }
    }
    return out;
  }

  async function backwardPaths(m, cap = 6) {
    const info = B.get(m);
    if (info.d === 0) return [[t]];
    const out = [];
    for (const k of [...info.kids].slice(0, 6)) {
      if (!(await isPlayableHop(m, k, o))) continue;
      checkBudget();
      for (const post of await backwardPaths(k, cap)) {
        out.push([m, ...post]);
        if (out.length >= cap) return out;
      }
    }
    return out;
  }

  async function tryMeeting(m) {
    // forward half first (start page links are memoized, so cheap), then backward half
    const fwd = await forwardPaths(m);
    if (!fwd.length) return null;
    const bwd = await backwardPaths(m);
    if (!bwd.length) return null;
    const p = [...fwd[0], ...bwd[0].slice(1)];
    if (new Set(p).size !== p.length) return null;
    return p;
  }

  function addMeeting(n) {
    if (!F.has(n) || !B.has(n)) return;
    const L = F.get(n).d + B.get(n).d;
    if (!candidatesByLen.has(L)) candidatesByLen.set(L, new Set());
    candidatesByLen.get(L).add(n);
  }

  // Validate pending candidates of the current minimal length. Returns a path or null.
  async function validatePending(final = false) {
    for (;;) {
      const cands = [...(candidatesByLen.get(curLen) || [])];
      let tried = triedByLen.get(curLen) || 0;
      while (tried < cands.length && tried < maxCandidatesPerLength) {
        const m = cands[tried++];
        triedByLen.set(curLen, tried);
        const p = await tryMeeting(m);
        checkBudget();
        if (p) return p;
      }
      // all paths of length curLen are discoverable once fD + bD >= curLen and the layers are complete
      if (final && curLen <= fD + bD) {
        log(`no valid path of length ${curLen} (${cands.length} meeting nodes, ${tried} tried)`);
        curLen++;
        continue;
      }
      return null;
    }
  }

  // ---------------------------------------------------------------- expansion
  async function expandForward() {
    const next = [];
    const d = fD + 1;
    const onNew = (n, batch) => {
      if (F.has(n)) return false;
      F.set(n, { d, batch });
      next.push(n);
      return true;
    };
    if (fD === 0) {
      const links = (await playableLinks(s, o)) || new Set();
      const res = await resolveTitles([...links], o);
      for (const c of res.values()) if (c && onNew(c, [s])) addMeeting(c);
    } else {
      for (const batch of chunk(fFront, 50)) {
        for await (const json of apiPages(
          { action: 'query', generator: 'links', titles: batch.join('|'), gplnamespace: '0', gpllimit: 'max', redirects: '1' },
          o,
        )) {
          for (const p of json.query?.pages || []) {
            if (p.missing || p.invalid || p.ns !== 0) continue;
            if (onNew(p.title, batch)) addMeeting(p.title);
          }
          checkBudget();
          if (candidatesByLen.get(curLen)?.size > (triedByLen.get(curLen) || 0)) {
            const found = await validatePending();
            if (found) return found;
          }
        }
      }
    }
    fD = d;
    fFront = next;
    log(`forward depth ${fD}: ${next.length} new nodes (requests ${stats.requests - req0})`);
    return null;
  }

  async function expandBackward() {
    const next = [];
    const d = bD + 1;
    const add = (src, kid) => {
      let info = B.get(src);
      if (!info) {
        info = { d, kids: new Set([kid]) };
        B.set(src, info);
        next.push(src);
        addMeeting(src);
      } else if (info.d === d && info.kids.size < 8) info.kids.add(kid);
    };
    for (const batch of chunk(bFront, 50)) {
      const redirectOf = new Map(); // redirect title -> canonical node
      for await (const json of apiPages(
        { action: 'query', prop: 'linkshere', titles: batch.join('|'), lhnamespace: '0', lhlimit: 'max', lhprop: 'title|redirect' },
        o,
      )) {
        for (const p of json.query?.pages || []) {
          for (const l of p.linkshere || []) {
            if (l.redirect) redirectOf.set(l.title, p.title);
            else if (l.title !== p.title) add(l.title, p.title);
          }
        }
        checkBudget();
      }
      // pages linking to redirects of these nodes
      for (const rb of chunk([...redirectOf.keys()], 50)) {
        for await (const json of apiPages(
          { action: 'query', prop: 'linkshere', titles: rb.join('|'), lhnamespace: '0', lhlimit: 'max', lhprop: 'title|redirect' },
          o,
        )) {
          for (const p of json.query?.pages || []) {
            const canon = redirectOf.get(p.title);
            if (!canon) continue;
            for (const l of p.linkshere || []) if (!l.redirect && l.title !== canon) add(l.title, canon);
          }
          checkBudget();
        }
      }
      if (candidatesByLen.get(curLen)?.size > (triedByLen.get(curLen) || 0)) {
        const found = await validatePending();
        if (found) return found;
      }
    }
    bD = d;
    bFront = next;
    log(`backward depth ${bD}: ${next.length} new nodes (requests ${stats.requests - req0})`);
    return null;
  }

  // ---------------------------------------------------------------- main loop
  try {
    for (;;) {
      if (curLen > maxDepth) return null;
      let found;
      // Always expand forward first from the start page (cheap: one Parsoid fetch), then the smaller frontier.
      // A backward node typically has more neighbours than a forward one, so weight the backward frontier.
      // A side with an empty frontier means every reachable node on that side is known: no further path exists.
      if ((fD > 0 && !fFront.length) || (bD > 0 && !bFront.length)) return null;
      if (fD === 0 || fFront.length <= bFront.length * 1.5) found = await expandForward();
      else found = await expandBackward();
      if (found) return { length: found.length - 1, path: found };
      found = await validatePending(true);
      if (found) return { length: found.length - 1, path: found };
      if (fD + bD >= maxDepth && curLen > fD + bD) return null;
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      log(e.message);
      return null;
    }
    throw e;
  }
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf(name);
    if (i < 0) return def;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const maxDepth = Number(flag('--max-depth', 6));
  const budget = Number(flag('--budget', 3000));
  const verbose = args.includes('-v') ? (args.splice(args.indexOf('-v'), 1), true) : false;
  const [a, b] = args;
  if (!a || !b) {
    console.error('usage: node scripts/shortest-path.mjs "<start>" "<target>" [--max-depth 6] [--budget 3000] [-v]');
    process.exit(2);
  }
  const t0 = Date.now();
  const res = await shortestPath(a, b, { maxDepth, budget, verbose });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res) {
    console.log(`no path found (${secs}s, ${stats.requests} requests)`);
    process.exit(1);
  }
  console.log(`length ${res.length}: ${res.path.join(' → ')}`);
  console.log(`(${secs}s, ${stats.requests} requests, ${stats.cacheHits} cache hits)`);
}
