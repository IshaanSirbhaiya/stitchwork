import { handleAsk, handleHealth, handleSession, route } from "../../server/handler";
import { signToken, TOKEN_TTL_SECONDS, verifyToken } from "../../server/token";
import { importHmacKey, hmacBytes } from "../../src/engine/hash";
import { verifyChain } from "../../src/engine/ledger";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-04T10:00:00Z");
const env = { secret: SECRET, now: () => NOW };
const nowS = Math.floor(NOW.getTime() / 1000);

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://stitchwork.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function tokenFor(persona: string): Promise<string> {
  const res = await handleSession(post("/api/session", { persona }), env);
  return ((await res.json()) as { token: string }).token;
}

describe("token (permission-gates requirement 1)", () => {
  test("round trip, forged signature, and expiry", async () => {
    const t = await signToken(SECRET, "theo", nowS);
    expect(await verifyToken(SECRET, t, nowS)).toBe("theo");
    expect(await verifyToken("x".repeat(40), t, nowS)).toBeNull();
    expect(await verifyToken(SECRET, t, nowS + TOKEN_TTL_SECONDS + 1)).toBeNull();
    const [payload] = t.split(".");
    const tampered = btoa(JSON.stringify({ sub: "iris", iat: nowS })).replace(/=+$/, "");
    expect(await verifyToken(SECRET, `${tampered}.${t.split(".")[1]}`, nowS)).toBeNull();
    expect(await verifyToken(SECRET, `${payload}`, nowS)).toBeNull();
  });
});

describe("API handlers", () => {
  test("health reports configuration without needing the secret", async () => {
    expect(await (await handleHealth({ secret: undefined })).json()).toMatchObject({ ok: true, configured: false });
    expect(await (await handleHealth(env)).json()).toMatchObject({ ok: true, configured: true });
  });

  test("1.5 unset or short secret gives 503 not_configured", async () => {
    for (const secret of [undefined, "short"]) {
      const r = await handleAsk(post("/api/ask", { question: "hi" }), { secret });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: "not_configured" });
      expect((await handleSession(post("/api/session", { persona: "theo" }), { secret })).status).toBe(503);
    }
  });

  test("1.3 missing, malformed and forged tokens give 401", async () => {
    const forged = await signToken("y".repeat(40), "iris", nowS);
    const variants: Record<string, string>[] = [{}, { authorization: "Bearer nope" }, { authorization: `Bearer ${forged}` }, { authorization: "Basic abc" }];
    for (const headers of variants) {
      const r = await handleAsk(post("/api/ask", { question: "Is Gravewell Logistics under investigation?" }, headers), env);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthenticated" });
    }
  });

  test("1.3 an expired token gives 401", async () => {
    const old = await signToken(SECRET, "iris", nowS - TOKEN_TTL_SECONDS - 5);
    const r = await handleAsk(post("/api/ask", { question: "x" }, { authorization: `Bearer ${old}` }), env);
    expect(r.status).toBe(401);
  });

  test("1.4 body fields cannot change identity", async () => {
    const theo = await tokenFor("theo");
    const r = await handleAsk(
      post("/api/ask", { question: "Is Gravewell Logistics under investigation?", persona: "iris", user: "iris", as: "iris" }, { authorization: `Bearer ${theo}` }),
      env,
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { asker: string; citations: { docId: string }[] };
    expect(body.asker).toBe("theo");
    expect(body.citations.map((c) => c.docId)).not.toContain("FIN-13");
  });

  test("the steward's token does reach FIN-13, and the receipt verifies", async () => {
    const iris = await tokenFor("iris");
    const r = await handleAsk(post("/api/ask", { question: "Is Gravewell Logistics under investigation?" }, { authorization: `Bearer ${iris}` }), env);
    const body = (await r.json()) as { citations: { docId: string }[]; crypt: Parameters<typeof verifyChain>[0] };
    expect(body.citations.map((c) => c.docId)).toContain("FIN-13");
    expect(body.crypt.map((e) => e.type)).toEqual(["request.accepted", "retrieval.decided", "answer.released"]);
    const key = await importHmacKey(await hmacBytes(await importHmacKey(SECRET), "crypt-key"));
    expect(await verifyChain(body.crypt, key)).toEqual({ ok: true, count: 3 });
  });

  test("6.2 bad JSON and oversized bodies give 400", async () => {
    const t = await tokenFor("mara");
    const auth = { authorization: `Bearer ${t}` };
    expect((await handleAsk(post("/api/ask", "{not json", auth), env)).status).toBe(400);
    expect((await handleAsk(post("/api/ask", { question: "x".repeat(5000) }, auth), env)).status).toBe(400);
    const r = await handleAsk(post("/api/ask", { question: "   " }, auth), env);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "invalid_query" });
  });

  test("unknown persona is refused at session issue", async () => {
    const r = await handleSession(post("/api/session", { persona: "dracula" }), env);
    expect(r.status).toBe(400);
  });

  test("router dispatches by path and 404s otherwise", async () => {
    expect((await route(new Request("https://x.test/api/health"), env)).status).toBe(200);
    expect((await route(new Request("https://x.test/api/nothing"), env)).status).toBe(404);
  });
});
