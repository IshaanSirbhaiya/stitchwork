import { compose } from "./answer";
import { LiveAclRegistry, toPassages, type LiveAcl } from "./corpus";
import { gate1, gate2 } from "./gates";
import { findGhosts } from "./ghosts";
import { sha256Hex, canonical } from "./hash";
import { Ledger, type CryptType } from "./ledger";
import { maskSensitive } from "./mask";
import { rank, relevantExtras } from "./retrieve";
import {
  INVALID_QUERY_MESSAGE,
  LEDGER_UNAVAILABLE_MESSAGE,
  MAX_QUERY_CHARS,
  NO_ANSWER_MESSAGE,
  STITCHES_UNAVAILABLE_MESSAGE,
  type AnswerSentence,
  type AskResponse,
  type Citation,
  type GhostNote,
  type Identity,
  type Passage,
  type SourceDocument,
  type TrailStep,
  type WalnutReport,
} from "./types";
import { FORGED_SENTENCE, WalnutUnavailableError, type WalnutPointer, type WalnutStitches } from "../walnut/stitches";

export interface EngineOptions {
  documents: SourceDocument[];
  ledger: Ledger;
  clock?: () => Date;
  newId?: () => string;
  /** Live permission check. Defaults to a registry built from `documents`. */
  live?: LiveAcl;
  /** The Walnut stitches (grounding wall, pointers, durable sealed Crypt). Optional. */
  walnut?: WalnutStitches;
}

/**
 * Apply the Walnut grounding wall's verdicts: keep only the sentences it kept, keep only the
 * citations a kept sentence still uses, renumber them 1..n in their original order, and attach
 * Walnut's pointers under the new numbers.
 */
export function applyWall(
  sentences: AnswerSentence[],
  citations: Citation[],
  verdicts: { index: number; kept: boolean; reasons: string[]; pointers: { n: number; pointer: WalnutPointer }[] }[],
): { sentences: AnswerSentence[]; citations: Citation[]; dropped: WalnutReport["dropped"]; pointers: WalnutReport["pointers"] } {
  const byIndex = new Map(verdicts.map((v) => [v.index, v]));
  const keptIdx = sentences.map((_, i) => i).filter((i) => byIndex.get(i)?.kept === true);
  const dropped = sentences
    .map((s, i) => ({ s, v: byIndex.get(i) }))
    .filter(({ v }) => v?.kept !== true)
    .map(({ s, v }) => ({ text: s.text, reasons: v?.reasons.length ? v.reasons : ["no verdict from the wall"] }));
  const used = [...new Set(keptIdx.flatMap((i) => sentences[i].citations))].sort((a, b) => a - b);
  const renumber = new Map(used.map((old, i) => [old, i + 1]));
  const outCitations = citations.filter((c) => renumber.has(c.n)).map((c) => ({ ...c, n: renumber.get(c.n)! }));
  const outSentences = keptIdx.map((i) => ({ text: sentences[i].text, citations: sentences[i].citations.filter((n) => renumber.has(n)).map((n) => renumber.get(n)!) }));
  const pointers = keptIdx.flatMap((i, k) =>
    (byIndex.get(i)?.pointers ?? []).filter((p) => renumber.has(p.n)).map((p) => ({ sentence: k, n: renumber.get(p.n)!, pointer: p.pointer })),
  );
  return { sentences: outSentences, citations: outCitations, dropped, pointers };
}

export const STEWARD_GROUP = "steward";

const FULL_TRAIL: TrailStep[] = [
  { step: "identity", ok: true },
  { step: "crypt-accept", ok: true },
  { step: "gate-1", ok: true },
  { step: "gate-2", ok: true },
  { step: "ghost-check", ok: true },
  { step: "stitch", ok: true },
  { step: "crypt-seal", ok: true },
];

