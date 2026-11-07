// End to end against the REAL Walnut engine: starts `python -m stitch_walnut` (vendored, unchanged
// Walnut code) on a loopback port and runs the Stitchwork engine and API through it.
// Needs Python 3.11+ with pydantic and PyYAML (requirements-walnut.txt). Set STITCH_PYTHON to the
// interpreter; the suite is skipped, and says so, when none is available.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { handleAsk, handleSession, route } from "../../server/handler";
import { loadDataset } from "../../src/data";
import { PERSONAS, SAMPLE_QUESTIONS } from "../../src/data/personas";
import { Engine } from "../../src/engine/engine";
import { Ledger } from "../../src/engine/ledger";
import type { AskResponse } from "../../src/engine/types";
import { FORGED_SENTENCE, HttpWalnut } from "../../src/walnut/stitches";
import { FIXED_NOW, persona } from "../helpers";

const PY = process.env.STITCH_PYTHON ?? "python";
const PORT = Number(process.env.STITCH_WALNUT_TEST_PORT ?? 4790);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = resolve(__dirname, "../..");
const available = spawnSync(PY, ["-c", "import pydantic, yaml"], { encoding: "utf8" }).status === 0;
if (!available) console.warn(`[walnut] skipping the real-engine suite: ${PY} lacks pydantic/PyYAML (set STITCH_PYTHON)`);

let proc: ChildProcess | undefined;
let dir = "";

async function waitForHealth(ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/walnut/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the Walnut stitches did not start");
}

function engine(): Engine {
  let n = 0;
  return new Engine({ documents: loadDataset().documents, ledger: new Ledger("k", () => FIXED_NOW), clock: () => FIXED_NOW, newId: () => `req-${++n}`, walnut: new HttpWalnut(BASE) });
}

