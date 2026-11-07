import fc from "fast-check";
import { loadDataset } from "../../src/data";
import { PERSONAS, SAMPLE_QUESTIONS } from "../../src/data/personas";
import { aclAllows } from "../../src/engine/corpus";
import { tokenize } from "../../src/engine/tokenize";
import type { AskResponse, Identity, SourceDocument } from "../../src/engine/types";
import { makeEngine } from "../helpers";

const ALL = loadDataset().documents;

function canOpen(d: SourceDocument, who: Identity): boolean {
  return d.status !== "archived" && aclAllows(d.acl, who);
}

/** Response minus the fields that legitimately vary per request. */
function strip(r: AskResponse): unknown {
  if (r.status === "answered" || r.status === "no_answer") {
    const { requestId: _ignored, ...rest } = r;
    return rest;
  }
  return r;
}

// Vocabulary: every token in the corpus, with restricted-only words (gravewell, investigation, salary...) included.
const VOCAB = [...new Set(ALL.flatMap((d) => d.passages.flatMap((p) => tokenize(`${d.title} ${p.text}`))))];
const RESTRICTED_WORDS = ["gravewell", "logistics", "investigation", "suspicious", "tipping", "salary", "band", "headcount", "fincrime", "refunds", "held"];
const wordArb = fc.constantFrom(...VOCAB, ...RESTRICTED_WORDS);
const questionArb = fc.oneof(
  fc.array(wordArb, { minLength: 1, maxLength: 6 }).map((ws) => ws.join(" ")),
  fc.constantFrom(...SAMPLE_QUESTIONS),
);
const personaArb = fc.constantFrom(...PERSONAS);

describe("restricted looks exactly like nonexistent (permission-gates P1, requirement 5.1)", () => {
  test("for every persona, removing documents they cannot open changes nothing in their responses", async () => {
    await fc.assert(
      fc.asyncProperty(personaArb, questionArb, async (who, q) => {
        const full = makeEngine(ALL).engine;
        const reduced = makeEngine(ALL.filter((d) => canOpen(d, who))).engine;
        const a = await full.ask(who, q);
        const b = await reduced.ask(who, q);
        expect(strip(a)).toEqual(strip(b));
      }),
      { numRuns: 250 },
    );
  });

  test("a restricted question and a nonsense question both get the fixed no_answer shape for a contractor", async () => {
    const { engine } = makeEngine();
    const sam = PERSONAS.find((p) => p.userId === "sam")!;
    const real = strip(await engine.ask(sam, "Is Gravewell Logistics under investigation?"));
    const fake = strip(await engine.ask(sam, "Is Moonbeam Freight under investigation?"));
    expect(real).toEqual(fake);
  });
});

describe("every citation is doubly permitted (P2, requirements 2.1 and 3.2)", () => {
  test("cited documents are always openable by the asker", async () => {
    await fc.assert(
      fc.asyncProperty(personaArb, questionArb, async (who, q) => {
        const { engine } = makeEngine(ALL);
        const r = await engine.ask(who, q);
        if (r.status !== "answered") return;
        for (const c of r.citations) {
          const doc = ALL.find((d) => d.id === c.docId)!;
          expect(canOpen(doc, who)).toBe(true);
        }
      }),
      { numRuns: 250 },
    );
  });
});

describe("every sentence is stitched (P3, requirement 4.4)", () => {
  test("each answered sentence has at least one valid citation with full provenance", async () => {
    await fc.assert(
      fc.asyncProperty(personaArb, questionArb, async (who, q) => {
        const { engine } = makeEngine(ALL);
        const r = await engine.ask(who, q);
        if (r.status !== "answered") return;
        const ns = new Set(r.citations.map((c) => c.n));
        expect(r.citations.length).toBeLessThanOrEqual(3);
        for (const s of r.sentences) {
          expect(s.citations.length).toBeGreaterThan(0);
          s.citations.forEach((n) => expect(ns.has(n)).toBe(true));
        }
        for (const c of r.citations) {
          expect(c.title && c.location && c.updatedAt && c.checkedAt && c.version > 0).toBeTruthy();
        }
      }),
      { numRuns: 150 },
    );
  });
});
