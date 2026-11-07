import { aclAllows, type LiveAcl } from "./corpus";
import type { Identity, Passage } from "./types";

/** Gate 1: index-time ACL. Archived documents never pass. */
export function gate1(passages: Passage[], who: Identity): { allowed: Passage[]; denied: number } {
  const allowed = passages.filter((p) => p.status !== "archived" && aclAllows(p.acl, who));
  return { allowed, denied: passages.length - allowed.length };
}

/**
 * Gate 2: ask the live registry again for each surviving document. A throw, a missing entry or a
 * "no" all mean deny (fail closed). One check per document, applied to all of its passages.
 */
export function gate2(passages: Passage[], who: Identity, live: LiveAcl): { allowed: Passage[]; deniedDocIds: string[] } {
  const verdicts = new Map<string, boolean>();
  for (const p of passages) {
    if (verdicts.has(p.docId)) continue;
    let ok = false;
    try {
      ok = live.check(p.docId, who) === true;
    } catch {
      ok = false;
    }
    verdicts.set(p.docId, ok);
  }
  const deniedDocIds = [...verdicts.entries()].filter(([, ok]) => !ok).map(([id]) => id).sort();
  return { allowed: passages.filter((p) => verdicts.get(p.docId)), deniedDocIds };
}
