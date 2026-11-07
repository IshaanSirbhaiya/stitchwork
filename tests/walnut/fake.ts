import type { CryptType } from "../../src/engine/ledger";
import type { AnswerSentence, Citation } from "../../src/engine/types";
import type { WalnutGroundResult, WalnutSeal, WalnutStitches, WalnutTamper, WalnutVerify } from "../../src/walnut/stitches";

/**
 * An in-process stand-in for the Walnut stitches, used to test the engine's wiring (order, fail
 * closed, renumbering) without Python. Its "wall" is a crude imitation: a sentence is dropped when
 * it states a number its cited passages do not contain. The real wall is tested in
 * tests/walnut/sidecar.integration.test.ts and tests_py/.
 */
export class FakeWalnut implements WalnutStitches {
  calls: string[] = [];
  seals: { type: CryptType; data: Record<string, unknown> }[] = [];
  failSeal: CryptType | null = null;
  failGround = false;
  lastGround: { sentences: AnswerSentence[]; citations: Citation[] } | null = null;

  async ground(sentences: AnswerSentence[], citations: Citation[]): Promise<WalnutGroundResult> {
    this.calls.push("ground");
    this.lastGround = { sentences: structuredClone(sentences), citations: structuredClone(citations) };
    if (this.failGround) throw new Error("wall down");
    const verdicts = sentences.map((s, index) => {
      const cited = citations.filter((c) => s.citations.includes(c.n));
      const nums = s.text.match(/\d+/g) ?? [];
      const unbound = nums.filter((n) => !cited.some((c) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(c.text)));
      const reasons = [...unbound.map((v) => `value not in its sources: ${v}`), ...(cited.length ? [] : ["cites no passage"])];
      const kept = reasons.length === 0;
      return {
        index,
        kept,
        reasons,
        bound: [],
        pointers: kept
          ? cited.map((c) => ({
              n: c.n,
              pointer: { source_id: c.sourceName, kind: "doc_span" as const, document_id: c.passageId, char_start: 0, char_end: c.text.length, trust: c.kind === "chat" || c.kind === "ticket" ? ("untrusted" as const) : ("trusted" as const), capture_digest: "x" },
            }))
          : [],
      };
    });
    return { engine: "walnut", sentences: verdicts, kept: verdicts.filter((v) => v.kept).length, dropped: verdicts.filter((v) => !v.kept).length };
  }

  async seal(type: CryptType, data: Record<string, unknown>): Promise<WalnutSeal> {
    this.calls.push(`seal:${type}`);
    if (this.failSeal === type) throw new Error("ledger refused");
    this.seals.push({ type, data: structuredClone(data) });
    const seq = this.seals.length;
    return { type, seq, hash: `h${seq}`, prev: `h${seq - 1}`, seal: `s${seq}`, at: "2026-11-04T10:00:00Z" };
  }

  async verify(): Promise<WalnutVerify> {
    return { ok: true, why: "", count: this.seals.length, head: this.seals.length ? `h${this.seals.length}` : null };
  }

  async tamperDemo(): Promise<WalnutTamper> {
    return { attacks: [], untouched: true };
  }
}
