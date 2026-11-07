import { canonical, hmacHex, importHmacKey, sha256Hex } from "./hash";

export type CryptType =
  | "request.accepted"
  | "retrieval.decided"
  | "answer.released"
  | "ghost.exorcised"
  | "source.stitched"
  | "acl.changed";

export interface CryptEntry {
  seq: number;
  at: string;
  type: CryptType;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
  seal: string;
}

export const GENESIS = "0".repeat(64);

export type VerifyResult =
  | { ok: true; count: number }
  | { ok: false; count: number; brokenAt: number; reason: "hash-mismatch" | "seal-mismatch" | "chain-break" };

export class LedgerUnavailableError extends Error {
  constructor() {
    super("ledger unavailable");
  }
}

function entryHashInput(prevHash: string, e: Pick<CryptEntry, "seq" | "at" | "type" | "data">): string {
  return prevHash + canonical({ seq: e.seq, at: e.at, type: e.type, data: e.data });
}

export class Ledger {
  /** When true, the next append throws. Used by the "seal the Crypt shut" demo control and tests. */
  failNext = false;
  private log: CryptEntry[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private keyPromise: Promise<CryptoKey>;

  constructor(
    key: Uint8Array | string,
    private clock: () => Date = () => new Date(),
  ) {
    this.keyPromise = importHmacKey(key);
  }

  append(type: CryptType, data: Record<string, unknown>): Promise<CryptEntry> {
    const run = async (): Promise<CryptEntry> => {
      if (this.failNext) {
        this.failNext = false;
        throw new LedgerUnavailableError();
      }
      const key = await this.keyPromise;
      const prevHash = this.log.length ? this.log[this.log.length - 1].hash : GENESIS;
      const base = { seq: this.log.length, at: this.clock().toISOString(), type, data: JSON.parse(JSON.stringify(data)) };
      const hash = await sha256Hex(entryHashInput(prevHash, base));
      const entry: CryptEntry = { ...base, prevHash, hash, seal: await hmacHex(key, hash) };
      this.log.push(entry);
      return structuredClone(entry);
    };
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => undefined);
    return p;
  }

  entries(): CryptEntry[] {
    return structuredClone(this.log);
  }

  get size(): number {
    return this.log.length;
  }

  async verify(): Promise<VerifyResult> {
    return verifyChain(this.log, await this.keyPromise);
  }

  async tamperDemo(index?: number): Promise<{ index: number; result: VerifyResult } | null> {
    return tamperDemo(this.log, await this.keyPromise, index);
  }
}

export async function verifyChain(entries: CryptEntry[], key: CryptoKey): Promise<VerifyResult> {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i || e.prevHash !== prev) return { ok: false, count: entries.length, brokenAt: i, reason: "chain-break" };
    const expected = await sha256Hex(entryHashInput(prev, e));
    if (expected !== e.hash) return { ok: false, count: entries.length, brokenAt: i, reason: "hash-mismatch" };
    if ((await hmacHex(key, e.hash)) !== e.seal) return { ok: false, count: entries.length, brokenAt: i, reason: "seal-mismatch" };
    prev = e.hash;
  }
  return { ok: true, count: entries.length };
}

/** Copies the log, edits one entry's data in the copy, and verifies the copy. The real log is untouched. */
export async function tamperDemo(
  entries: CryptEntry[],
  key: CryptoKey,
  index?: number,
): Promise<{ index: number; result: VerifyResult } | null> {
  if (!entries.length) return null;
  const copy = structuredClone(entries);
  const i = index ?? Math.floor(copy.length / 2);
  copy[i].data = { ...copy[i].data, tampered: "a quiet edit by someone who should not have" };
  return { index: i, result: await verifyChain(copy, key) };
}
