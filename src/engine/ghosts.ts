import type { GhostNote, Passage } from "./types";

export const DUSTY_DAYS = 540;

interface DocHead {
  docId: string;
  title: string;
  docKey: string;
  version: number;
  updatedAt: string;
  status: Passage["status"];
}

function heads(passages: Passage[]): DocHead[] {
  const seen = new Map<string, DocHead>();
  for (const p of passages) {
    if (!seen.has(p.docId)) {
      seen.set(p.docId, { docId: p.docId, title: p.title, docKey: p.docKey, version: p.version, updatedAt: p.updatedAt, status: p.status });
    }
  }
  return [...seen.values()];
}

/** Living wins on: higher version, then later updatedAt, then lexically smaller id. */
function livingFirst(a: DocHead, b: DocHead): number {
  if (a.version !== b.version) return b.version - a.version;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.docId < b.docId ? -1 : 1;
}

/**
 * Find ghosts among `visible` passages only (passages that passed both gates for this asker).
 * Never looks outside that set, so a newer version the asker cannot open is never revealed.
 */
export function findGhosts(visible: Passage[]): Map<string, GhostNote> {
  const ghosts = new Map<string, GhostNote>();
  const byKey = new Map<string, DocHead[]>();
  for (const h of heads(visible)) {
    const list = byKey.get(h.docKey) ?? [];
    list.push(h);
    byKey.set(h.docKey, list);
  }
  for (const list of byKey.values()) {
    const sorted = [...list].sort(livingFirst);
    const living = sorted.find((h) => h.status !== "superseded");
    for (const h of sorted) {
      if (living && h.docId === living.docId) continue;
      // Every other document in the lineage is a ghost. If there is no living one, all are marked superseded.
      const note: GhostNote = {
        docId: h.docId,
        title: h.title,
        version: h.version,
        reason: h.status === "superseded" ? "marked-superseded" : "newer-version",
      };
      if (living) {
        note.livingDocId = living.docId;
        note.livingTitle = living.title;
        note.livingVersion = living.version;
      }
      ghosts.set(h.docId, note);
    }
  }
  return ghosts;
}

export function isDusty(updatedAt: string, now: Date): boolean {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t > DUSTY_DAYS * 24 * 60 * 60 * 1000;
}
