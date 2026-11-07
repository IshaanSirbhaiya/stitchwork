import fc from "fast-check";
import { loadDataset } from "../../src/data";
import { PERSONAS, SAMPLE_QUESTIONS } from "../../src/data/personas";
import { aclAllows } from "../../src/engine/corpus";
import { applyWall, Engine } from "../../src/engine/engine";
import { Ledger } from "../../src/engine/ledger";
import { LEDGER_UNAVAILABLE_MESSAGE, STITCHES_UNAVAILABLE_MESSAGE, type AskResponse, type Citation, type Identity, type SourceDocument } from "../../src/engine/types";
import { FORGED_SENTENCE, HttpWalnut, probeWalnut, WalnutUnavailableError } from "../../src/walnut/stitches";
import { FIXED_NOW, persona } from "../helpers";
import { FakeWalnut } from "./fake";

const ALL = loadDataset().documents;
const REFUND = "What is the refund window for cancelled policies?";

function make(documents: SourceDocument[] = ALL, walnut = new FakeWalnut()) {
  let n = 0;
  const ledger = new Ledger("test-ledger-key", () => FIXED_NOW);
  const engine = new Engine({ documents, ledger, clock: () => FIXED_NOW, newId: () => `req-${++n}`, walnut });
  return { engine, ledger, walnut };
}

describe("walnut-stitches: write-ahead order (requirement 2)", () => {
  test("accepted is sealed before the wall runs, decided after it, released last; each Walnut seal precedes its Crypt entry", async () => {
    const { engine, ledger, walnut } = make();
    const sizes: number[] = [];
    const seal = walnut.seal.bind(walnut);
    walnut.seal = async (t, d) => {
      sizes.push(ledger.size);
      return seal(t, d);
    };
    const r = await engine.ask(persona("mara"), REFUND);
    expect(r.status).toBe("answered");
    expect(walnut.calls).toEqual(["seal:request.accepted", "ground", "seal:retrieval.decided", "seal:answer.released"]);
    expect(sizes).toEqual([0, 1, 2]);
    expect(ledger.entries().map((e) => e.type)).toEqual(["request.accepted", "retrieval.decided", "answer.released"]);
    if (r.status === "answered") {
      expect(r.walnut?.seals).toEqual([
        { type: "request.accepted", seq: 1 },
        { type: "retrieval.decided", seq: 2 },
        { type: "answer.released", seq: 3 },
      ]);
      expect(r.trail.map((t) => t.step)).toContain("walnut-wall");
    }
  });

  test("the Walnut copy of each event carries the same data as the Crypt entry", async () => {
    const { engine, ledger, walnut } = make();
    await engine.ask(persona("mara"), REFUND);
    expect(walnut.seals.map((s) => s.data)).toEqual(ledger.entries().map((e) => e.data));
  });
});

describe("walnut-stitches: fail closed (requirement 3)", () => {
  for (const type of ["request.accepted", "retrieval.decided", "answer.released"] as const) {
    test(`a refused Walnut seal at ${type} releases nothing`, async () => {
      const { engine, ledger, walnut } = make();
      walnut.failSeal = type;
      const r = await engine.ask(persona("mara"), REFUND);
      expect(r).toEqual({ status: "ledger_unavailable", message: STITCHES_UNAVAILABLE_MESSAGE });
      expect(ledger.entries().some((e) => e.type === "answer.released")).toBe(false);
    });
  }

  test("an unreachable grounding wall releases nothing and records no decision", async () => {
    const { engine, ledger, walnut } = make();
    walnut.failGround = true;
    const r = await engine.ask(persona("mara"), REFUND);
    expect(r).toEqual({ status: "ledger_unavailable", message: STITCHES_UNAVAILABLE_MESSAGE });
    expect(ledger.entries().map((e) => e.type)).toEqual(["request.accepted"]);
  });

  test("the in-page Crypt failing still reports the Crypt message", async () => {
    const { engine, ledger } = make();
    ledger.failNext = true;
    expect(await engine.ask(persona("mara"), REFUND)).toEqual({ status: "ledger_unavailable", message: LEDGER_UNAVAILABLE_MESSAGE });
  });
});

