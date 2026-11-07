import { handleAsk, handleHealth, handleSession } from "../../server/handler";
import { FakeWalnut } from "./fake";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-04T10:00:00Z");

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://stitchwork.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

async function ask(env: Parameters<typeof handleAsk>[1], persona: string, question: string) {
  const t = ((await (await handleSession(post("/api/session", { persona }), env)).json()) as { token: string }).token;
  return handleAsk(post("/api/ask", { question }, { authorization: `Bearer ${t}` }), env);
}

describe("API with the Walnut stitches (walnut-stitches requirement 4)", () => {
  test("health says whether Walnut is attached", async () => {
    expect(await (await handleHealth({ secret: SECRET })).json()).toMatchObject({ walnut: false });
    expect(await (await handleHealth({ secret: SECRET, walnutUrl: "http://127.0.0.1:4711" })).json()).toMatchObject({ walnut: true });
  });

  test("an answer carries the Walnut report and three Walnut seals", async () => {
    const walnut = new FakeWalnut();
    const r = await ask({ secret: SECRET, now: () => NOW, walnut }, "mara", "What is the refund window for cancelled policies?");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; walnut: { seals: unknown[] }; crypt: unknown[] };
    expect(body.status).toBe("answered");
    expect(body.walnut.seals).toHaveLength(3);
    expect(walnut.seals.map((s) => s.type)).toEqual(["request.accepted", "retrieval.decided", "answer.released"]);
  });

  test("Walnut refusing is a 503 with no answer text", async () => {
    const walnut = new FakeWalnut();
    walnut.failSeal = "answer.released";
    const r = await ask({ secret: SECRET, now: () => NOW, walnut }, "mara", "What is the refund window for cancelled policies?");
    expect(r.status).toBe(503);
    const text = await r.text();
    expect(text).not.toContain("14 days");
  });

  test("an unreachable Walnut URL is a 503, never an unchecked answer", async () => {
    const r = await ask({ secret: SECRET, now: () => NOW, walnutUrl: "http://127.0.0.1:1" }, "mara", "What is the refund window for cancelled policies?");
    expect(r.status).toBe(503);
  });
});
