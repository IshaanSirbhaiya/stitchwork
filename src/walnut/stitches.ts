// The Walnut stitches: Stitchwork's client for the vendored, unchanged Walnut engine, which runs
// as a loopback Python service (`python -m stitch_walnut`). See .kiro/specs/walnut-stitches/.
import type { CryptType } from "../engine/ledger";
import type { AnswerSentence, Citation } from "../engine/types";

export interface WalnutPointer {
  source_id: string;
  kind: "doc_span";
  document_id: string;
  char_start: number;
  char_end: number;
  trust: "trusted" | "untrusted";
  capture_digest: string;
}

export interface WalnutSentenceVerdict {
  index: number;
  kept: boolean;
  reasons: string[];
  bound: { value: string; tags: string[] }[];
  pointers: { n: number; pointer: WalnutPointer }[];
}

export interface WalnutGroundResult {
  engine: "walnut";
  sentences: WalnutSentenceVerdict[];
  kept: number;
  dropped: number;
}

export interface WalnutSeal {
  type: CryptType;
  seq: number;
  hash: string;
  prev: string;
  seal: string;
  at: string;
}

export interface WalnutVerify {
  ok: boolean;
  why: string;
  count: number;
  head: string | null;
}

export interface WalnutTamper {
  attacks: { attack: string; detected: boolean; why: string }[];
  untouched: boolean;
  note?: string;
}

export interface WalnutHealth {
  ok: boolean;
  engine: "walnut";
  manifest: string;
  ephemeralKey: boolean;
  parts: string[];
}

/** What the Stitchwork engine needs from Walnut. Any rejection means "release nothing". */
export interface WalnutStitches {
  ground(sentences: AnswerSentence[], citations: Citation[]): Promise<WalnutGroundResult>;
  seal(type: CryptType, data: Record<string, unknown>): Promise<WalnutSeal>;
  verify(): Promise<WalnutVerify>;
  tamperDemo(): Promise<WalnutTamper>;
}

export class WalnutUnavailableError extends Error {
  constructor(detail: string) {
    super(`walnut stitches unavailable: ${detail}`);
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** HTTP client for `python -m stitch_walnut`. `base` is "" in the browser (same-origin proxy). */
export class HttpWalnut implements WalnutStitches {
  private fetchImpl: FetchLike;
  private timeoutMs: number;
  private callerKey: string | undefined;

  constructor(
    private base: string,
    opts: { fetch?: FetchLike; timeoutMs?: number; callerKey?: string } = {},
  ) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.callerKey = opts.callerKey;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/walnut/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(this.callerKey ? { "x-stitch-caller-key": this.callerKey } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new WalnutUnavailableError(e instanceof Error ? e.message : "network error");
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 200) throw new WalnutUnavailableError(`HTTP ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new WalnutUnavailableError("not JSON");
    }
  }

  ground(sentences: AnswerSentence[], citations: Citation[]): Promise<WalnutGroundResult> {
    return this.call("ground", {
      sentences: sentences.map((s) => ({ text: s.text, citations: s.citations })),
      citations: citations.map((c) => ({ n: c.n, passageId: c.passageId, docId: c.docId, kind: c.kind, sourceName: c.sourceName, text: c.text })),
    });
  }

  seal(type: CryptType, data: Record<string, unknown>): Promise<WalnutSeal> {
    return this.call("seal", { type, data });
  }

  verify(): Promise<WalnutVerify> {
    return this.call("verify");
  }

  tamperDemo(): Promise<WalnutTamper> {
    return this.call("tamper-demo", {});
  }

  health(): Promise<WalnutHealth> {
    return this.call("health");
  }
}

/** Probe for the stitches. Resolves to a client only when a real Walnut service answers. */
export async function probeWalnut(base = "", opts: { fetch?: FetchLike; timeoutMs?: number; tries?: number } = {}): Promise<HttpWalnut | null> {
  const client = new HttpWalnut(base, { timeoutMs: 4000, ...opts });
  for (let i = 0; i < (opts.tries ?? 2); i++) {
    try {
      const h = await client.health();
      return h && h.ok === true && h.engine === "walnut" ? new HttpWalnut(base, opts) : null;
    } catch {
      /* not reachable (yet): try once more, then run without Walnut */
    }
  }
  return null;
}

/** A deliberately forged sentence, for the "forge a stitch" demo control. It cites passage 1 but
 *  states a value and a name that no source holds, so the Walnut grounding wall must drop it. */
export const FORGED_SENTENCE = "Forged stitch: the limit was raised to 99 days, approved by Ozymandias Crane.";
