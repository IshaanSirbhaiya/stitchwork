import type { Acl, DocStatus, Identity, Passage, SourceDocument } from "./types";

export function aclAllows(acl: Acl, who: Identity): boolean {
  return acl.users.includes(who.userId) || acl.groups.some((g) => who.groups.includes(g));
}

export function toPassages(doc: SourceDocument): Passage[] {
  return doc.passages.map((p, i) => ({
    id: `${doc.id}#${i}`,
    docId: doc.id,
    kind: doc.kind,
    title: doc.title,
    sourceName: doc.sourceName,
    location: p.location,
    text: p.text,
    docKey: doc.docKey,
    version: doc.version,
    updatedAt: doc.updatedAt,
    status: doc.status,
    acl: { groups: [...doc.acl.groups], users: [...doc.acl.users] },
  }));
}

/** The live permission system, standing in for "ask the source system again". May throw. */
export interface LiveAcl {
  check(docId: string, who: Identity): boolean;
}

interface LiveEntry {
  acl: Acl;
  status: DocStatus;
}

/**
 * In-memory stand-in for each source system's live permission API. Changes here are NOT
 * re-indexed, which is exactly what Gate 2 exists to catch.
 */
export class LiveAclRegistry implements LiveAcl {
  private entries = new Map<string, LiveEntry>();

  constructor(docs: SourceDocument[] = []) {
    docs.forEach((d) => this.register(d));
  }

  register(doc: SourceDocument): void {
    this.entries.set(doc.id, { acl: { groups: [...doc.acl.groups], users: [...doc.acl.users] }, status: doc.status });
  }

  check(docId: string, who: Identity): boolean {
    const e = this.entries.get(docId);
    if (!e || e.status === "archived") return false;
    return aclAllows(e.acl, who);
  }

  get(docId: string): LiveEntry | undefined {
    const e = this.entries.get(docId);
    return e ? { acl: { groups: [...e.acl.groups], users: [...e.acl.users] }, status: e.status } : undefined;
  }

  revokeGroup(docId: string, group: string): boolean {
    const e = this.entries.get(docId);
    if (!e || !e.acl.groups.includes(group)) return false;
    e.acl.groups = e.acl.groups.filter((g) => g !== group);
    return true;
  }

  restoreGroup(docId: string, group: string): boolean {
    const e = this.entries.get(docId);
    if (!e || e.acl.groups.includes(group)) return false;
    e.acl.groups = [...e.acl.groups, group];
    return true;
  }

  setStatus(docId: string, status: DocStatus): void {
    const e = this.entries.get(docId);
    if (e) e.status = status;
  }
}
