import { isDusty } from "./ghosts";
import type { Scored } from "./retrieve";
import { queryTerms } from "./retrieve";
import { splitSentences, tokenize } from "./tokenize";
import type { AnswerSentence, Citation } from "./types";

export const MAX_CITED = 3;
export const RELATIVE_FLOOR = 0.35;

function clip(s: string): string {
  return s.length > 400 ? `${s.slice(0, 397)}...` : s;
}

/**
 * The sentence with the most query terms. If that sentence is only a headline (every word is in
 * the passage title, as with a ticket summary), the best non-headline sentence with at least one
 * query term is appended, so the answer says something the title does not.
 */
function bestSentence(text: string, terms: string[], title: string): string {
  const sentences = splitSentences(text);
  const titleToks = new Set(tokenize(title));
  const scoredSentences = sentences.map((s, i) => {
    const toks = tokenize(s);
    const set = new Set(toks);
    return { s, i, hits: terms.filter((t) => set.has(t)).length, headline: toks.length > 0 && toks.every((t) => titleToks.has(t)) };
  });
  if (!scoredSentences.length) return clip(text);
  const best = [...scoredSentences].sort((a, b) => b.hits - a.hits || a.i - b.i)[0];
  if (!best.headline) return clip(best.s);
  const follow = scoredSentences
    .filter((x) => !x.headline && x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i)[0];
  return clip(follow ? `${best.s} ${follow.s}` : best.s);
}

/** Pick up to 3 passages from distinct documents, each at least 35 percent of the top score. */
export function compose(
  question: string,
  ranked: Scored[],
  checkedAt: Date,
): { sentences: AnswerSentence[]; citations: Citation[] } {
  if (!ranked.length) return { sentences: [], citations: [] };
  const terms = queryTerms(question);
  const floor = ranked[0].score * RELATIVE_FLOOR;
  const chosen: Scored[] = [];
  const docs = new Set<string>();
  for (const s of ranked) {
    if (chosen.length >= MAX_CITED || s.score < floor) break;
    if (docs.has(s.passage.docId)) continue;
    docs.add(s.passage.docId);
    chosen.push(s);
  }
  const citations: Citation[] = chosen.map((s, i) => ({
    n: i + 1,
    passageId: s.passage.id,
    docId: s.passage.docId,
    kind: s.passage.kind,
    title: s.passage.title,
    sourceName: s.passage.sourceName,
    location: s.passage.location,
    version: s.passage.version,
    updatedAt: s.passage.updatedAt,
    checkedAt: checkedAt.toISOString(),
    dusty: isDusty(s.passage.updatedAt, checkedAt),
    text: s.passage.text,
  }));
  const sentences: AnswerSentence[] = [];
  chosen.forEach((s, i) => {
    const text = bestSentence(s.passage.text, terms, `${s.passage.docId} ${s.passage.title}`);
    const same = sentences.find((x) => x.text === text);
    if (same) same.citations.push(i + 1);
    else sentences.push({ text, citations: [i + 1] });
  });
  return { sentences, citations };
}
