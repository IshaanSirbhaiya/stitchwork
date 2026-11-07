import { tokenize } from "./tokenize";
import type { Passage } from "./types";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
/** Share of distinct query terms a passage must contain. */
export const MIN_TERM_SHARE = 0.5;
/** Share of the query's total IDF weight a passage must contain. */
export const MIN_COVERAGE = 0.4;

export interface Scored {
  passage: Passage;
  score: number;
  coverage: number;
  termShare: number;
}

interface Stats {
  df: Map<string, number>;
  avgLen: number;
  n: number;
}

function buildStats(docs: string[][]): Stats {
  const df = new Map<string, number>();
  let total = 0;
  for (const toks of docs) {
    total += toks.length;
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { df, avgLen: docs.length ? total / docs.length : 0, n: docs.length };
}

function idf(term: string, stats: Stats): number {
  const df = stats.df.get(term) ?? 0;
  return Math.log(1 + (stats.n - df + 0.5) / (df + 0.5));
}

interface Match {
  score: number;
  coverage: number;
  termShare: number;
}

function relevant(m: Match): boolean {
  return m.score > 0 && m.termShare >= MIN_TERM_SHARE && m.coverage >= MIN_COVERAGE;
}

/**
 * BM25 score plus IDF-weighted coverage: the share of the query's total IDF that the passage
 * contains. A passage that only matches common words ("work") cannot pass the coverage rule
 * when the rare word ("remotely") is missing.
 */
function bm25(queryTerms: string[], toks: string[], stats: Stats): Match {
  if (!queryTerms.length || !toks.length) return { score: 0, coverage: 0, termShare: 0 };
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  let matched = 0;
  let matchedIdf = 0;
  let totalIdf = 0;
  for (const q of queryTerms) {
    const w = idf(q, stats);
    totalIdf += w;
    const f = tf.get(q) ?? 0;
    if (!f) continue;
    matched++;
    matchedIdf += w;
    score += (w * (f * (BM25_K1 + 1))) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * toks.length) / (stats.avgLen || 1)));
  }
  return { score, coverage: totalIdf > 0 ? matchedIdf / totalIdf : 0, termShare: matched / queryTerms.length };
}

/** Distinct query terms in first-seen order. */
export function queryTerms(question: string): string[] {
  return [...new Set(tokenize(question))];
}

function passageTokens(p: Passage): string[] {
  return tokenize(`${p.title} ${p.location} ${p.text}`);
}

/**
 * Rank `living` passages. Statistics come only from `living` (which the caller has already
 * passed through both gates and the ghost check). Returns relevant passages only, sorted by
 * score descending then passage id ascending, so ordering is deterministic.
 */
export function rank(question: string, living: Passage[]): Scored[] {
  const terms = queryTerms(question);
  const toks = living.map(passageTokens);
  const stats = buildStats(toks);
  const scored: Scored[] = [];
  living.forEach((p, i) => {
    const m = bm25(terms, toks[i], stats);
    if (relevant(m)) scored.push({ passage: p, ...m });
  });
  scored.sort((a, b) => b.score - a.score || (a.passage.id < b.passage.id ? -1 : 1));
  return scored;
}

/** Score extra passages (ghosts) against the statistics of `living` plus each extra passage alone. */
export function relevantExtras(question: string, living: Passage[], extras: Passage[]): Passage[] {
  const terms = queryTerms(question);
  const livingToks = living.map(passageTokens);
  return extras.filter((p) => {
    const toks = passageTokens(p);
    const stats = buildStats([...livingToks, toks]);
    return relevant(bm25(terms, toks, stats));
  });
}
