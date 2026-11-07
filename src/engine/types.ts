import type { WalnutPointer } from "../walnut/stitches";

export type SourceKind = "wiki" | "ticket" | "chat" | "sheet";
export type DocStatus = "active" | "superseded" | "archived";

export interface Acl {
  groups: string[];
  users: string[];
}

export interface SourceDocument {
  id: string;
  kind: SourceKind;
  title: string;
  /** Human name of the system it came from, e.g. "Hollowmere Wiki". */
  sourceName: string;
  /** Lineage key. Documents sharing a docKey are versions of one another. */
  docKey: string;
  version: number;
  /** ISO date or date-time. */
  updatedAt: string;
  status: DocStatus;
  acl: Acl;
  passages: { location: string; text: string }[];
}

export interface Passage {
  id: string;
  docId: string;
  kind: SourceKind;
  title: string;
  sourceName: string;
  location: string;
  text: string;
  docKey: string;
  version: number;
  updatedAt: string;
  status: DocStatus;
  /** ACL captured at index time. Gate 1 uses this. */
  acl: Acl;
}

export interface AdapterResult {
  documents: SourceDocument[];
  warnings: string[];
}

export interface Identity {
  userId: string;
  groups: string[];
}

export interface Persona extends Identity {
  name: string;
  role: string;
}

export interface Citation {
  n: number;
  passageId: string;
  docId: string;
  kind: SourceKind;
  title: string;
  sourceName: string;
  location: string;
  version: number;
  updatedAt: string;
  checkedAt: string;
  dusty: boolean;
  text: string;
}

export interface AnswerSentence {
  text: string;
  citations: number[];
}

export interface GhostNote {
  docId: string;
  title: string;
  version: number;
  reason: "newer-version" | "marked-superseded";
  livingDocId?: string;
  livingTitle?: string;
  livingVersion?: number;
}

export interface TrailStep {
  step: "identity" | "crypt-accept" | "gate-1" | "gate-2" | "ghost-check" | "stitch" | "walnut-wall" | "crypt-seal";
  ok: boolean;
}

/** What the Walnut stitches did to one answer. Present only when the Walnut engine is attached. */
export interface WalnutReport {
  /** Sentences the Walnut grounding wall kept and dropped. */
  kept: number;
  dropped: { text: string; reasons: string[] }[];
  /** One sealed Walnut SourcePointer per kept sentence and citation (numbers after renumbering). */
  pointers: { sentence: number; n: number; pointer: WalnutPointer }[];
  /** The Crypt events sealed into Walnut's durable ledger for this request, in order. */
  seals: { type: string; seq: number }[];
}

export type AskResponse =
  | {
      status: "answered";
      requestId: string;
      sentences: AnswerSentence[];
      citations: Citation[];
      ghosts: GhostNote[];
      trail: TrailStep[];
      walnut?: WalnutReport;
    }
  | {
      status: "no_answer";
      requestId: string;
      message: string;
      sentences: [];
      citations: [];
      ghosts: GhostNote[];
      trail: TrailStep[];
      walnut?: WalnutReport;
    }
  | { status: "invalid_query"; message: string }
  | { status: "ledger_unavailable"; message: string };

export const NO_ANSWER_MESSAGE = "No source you can open answers this yet.";
export const INVALID_QUERY_MESSAGE = "Ask a question between 1 and 300 characters.";
export const LEDGER_UNAVAILABLE_MESSAGE = "The Crypt could not be written, so no answer was released.";
export const STITCHES_UNAVAILABLE_MESSAGE = "The Walnut stitches could not check or seal this answer, so nothing was released.";
export const MAX_QUERY_CHARS = 300;
