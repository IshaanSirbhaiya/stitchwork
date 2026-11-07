import fc from "fast-check";
import { importHmacKey } from "../../src/engine/hash";
import { GENESIS, Ledger, verifyChain, type CryptEntry } from "../../src/engine/ledger";
import { LEDGER_UNAVAILABLE_MESSAGE } from "../../src/engine/types";
import { FIXED_NOW, makeEngine, persona } from "../helpers";

async function filled(n: number): Promise<{ ledger: Ledger; key: CryptoKey }> {
  const ledger = new Ledger("k", () => FIXED_NOW);
  for (let i = 0; i < n; i++) await ledger.append("source.stitched", { fileName: `f${i}.md`, i });
  return { ledger, key: await importHmacKey("k") };
}

describe("append and chain (crypt-ledger requirement 1)", () => {
  test("1.1 and 1.2 entries are chained from the genesis hash and sealed", async () => {
    const { ledger, key } = await filled(5);
    const es = ledger.entries();
    expect(es[0].prevHash).toBe(GENESIS);
    for (let i = 1; i < es.length; i++) expect(es[i].prevHash).toBe(es[i - 1].hash);
    expect(es.every((e) => /^[0-9a-f]{64}$/.test(e.hash) && /^[0-9a-f]{64}$/.test(e.seal))).toBe(true);
    expect(await verifyChain(es, key)).toEqual({ ok: true, count: 5 });
  });

  test("1.3 an answered question writes accepted, decided, released in order with one request id", async () => {
    const { engine, ledger } = makeEngine();
    await engine.ask(persona("mara"), "What caused the claims portal outage?");
    const es = ledger.entries();
    expect(es.map((e) => e.type)).toEqual(["request.accepted", "retrieval.decided", "answer.released"]);
    expect(new Set(es.map((e) => e.data.requestId))).toEqual(new Set(["req-1"]));
  });

  test("1.4 a failed append releases nothing", async () => {
    const { engine, ledger } = makeEngine();
    ledger.failNext = true;
    const r = await engine.ask(persona("mara"), "What caused the claims portal outage?");
    expect(r).toEqual({ status: "ledger_unavailable", message: LEDGER_UNAVAILABLE_MESSAGE });
    expect(ledger.size).toBe(0);
    // The next question works again.
    expect((await engine.ask(persona("mara"), "What caused the claims portal outage?")).status).toBe("answered");
  });

  test("concurrent appends still form one valid chain", async () => {
    const ledger = new Ledger("k", () => FIXED_NOW);
    await Promise.all(Array.from({ length: 10 }, (_, i) => ledger.append("source.stitched", { i })));
    expect(await ledger.verify()).toEqual({ ok: true, count: 10 });
  });
});

describe("verify (requirement 2)", () => {
  test("2.2 property: changing any one entry's data is caught at that entry", async () => {
    const { ledger, key } = await filled(8);
    const base = ledger.entries();
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: base.length - 1 }), fc.string({ minLength: 1, maxLength: 20 }), async (i, value) => {
        const copy: CryptEntry[] = structuredClone(base);
        copy[i].data = { ...copy[i].data, edited: value };
        const r = await verifyChain(copy, key);
        expect(r).toMatchObject({ ok: false, brokenAt: i, reason: "hash-mismatch" });
      }),
      { numRuns: 60 },
    );
  });

  test("2.2 swapping two entries is a chain break", async () => {
    const { ledger, key } = await filled(4);
    const es = ledger.entries();
    [es[1], es[2]] = [es[2], es[1]];
    expect(await verifyChain(es, key)).toMatchObject({ ok: false, brokenAt: 1, reason: "chain-break" });
  });

  test("2.2 recomputing a hash without the key is caught by the seal", async () => {
    const { ledger, key } = await filled(3);
    const es = ledger.entries();
    const forged = new Ledger("attacker-key", () => FIXED_NOW);
    for (const e of es) await forged.append(e.type, e.data);
    const fes = forged.entries();
    expect(fes[0].hash).toBe(es[0].hash); // same content, same hash
    expect(await verifyChain(fes, key)).toMatchObject({ ok: false, brokenAt: 0, reason: "seal-mismatch" });
  });
});

describe("tamper demo (requirement 3)", () => {
  test("3.1 the copy fails verification and the real log still verifies", async () => {
    const { ledger } = await filled(5);
    const demo = await ledger.tamperDemo(2);
    expect(demo).toMatchObject({ index: 2, result: { ok: false, brokenAt: 2, reason: "hash-mismatch" } });
    expect(await ledger.verify()).toEqual({ ok: true, count: 5 });
  });

  test("3.2 empty log returns null", async () => {
    expect(await new Ledger("k").tamperDemo()).toBeNull();
  });
});

describe("masking in the Crypt (requirement 5)", () => {
  test("5.1 a card number typed into a question is masked in the Crypt", async () => {
    const { engine, ledger } = makeEngine();
    await engine.ask(persona("mara"), "Why did a caller read card 4111 1111 1111 1111?");
    const accepted = ledger.entries()[0];
    expect(accepted.data.question).toBe("Why did a caller read card [card ending 1111]?");
  });
});
