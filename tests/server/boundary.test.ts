// The permission boundary, tested through the real entry points: the Vercel wrappers in api/*.js
// (and the bundle they import, exactly as shipped) and the router. Nothing here calls Engine or the
// gates directly, because a hole in what the API returns cannot be seen from inside the engine.
// Needs a current bundle: `npm run build:api`.
import { route } from "../../server/handler";
import { loadDataset } from "../../src/data";
import { PERSONAS, SAMPLE_QUESTIONS } from "../../src/data/personas";

const SECRET = "boundary-test-secret-that-is-long-enough-01";
const load = (p: string): Promise<Record<string, (r?: Request) => Promise<Response>>> => import(/* @vite-ignore */ p);

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://stitchwork.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("the shipped api/*.js functions", () => {
  let ask: (r: Request) => Promise<Response>;
  let session: (r: Request) => Promise<Response>;

  beforeAll(async () => {
    process.env.STITCH_SECRET = SECRET;
    delete process.env.STITCH_SESSION_KEY;
    ask = (await load("../../api/ask.js")).POST as typeof ask;
    session = (await load("../../api/session.js")).POST as typeof session;
  });

  afterAll(() => {
    delete process.env.STITCH_SECRET;
    delete process.env.STITCH_SESSION_KEY;
  });

  const tokenFor = async (persona: string) => ((await (await session(post("/api/session", { persona }))).json()) as { token: string }).token;
  const askAs = async (persona: string, question: string, extra: Record<string, unknown> = {}) =>
    ask(post("/api/ask", { question, ...extra }, { authorization: `Bearer ${await tokenFor(persona)}` }));

  test("a non-steward's response holds no denial count, no denied id and no Crypt entry", async () => {
    const text = await (await askAs("theo", "Is Gravewell Logistics under investigation?")).text();
    for (const leak of ["gate1Denied", "gate1Allowed", "gate2DeniedDocIds", "ghostDocIds", "FIN-13", "fincrime", "prevHash"]) expect(text).not.toContain(leak);
    const body = JSON.parse(text) as { crypt?: unknown; cryptSealed: number; asker: string };
    expect(body.asker).toBe("theo");
    expect(body.crypt).toBeUndefined();
    expect(body.cryptSealed).toBe(3);
  });

  test("the steward gets the decision record for her own request", async () => {
    const body = (await (await askAs("iris", "Is Gravewell Logistics under investigation?")).json()) as { crypt: { type: string; data: Record<string, unknown> }[] };
    expect(body.crypt.map((e) => e.type)).toEqual(["request.accepted", "retrieval.decided", "answer.released"]);
    expect(body.crypt[1].data).toHaveProperty("gate1Denied");
  });

  test("no field, header or query can change who is asking or switch on a demo control", async () => {
    const t = await tokenFor("theo");
    const r = await ask(
      new Request("https://stitchwork.test/api/ask?persona=iris&user=iris", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}`, "x-persona": "iris", "x-user": "iris" },
        body: JSON.stringify({ question: "Is Gravewell Logistics under investigation?", persona: "iris", user: "iris", sub: "iris", groups: ["steward", "fincrime"], forge: true, forgeNext: true }),
      }),
    );
    const text = await r.text();
    expect(JSON.parse(text).asker).toBe("theo");
    expect(text).not.toContain("FIN-13");
    expect(text).not.toContain("Forged stitch");
  });

  test("a token cannot be edited into another person's", async () => {
    const [, sig] = (await tokenFor("theo")).split(".");
    const forged = `${btoa(JSON.stringify({ sub: "iris", iat: Math.floor(Date.now() / 1000) })).replace(/=+$/, "")}.${sig}`;
    expect((await ask(post("/api/ask", { question: "x" }, { authorization: `Bearer ${forged}` }))).status).toBe(401);
  });

  test("without STITCH_SESSION_KEY the open demo says so: any caller can pick any persona", async () => {
    const r = (await (await session(post("/api/session", { persona: "iris" }))).json()) as { persona: string; demoIdentity: boolean };
    expect(r).toMatchObject({ persona: "iris", demoIdentity: true });
  });

  test("with STITCH_SESSION_KEY a caller without the key cannot get a token", async () => {
    process.env.STITCH_SESSION_KEY = "k".repeat(40);
    try {
      expect((await session(post("/api/session", { persona: "iris" }))).status).toBe(401);
      expect((await session(post("/api/session", { persona: "iris" }, { "x-stitch-session-key": "wrong" }))).status).toBe(401);
      const ok = await session(post("/api/session", { persona: "iris" }, { "x-stitch-session-key": "k".repeat(40) }));
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { demoIdentity: boolean }).demoIdentity).toBe(false);
    } finally {
      delete process.env.STITCH_SESSION_KEY;
    }
  });
});

describe("the router", () => {
  const env = { secret: SECRET, now: () => new Date("2026-11-04T10:00:00Z") };

  test("no route can read the Crypt, change a permission, exorcise or forge", async () => {
    for (const p of ["/api/crypt", "/api/entries", "/api/exorcise", "/api/acl", "/api/operator", "/api/forge", "/api/upload"]) {
      expect((await route(post(p, { docId: "FIN-13", group: "sales", action: "restore" }), env)).status).toBe(404);
    }
  });

  test("for every person who cannot open a document, its existence changes no byte of the response", async () => {
    const all = loadDataset().documents;
    const bare = (s: string) => s.replace(/req-[a-z0-9-]+/g, "req");
    const call = async (persona: string, q: string, documents: typeof all) => {
      const e = { ...env, documents };
      const s = (await (await route(post("/api/session", { persona }), e)).json()) as { token: string };
      return bare(await (await route(post("/api/ask", { question: q }, { authorization: `Bearer ${s.token}` }), e)).text());
    };
    for (const who of PERSONAS.filter((p) => !p.groups.includes("steward"))) {
      const visible = (d: (typeof all)[number]) => d.acl.users.includes(who.userId) || d.acl.groups.some((g) => who.groups.includes(g));
      const onlyVisible = all.filter(visible);
      expect(onlyVisible.length).toBeLessThan(all.length);
      for (const q of SAMPLE_QUESTIONS) expect(await call(who.userId, q, all)).toBe(await call(who.userId, q, onlyVisible));
    }
  });
});
