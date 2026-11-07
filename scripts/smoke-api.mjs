#!/usr/bin/env node
// Plain Node ESM smoke test of the Vercel wrappers in api/ (no Vite, no TypeScript), so the files
// Vercel will load are exercised exactly as shipped. Run `npm run build:api` first.
import { POST as ask } from "../api/ask.js";
import { GET as health } from "../api/health.js";
import { POST as session } from "../api/session.js";

process.env.STITCH_SECRET = "smoke-test-secret-that-is-long-enough-1234";
const json = (body, headers = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const h = await (await health()).json();
const s = await (await session(new Request("https://x.test/api/session", json({ persona: "theo" })))).json();
const theo = await (await ask(new Request("https://x.test/api/ask", json({ question: "Is Gravewell Logistics under investigation?", persona: "iris" }, { authorization: `Bearer ${s.token}` })))).json();
const anon = await ask(new Request("https://x.test/api/ask", json({ question: "hi" })));

const checks = {
  healthConfigured: h.configured === true,
  tokenIssued: typeof s.token === "string" && s.token.includes("."),
  askerIsTheo: theo.asker === "theo",
  noFin13ForTheo: !JSON.stringify(theo).includes("FIN-13"),
  noDenialFactsForTheo: theo.crypt === undefined && !JSON.stringify(theo).includes("gate1Denied"),
  threeEventsSealed: theo.cryptSealed === 3,
  demoIdentityIsLabelled: s.demoIdentity === true,
  anonymousIs401: anon.status === 401,
};
console.log(JSON.stringify({ checks, theoAnswer: theo.sentences?.map((x) => x.text) }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