describe("walnut-stitches: the grounding wall decides what is released (requirement 1)", () => {
  test("the wall sees only doubly permitted, living citations", async () => {
    const { engine, walnut } = make();
    await engine.ask(persona("theo"), "Is Gravewell Logistics under investigation?");
    const seen = JSON.stringify(walnut.lastGround);
    expect(seen).not.toContain("FIN-13");
    expect(seen.toLowerCase()).not.toContain("fincrime");
  });

  test("a forged stitch reaches the wall and is dropped, with its reasons shown", async () => {
    const { engine, walnut } = make();
    engine.forgeNext = true;
    const r = await engine.ask(persona("mara"), REFUND);
    expect(walnut.lastGround!.sentences.at(-1)!.text).toBe(FORGED_SENTENCE);
    expect(engine.forgeNext).toBe(false);
    if (r.status !== "answered") throw new Error("expected an answer");
    expect(r.sentences.map((s) => s.text)).not.toContain(FORGED_SENTENCE);
    expect(r.walnut!.dropped).toEqual([{ text: FORGED_SENTENCE, reasons: ["value not in its sources: 99"] }]);
    expect(r.walnut!.kept).toBe(r.sentences.length);
  });

  test("every kept sentence still cites a citation that exists, with a Walnut pointer per citation", async () => {
    const { engine } = make();
    for (const who of PERSONAS)
      for (const q of SAMPLE_QUESTIONS) {
        const r = await engine.ask(who, q);
        if (r.status !== "answered") continue;
        const ns = new Set(r.citations.map((c) => c.n));
        r.sentences.forEach((s) => s.citations.forEach((n) => expect(ns.has(n)).toBe(true)));
        expect(new Set(r.walnut!.pointers.map((p) => p.n))).toEqual(ns);
      }
  });

  test("without Walnut the engine behaves exactly as before (no walnut field, original trail)", async () => {
    let n = 0;
    const engine = new Engine({ documents: ALL, ledger: new Ledger("k", () => FIXED_NOW), clock: () => FIXED_NOW, newId: () => `req-${++n}` });
    const r = await engine.ask(persona("mara"), REFUND);
    expect("walnut" in r).toBe(false);
    if (r.status === "answered") expect(r.trail.map((t) => t.step)).not.toContain("walnut-wall");
    engine.forgeNext = true;
    const again = await engine.ask(persona("mara"), REFUND);
    if (again.status === "answered") expect(again.sentences.map((s) => s.text)).not.toContain(FORGED_SENTENCE);
  });
});

describe("applyWall renumbers what survives", () => {
  const cite = (n: number): Citation => ({ n, passageId: `p${n}`, docId: `d${n}`, kind: "wiki", title: "t", sourceName: "s", location: "l", version: 1, updatedAt: "2026-01-01", checkedAt: "x", dusty: false, text: `text ${n}` });
  const ptr = (n: number) => ({ n, pointer: { source_id: "s", kind: "doc_span" as const, document_id: `p${n}`, char_start: 0, char_end: 1, trust: "trusted" as const, capture_digest: "x" } });

  test("dropping the sentence that alone used citation 1 renumbers 2 and 3 to 1 and 2", () => {
    const out = applyWall(
      [{ text: "a", citations: [1] }, { text: "b", citations: [2] }, { text: "c", citations: [3, 2] }],
      [cite(1), cite(2), cite(3)],
      [
        { index: 0, kept: false, reasons: ["value not in its sources: 9"], pointers: [] },
        { index: 1, kept: true, reasons: [], pointers: [ptr(2)] },
        { index: 2, kept: true, reasons: [], pointers: [ptr(3), ptr(2)] },
      ],
    );
    expect(out.sentences).toEqual([{ text: "b", citations: [1] }, { text: "c", citations: [2, 1] }]);
    expect(out.citations.map((c) => [c.n, c.passageId])).toEqual([[1, "p2"], [2, "p3"]]);
    expect(out.dropped).toEqual([{ text: "a", reasons: ["value not in its sources: 9"] }]);
    expect(out.pointers.map((p) => [p.sentence, p.n, p.pointer.document_id])).toEqual([[0, 1, "p2"], [1, 2, "p3"], [1, 1, "p2"]]);
  });

  test("a sentence with no verdict is dropped, never released by default", () => {
    const out = applyWall([{ text: "a", citations: [1] }], [cite(1)], []);
    expect(out.sentences).toEqual([]);
    expect(out.dropped[0].reasons).toEqual(["no verdict from the wall"]);
  });
});

describe("restricted still looks exactly like nonexistent with Walnut attached (permission-gates P1)", () => {
  const canOpen = (d: SourceDocument, who: Identity) => d.status !== "archived" && aclAllows(d.acl, who);
  const strip = (r: AskResponse) => {
    if (r.status !== "answered" && r.status !== "no_answer") return r;
    const { requestId: _r, ...rest } = r;
    return rest;
  };
  test("for every persona and sample question, removing what they cannot open changes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...PERSONAS), fc.constantFrom(...SAMPLE_QUESTIONS), async (who, q) => {
        const a = await make(ALL).engine.ask(who, q);
        const b = await make(ALL.filter((d) => canOpen(d, who))).engine.ask(who, q);
        expect(strip(a)).toEqual(strip(b));
      }),
      { numRuns: 60 },
    );
  });
});

describe("HttpWalnut fails closed", () => {
  const respond = (status: number, body: string) => async () => new Response(body, { status });

  test("a non-200 answer is WalnutUnavailableError", async () => {
    await expect(new HttpWalnut("", { fetch: respond(503, "{}") }).seal("request.accepted", {})).rejects.toBeInstanceOf(WalnutUnavailableError);
  });

  test("a network error is WalnutUnavailableError", async () => {
    const boom = async () => {
      throw new TypeError("connection refused");
    };
    await expect(new HttpWalnut("", { fetch: boom }).verify()).rejects.toBeInstanceOf(WalnutUnavailableError);
  });

  test("a static host's HTML fallback is not mistaken for Walnut", async () => {
    expect(await probeWalnut("", { fetch: respond(200, "<!doctype html><title>Stitchwork</title>") })).toBeNull();
    expect(await probeWalnut("", { fetch: respond(200, JSON.stringify({ ok: true, engine: "other" })) })).toBeNull();
    expect(await probeWalnut("", { fetch: respond(200, JSON.stringify({ ok: true, engine: "walnut" })) })).not.toBeNull();
  });
});
