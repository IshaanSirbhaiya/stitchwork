import { makeEngine, persona } from "../helpers";
import { NO_ANSWER_MESSAGE } from "../../src/engine/types";
import type { LiveAcl } from "../../src/engine/corpus";

const GRAVEWELL = "Is Gravewell Logistics under investigation?";

describe("Gate 1 (permission-gates requirement 2)", () => {
  test("2.1 a fincrime ticket is never cited for an account manager", async () => {
    const { engine } = makeEngine();
    const r = await engine.ask(persona("theo"), GRAVEWELL);
    expect(r.status).toBe("answered");
    if (r.status !== "answered") return;
    expect(r.citations.map((c) => c.docId)).not.toContain("FIN-13");
    expect(JSON.stringify(r)).not.toMatch(/FIN-13|investigat|fincrime/i);
  });

  test("2.1 the compliance officer does get the fincrime ticket", async () => {
    const { engine } = makeEngine();
    const r = await engine.ask(persona("iris"), GRAVEWELL);
    expect(r.status === "answered" && r.citations.map((c) => c.docId)).toContain("FIN-13");
  });

  test("3.2 (source-stitching) the private fincrime channel is visible only to its member", () => {
    const { engine } = makeEngine();
    const ids = (who: string) => engine.visibleDocuments(persona(who)).map((d) => d.id);
    expect(ids("iris").some((id) => id.startsWith("chat:fincrime-room"))).toBe(true);
    expect(ids("theo").some((id) => id.startsWith("chat:fincrime-room"))).toBe(false);
  });

  test("2.2 archived documents are excluded for everyone", async () => {
    const { engine } = makeEngine();
    const iris = persona("iris");
    const before = await engine.ask(iris, "Can I work remotely?");
    expect(before.status === "no_answer" && before.ghosts.map((g) => g.docId)).toEqual(["remote-work-2024"]);
    expect((await engine.exorcise(iris, "remote-work-2024")).ok).toBe(true);
    const after = await engine.ask(iris, "Can I work remotely?");
    expect(after.status === "no_answer" && after.ghosts).toEqual([]);
    expect(engine.visibleDocuments(persona("mara")).map((d) => d.id)).not.toContain("remote-work-2024");
  });
});

describe("Gate 2 (permission-gates requirement 3)", () => {
  test("3.1 a revoke at the source takes effect before re-indexing", async () => {
    const { engine, ledger } = makeEngine();
    const theo = persona("theo");
    const q = "What discount can an account manager approve?";
    const before = await engine.ask(theo, q);
    expect(before.status === "answered" && before.citations.map((c) => c.docId)).toContain("pricing-guidelines");

    expect(await engine.changeAtSource("pricing-guidelines", "sales", "revoke", "operator")).toBe(true);
    const after = await engine.ask(theo, q);
    expect(after.status === "answered" && after.citations.map((c) => c.docId)).not.toContain("pricing-guidelines");

    // 3.3 the denial is in the Crypt, not in the response.
    expect(JSON.stringify(after)).not.toContain("pricing-guidelines");
    const decided = ledger.entries().filter((e) => e.type === "retrieval.decided").pop()!;
    expect(decided.data.gate2DeniedDocIds).toEqual(["pricing-guidelines"]);
    expect(ledger.entries().some((e) => e.type === "acl.changed" && e.data.docId === "pricing-guidelines")).toBe(true);
  });

  test("3.2 a throwing live check fails closed", async () => {
    const throwing: LiveAcl = {
      check() {
        throw new Error("source system timeout");
      },
    };
    const { engine } = makeEngine(undefined, throwing);
    const r = await engine.ask(persona("iris"), GRAVEWELL);
    expect(r).toMatchObject({ status: "no_answer", message: NO_ANSWER_MESSAGE, citations: [] });
  });

  test("3.2 a live check that returns a non-boolean is treated as deny", async () => {
    const weird = { check: () => "yes" as unknown as boolean };
    const { engine } = makeEngine(undefined, weird);
    expect((await engine.ask(persona("mara"), "What caused the claims portal outage?")).status).toBe("no_answer");
  });
});

describe("responses never carry denial counts (requirement 5.2)", () => {
  test("no gate counts or denied ids appear in any persona's response", async () => {
    const { engine } = makeEngine();
    for (const id of ["mara", "theo", "nova", "sam"]) {
      const r = await engine.ask(persona(id), GRAVEWELL);
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/gate1Denied|gate2Denied|deniedDocIds|FIN-13/);
    }
  });
});

describe("input limits (requirement 6.1)", () => {
  test("empty and over-long questions are refused without a Crypt entry", async () => {
    const { engine, ledger } = makeEngine();
    expect((await engine.ask(persona("mara"), "   ")).status).toBe("invalid_query");
    expect((await engine.ask(persona("mara"), "x".repeat(301))).status).toBe("invalid_query");
    expect(ledger.size).toBe(0);
    expect((await engine.ask(persona("mara"), "x".repeat(300))).status).toBe("no_answer");
  });
});