describe.runIf(available)("the real Walnut engine behind Stitchwork", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "stitch-walnut-"));
    proc = spawn(PY, ["-m", "stitch_walnut", "--port", String(PORT), "--ephemeral-key", "--ledger", join(dir, "crypt.jsonl")], {
      cwd: ROOT,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: "ignore",
    });
    await waitForHealth(20000);
  }, 30000);

  afterAll(() => {
    proc?.kill();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold the file briefly */
    }
  });

  test("Walnut's grounding wall keeps every extractive sentence for every persona and sample question", async () => {
    const e = engine();
    let sentences = 0;
    const dropped: string[] = [];
    for (const who of PERSONAS)
      for (const q of SAMPLE_QUESTIONS) {
        const r = await e.ask(who, q);
        expect(r.status === "answered" || r.status === "no_answer").toBe(true);
        if (r.status !== "answered") continue;
        sentences += r.sentences.length;
        dropped.push(...r.walnut!.dropped.map((d) => `${who.userId}: ${d.text} (${d.reasons.join("; ")})`));
        expect(r.walnut!.pointers.length).toBeGreaterThan(0);
      }
    expect(sentences).toBeGreaterThan(20);
    expect(dropped).toEqual([]);
  });

  test("a forged stitch is dropped by the real wall for its invented value and name", async () => {
    const e = engine();
    e.forgeNext = true;
    const r = await e.ask(persona("mara"), "What is the refund window for cancelled policies?");
    if (r.status !== "answered") throw new Error(r.status);
    expect(r.sentences.map((s) => s.text)).not.toContain(FORGED_SENTENCE);
    const [d] = r.walnut!.dropped;
    expect(d.text).toBe(FORGED_SENTENCE);
    expect(d.reasons).toEqual(expect.arrayContaining(["value not in its sources: 99", expect.stringContaining("Ozymandias")]));
  });

  test("chat citations get untrusted Walnut pointers that re-resolve to the quoted text", async () => {
    const r = await engine().ask(persona("mara"), "What is the refund window for cancelled policies?");
    if (r.status !== "answered") throw new Error(r.status);
    for (const p of r.walnut!.pointers) {
      const c = r.citations.find((x) => x.n === p.n)!;
      expect(p.pointer.trust).toBe(c.kind === "chat" || c.kind === "ticket" ? "untrusted" : "trusted");
      const quoted = c.text.slice(p.pointer.char_start, p.pointer.char_end);
      expect(r.sentences[p.sentence].text.replace(/\.\.\.$/, "").includes(quoted) || quoted === c.text).toBe(true);
    }
  });

  test("restricted and nonexistent still look the same through the real wall", async () => {
    const e = engine();
    const strip = (r: AskResponse) => {
      if (r.status !== "answered" && r.status !== "no_answer") return r;
      const { requestId: _r, walnut, ...rest } = r;
      return { ...rest, walnut: walnut && { ...walnut, seals: walnut.seals.map((s) => s.type) } };
    };
    const real = await e.ask(persona("sam"), "Is Gravewell Logistics under investigation?");
    const fake = await e.ask(persona("sam"), "Is Moonbeam Freight under investigation?");
    expect(strip(real)).toEqual(strip(fake));
  });

  test("through the API and the real wall, what a person cannot open changes nothing they receive", async () => {
    const all = loadDataset().documents;
    const bare = (text: string) => {
      const body = JSON.parse(text.replace(/req-[a-z0-9-]+/g, "req")) as { walnut?: { seals?: { type: string }[] } };
      if (body.walnut?.seals) body.walnut.seals = body.walnut.seals.map((s) => ({ type: s.type }));
      return JSON.stringify(body);
    };
    const post = (path: string, body: unknown, token?: string) =>
      new Request(`https://x.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const call = async (persona: string, question: string, documents: typeof all) => {
      const env = { secret: "s".repeat(40), now: () => FIXED_NOW, walnutUrl: BASE, documents };
      const s = (await (await route(post("/api/session", { persona }), env)).json()) as { token: string };
      const r = await route(post("/api/ask", { question }, s.token), env);
      expect(r.status).toBe(200);
      return bare(await r.text());
    };
    for (const who of PERSONAS.filter((p) => !p.groups.includes("steward"))) {
      const visible = all.filter((d) => d.acl.users.includes(who.userId) || d.acl.groups.some((g) => who.groups.includes(g)));
      expect(visible.length).toBeLessThan(all.length);
      for (const q of SAMPLE_QUESTIONS) expect(await call(who.userId, q, all)).toBe(await call(who.userId, q, visible));
    }
  }, 120000);

  test("the real service refuses what a web page could send, and has no route that reads the Crypt", async () => {
    const before = await new HttpWalnut(BASE).verify();
    const seal = (headers: Record<string, string>) => fetch(`${BASE}/walnut/seal`, { method: "POST", headers, body: JSON.stringify({ type: "answer.released", data: { forged: true } }) });
    expect((await seal({ "content-type": "text/plain" })).status).toBe(415);
    expect((await seal({ "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await fetch(`${BASE}/walnut/entries`)).status).toBe(404);
    expect(await new HttpWalnut(BASE).verify()).toEqual(before);
  });

  test("the durable Walnut Crypt verifies, and its tamper demo catches every attack on copies only", async () => {
    const w = new HttpWalnut(BASE);
    const before = await w.verify();
    expect(before.ok).toBe(true);
    expect(before.count % 3).toBe(0);
    const t = await w.tamperDemo();
    expect(t.untouched).toBe(true);
    expect(t.attacks.length).toBe(3);
    expect(t.attacks.every((a) => a.detected)).toBe(true);
    expect(await w.verify()).toEqual(before);
  });

  test("the API through the real Walnut stitches answers with three seals", async () => {
    const env = { secret: "s".repeat(40), now: () => FIXED_NOW, walnutUrl: BASE };
    const s = (await (await handleSession(new Request("https://x.test/api/session", { method: "POST", body: JSON.stringify({ persona: "iris" }) }), env)).json()) as { token: string };
    const r = await handleAsk(new Request("https://x.test/api/ask", { method: "POST", headers: { authorization: `Bearer ${s.token}` }, body: JSON.stringify({ question: "Is Gravewell Logistics under investigation?" }) }), env);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; walnut: { seals: { seq: number }[] } };
    expect(body.status).toBe("answered");
    expect(body.walnut.seals.map((x) => x.seq)).toHaveLength(3);
  });
});
