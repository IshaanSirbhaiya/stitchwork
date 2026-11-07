import { parseWiki } from "../../src/engine/adapters/wiki";
import { toPassages } from "../../src/engine/corpus";
import { findGhosts, isDusty } from "../../src/engine/ghosts";
import type { SourceDocument } from "../../src/engine/types";
import { loadDataset } from "../../src/data";
import { FIXED_NOW, makeEngine, persona } from "../helpers";

function page(id: string, extra: string, body = "## Rule\nThe refund window is in this page."): SourceDocument {
  return parseWiki(`---\nid: ${id}\ntitle: ${id}\n${extra}\n---\n${body}`, `${id}.md`).documents[0];
}

describe("detecting ghosts (ghost-versions requirement 1)", () => {
  test("1.1 older version in the same lineage is a ghost; v2 is cited", async () => {
    const { engine } = makeEngine();
    const r = await engine.ask(persona("mara"), "What is the refund window for cancelled policies?");
    expect(r.status).toBe("answered");
    if (r.status !== "answered") return;
    expect(r.citations[0].docId).toBe("claims-handbook-v2");
    expect(r.citations.map((c) => c.docId)).not.toContain("claims-handbook-v1");
    expect(r.ghosts).toEqual([
      { docId: "claims-handbook-v1", title: "Claims Handbook", version: 1, reason: "newer-version", livingDocId: "claims-handbook-v2", livingTitle: "Claims Handbook", livingVersion: 2 },
    ]);
  });

  test("1.2 status superseded with no successor is a ghost", () => {
    const g = findGhosts(toPassages(page("old", "status: superseded")));
    expect(g.get("old")).toMatchObject({ reason: "marked-superseded" });
    expect(g.get("old")?.livingDocId).toBeUndefined();
  });

  test("1.3 ghosts are judged only within what the asker can see", () => {
    const v1 = page("h-v1", "docKey: h\nversion: 1\ngroups: [staff]");
    const v2 = page("h-v2", "docKey: h\nversion: 2\ngroups: [hr]");
    const { engine } = makeEngine([v1, v2]);
    // Mara (staff) cannot open v2, so v1 is living for her and no ghost note reveals v2.
    expect(engine.ghostsFor(persona("mara"))).toEqual([]);
    expect(engine.ghostsFor(persona("nova")).map((g) => g.docId)).toEqual(["h-v1"]);
  });

  test("1.4 equal versions: later updatedAt wins, then smaller id", () => {
    const a = page("a", "docKey: k\nversion: 2\nupdated: 2026-01-01");
    const b = page("b", "docKey: k\nversion: 2\nupdated: 2026-02-01");
    expect([...findGhosts([...toPassages(a), ...toPassages(b)]).keys()]).toEqual(["a"]);
    const c = page("c", "docKey: k\nversion: 2\nupdated: 2026-02-01");
    expect([...findGhosts([...toPassages(b), ...toPassages(c)]).keys()]).toEqual(["c"]);
  });
});

describe("ghost notes (requirement 2)", () => {
  test("2.2 an unrelated question has no ghost notes", async () => {
    const { engine } = makeEngine();
    const r = await engine.ask(persona("mara"), "Who fixes the lantern room heating?");
    expect(r.status === "answered" && r.ghosts).toEqual([]);
  });
});

describe("dusty sources (requirement 3)", () => {
  test("3.1 dusty after 540 days, not before", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(isDusty(new Date(FIXED_NOW.getTime() - 541 * day).toISOString(), FIXED_NOW)).toBe(true);
    expect(isDusty(new Date(FIXED_NOW.getTime() - 539 * day).toISOString(), FIXED_NOW)).toBe(false);
  });

  test("3.1 an old unreplaced page is cited but flagged dusty", async () => {
    const old = page("ancient", "updated: 2024-01-01\ngroups: [everyone]", "## Lamps\nThe lamp oil store is in the cellar.");
    const { engine } = makeEngine([...loadDataset().documents, old]);
    const r = await engine.ask(persona("sam"), "Where is the lamp oil store?");
    expect(r.status === "answered" && r.citations[0]).toMatchObject({ docId: "ancient", dusty: true });
  });
});

describe("exorcism (requirement 4)", () => {
  test("4.2 a non-steward cannot exorcise and nothing changes", async () => {
    const { engine, ledger } = makeEngine();
    expect(await engine.exorcise(persona("mara"), "claims-handbook-v1")).toEqual({ ok: false, message: "Only a data steward can exorcise a ghost." });
    expect(ledger.size).toBe(0);
    expect(engine.ghostsFor(persona("mara")).map((g) => g.docId)).toContain("claims-handbook-v1");
  });

  test("4.1 and 4.3 a steward exorcises; Crypt records it; the ghost is gone for everyone", async () => {
    const { engine, ledger } = makeEngine();
    const res = await engine.exorcise(persona("iris"), "claims-handbook-v1");
    expect(res.ok).toBe(true);
    const e = ledger.entries()[0];
    expect(e).toMatchObject({ type: "ghost.exorcised", data: { docId: "claims-handbook-v1", by: "iris" } });
    expect(engine.ghostsFor(persona("mara")).map((g) => g.docId)).not.toContain("claims-handbook-v1");
    const r = await engine.ask(persona("mara"), "What is the refund window for cancelled policies?");
    expect(r.status === "answered" && r.ghosts).toEqual([]);
  });

  test("a steward cannot exorcise a living document", async () => {
    const { engine } = makeEngine();
    expect((await engine.exorcise(persona("iris"), "claims-handbook-v2")).ok).toBe(false);
  });
});