const WALNUT_TRAIL: TrailStep[] = [...FULL_TRAIL.slice(0, 6), { step: "walnut-wall", ok: true }, FULL_TRAIL[6]];

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `req-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * The answer layer. The pipeline order in `ask` is the single source of truth
 * (see .kiro/specs/permission-gates/design.md).
 */
export class Engine {
  readonly ledger: Ledger;
  readonly registry: LiveAclRegistry;
  /** Demo fault injection: the next answer gets a forged sentence, which the Walnut wall must drop. */
  forgeNext = false;
  private walnut: WalnutStitches | undefined;
  private live: LiveAcl;
  private docs = new Map<string, SourceDocument>();
  private passages: Passage[] = [];
  private clock: () => Date;
  private newId: () => string;

  constructor(opts: EngineOptions) {
    this.ledger = opts.ledger;
    this.clock = opts.clock ?? (() => new Date());
    this.newId = opts.newId ?? defaultId;
    this.registry = new LiveAclRegistry();
    this.live = opts.live ?? this.registry;
    this.walnut = opts.walnut;
    this.addDocuments(opts.documents);
  }

  /** Attach (or detach) the Walnut stitches, for example once the browser finds the service. */
  attachWalnut(walnut: WalnutStitches | undefined): void {
    this.walnut = walnut;
  }

  get walnutAttached(): boolean {
    return this.walnut !== undefined;
  }

  /**
   * Write one Crypt event. With Walnut attached it is sealed into Walnut's durable ledger first,
   * then appended to the in-memory Crypt. Either failing throws, so nothing after it runs.
   */
  private async record(type: CryptType, data: Record<string, unknown>, seals?: WalnutReport["seals"]): Promise<void> {
    if (this.walnut) {
      let sealed;
      try {
        sealed = await this.walnut.seal(type, data);
      } catch (e) {
        throw e instanceof WalnutUnavailableError ? e : new WalnutUnavailableError("seal failed");
      }
      seals?.push({ type, seq: sealed.seq });
    }
    await this.ledger.append(type, data);
  }

  /** Index documents: snapshot their ACL into passages (Gate 1) and register them live (Gate 2). */
  addDocuments(documents: SourceDocument[]): void {
    for (const d of documents) {
      if (this.docs.has(d.id)) this.passages = this.passages.filter((p) => p.docId !== d.id);
      this.docs.set(d.id, structuredClone(d));
      this.registry.register(d);
      this.passages.push(...toPassages(d));
    }
  }

  /** Passages that pass both gates for this person. */
  visiblePassages(who: Identity): Passage[] {
    return gate2(gate1(this.passages, who).allowed, who, this.live).allowed;
  }

  /** Documents this person can open (both gates), for the Body Parts view. */
  visibleDocuments(who: Identity): SourceDocument[] {
    const ids = new Set(this.visiblePassages(who).map((p) => p.docId));
    return [...this.docs.values()].filter((d) => ids.has(d.id)).map((d) => structuredClone(d));
  }

  /** Every ghost this person can see, for the Ghosts view. */
  ghostsFor(who: Identity): GhostNote[] {
    return [...findGhosts(this.visiblePassages(who)).values()].sort((a, b) => (a.docId < b.docId ? -1 : 1));
  }

  /** Operator view only (demo controls). Not filtered by identity. */
  allDocuments(): SourceDocument[] {
    return [...this.docs.values()].map((d) => structuredClone(d));
  }

  async ask(who: Identity, question: string): Promise<AskResponse> {
    const q = question.trim();
    if (!q || q.length > MAX_QUERY_CHARS) return { status: "invalid_query", message: INVALID_QUERY_MESSAGE };
    const requestId = this.newId();
    const seals: WalnutReport["seals"] = [];
    try {
      // 1. Write ahead: the request is in the Crypt (and Walnut's ledger) before anything is retrieved.
      await this.record("request.accepted", { requestId, userId: who.userId, question: maskSensitive(q) }, seals);

      // 2. Gate 1 (index-time ACL) then Gate 2 (live re-check, fail closed).
      const g1 = gate1(this.passages, who);
      const g2 = gate2(g1.allowed, who, this.live);

      // 3. Ghost check within what this person can see.
      const ghostMap = findGhosts(g2.allowed);
      const living = g2.allowed.filter((p) => !ghostMap.has(p.docId));
      const ghostPassages = g2.allowed.filter((p) => ghostMap.has(p.docId));

      // 4. Rank with statistics from the living, doubly permitted set only.
      const ranked = rank(q, living);
      const checkedAt = this.clock();
      const composed = compose(q, ranked, checkedAt);
      let { sentences, citations } = composed;
      const ghostIds = [...new Set(relevantExtras(q, living, ghostPassages).map((p) => p.docId))].sort();
      const ghosts = ghostIds.map((id) => ghostMap.get(id)!);

      // 4b. The Walnut grounding wall: each sentence is checked against only the passages it
      // cites; anything it cannot bind is dropped. Fail closed if Walnut cannot be reached.
      let walnut: WalnutReport | undefined;
      if (this.walnut) {
        if (this.forgeNext && sentences.length) sentences = [...sentences, { text: FORGED_SENTENCE, citations: [1] }];
        this.forgeNext = false;
        let wall;
        try {
          wall = sentences.length ? await this.walnut.ground(sentences, citations) : { sentences: [] };
        } catch (e) {
          throw e instanceof WalnutUnavailableError ? e : new WalnutUnavailableError("grounding failed");
        }
        const applied = applyWall(sentences, citations, wall.sentences);
        sentences = applied.sentences;
        citations = applied.citations;
        walnut = { kept: applied.sentences.length, dropped: applied.dropped, pointers: applied.pointers, seals };
      }

      // 5. Record the access decision before releasing anything.
      await this.record(
        "retrieval.decided",
        {
          requestId,
          gate1Allowed: g1.allowed.length,
          gate1Denied: g1.denied,
          gate2DeniedDocIds: g2.deniedDocIds,
          ghostDocIds: ghostIds,
          citedPassageIds: citations.map((c) => c.passageId),
          ...(walnut ? { walnutDropped: walnut.dropped.length } : {}),
        },
        seals,
      );

      const trail = walnut ? WALNUT_TRAIL : FULL_TRAIL;
      const extra = walnut ? { walnut } : {};
      const response: AskResponse = sentences.length
        ? { status: "answered", requestId, sentences, citations, ghosts, trail: trail.map((s) => ({ ...s })), ...extra }
        : { status: "no_answer", requestId, message: NO_ANSWER_MESSAGE, sentences: [], citations: [], ghosts, trail: trail.map((s) => ({ ...s })), ...extra };

      // 6. Seal the release.
      await this.record(
        "answer.released",
        {
          requestId,
          status: response.status,
          answerHash: await sha256Hex(canonical({ sentences: response.sentences, citations: response.citations.map((c) => c.passageId) })),
        },
        seals,
      );
      return response;
    } catch (e) {
      this.forgeNext = false;
      return { status: "ledger_unavailable", message: e instanceof WalnutUnavailableError ? STITCHES_UNAVAILABLE_MESSAGE : LEDGER_UNAVAILABLE_MESSAGE };
    }
  }

  async exorcise(who: Identity, docId: string): Promise<{ ok: boolean; message: string }> {
    if (!who.groups.includes(STEWARD_GROUP)) return { ok: false, message: "Only a data steward can exorcise a ghost." };
    const ghost = findGhosts(this.visiblePassages(who)).get(docId);
    if (!ghost) return { ok: false, message: "That document is not a ghost you can see." };
    try {
      await this.record("ghost.exorcised", { docId, title: ghost.title, version: ghost.version, by: who.userId });
    } catch (e) {
      return { ok: false, message: e instanceof WalnutUnavailableError ? STITCHES_UNAVAILABLE_MESSAGE : LEDGER_UNAVAILABLE_MESSAGE };
    }
    this.registry.setStatus(docId, "archived");
    const doc = this.docs.get(docId);
    if (doc) doc.status = "archived";
    this.passages = this.passages.map((p) => (p.docId === docId ? { ...p, status: "archived" } : p));
    return { ok: true, message: `Exorcised ${ghost.title} (v${ghost.version}). It will not haunt answers again.` };
  }

  /** Demo operator: change a permission at the source without re-indexing. Gate 2 must catch it. */
  async changeAtSource(docId: string, group: string, action: "revoke" | "restore", by: string): Promise<boolean> {
    const changed = action === "revoke" ? this.registry.revokeGroup(docId, group) : this.registry.restoreGroup(docId, group);
    if (changed) await this.record("acl.changed", { docId, group, action, by, reindexed: false });
    return changed;
  }

  liveAcl(docId: string) {
    return this.registry.get(docId);
  }

  async recordStitch(fileName: string, kind: string, passageCount: number, by: string): Promise<void> {
    await this.record("source.stitched", { fileName, kind, passageCount, by });
  }
}
