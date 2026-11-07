import { loadDataset } from "../src/data";
import { personaById, PERSONAS } from "../src/data/personas";
import { Engine, STEWARD_GROUP } from "../src/engine/engine";
import { hmacBytes, importHmacKey, safeEqual } from "../src/engine/hash";
import { Ledger } from "../src/engine/ledger";
import type { SourceDocument } from "../src/engine/types";
import { HttpWalnut, type WalnutStitches } from "../src/walnut/stitches";
import { signToken, TOKEN_TTL_SECONDS, verifyToken } from "./token";

export const MAX_BODY_BYTES = 4 * 1024;
export const MIN_SECRET_CHARS = 32;

export interface HandlerEnv {
  secret: string | undefined;
  now?: () => Date;
  /** Base URL of the Walnut stitches (`python -m stitch_walnut`), e.g. http://127.0.0.1:4711. */
  walnutUrl?: string;
  /** Injected Walnut client (tests). Takes precedence over `walnutUrl`. */
  walnut?: WalnutStitches;
  /** Sent to the stitches as x-stitch-caller-key (`STITCH_WALNUT_CALLER_KEY`). Server side only. */
  walnutCallerKey?: string;
  /**
   * `STITCH_SESSION_KEY`. Unset is the open judging demo: /api/session gives a token for any persona
   * to any caller and says so (`demoIdentity: true`). Set, a caller must present it to get a token.
   */
  sessionKey?: string;
  /** Corpus override (tests compare worlds with and without restricted documents). */
  documents?: SourceDocument[];
}

function walnutFor(env: HandlerEnv): WalnutStitches | undefined {
  if (env.walnut) return env.walnut;
  return env.walnutUrl ? new HttpWalnut(env.walnutUrl.replace(/\/+$/, ""), { callerKey: env.walnutCallerKey }) : undefined;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function configured(env: HandlerEnv): env is HandlerEnv & { secret: string } {
  return typeof env.secret === "string" && env.secret.length >= MIN_SECRET_CHARS;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleHealth(env: HandlerEnv): Promise<Response> {
  return json(200, { ok: true, configured: configured(env), walnut: walnutFor(env) !== undefined, openSessions: !env.sessionKey, personas: PERSONAS.map((p) => p.userId) });
}

export async function handleSession(req: Request, env: HandlerEnv): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!configured(env)) return json(503, { error: "not_configured" });
  if (env.sessionKey && !safeEqual(req.headers.get("x-stitch-session-key") ?? "", env.sessionKey)) return json(401, { error: "unauthenticated" });
  const body = await readBody(req);
  if (!body) return json(400, { error: "bad_request" });
  const persona = typeof body.persona === "string" ? personaById(body.persona) : undefined;
  if (!persona) return json(400, { error: "unknown_persona", personas: PERSONAS.map((p) => p.userId) });
  const now = Math.floor((env.now?.() ?? new Date()).getTime() / 1000);
  return json(200, { token: await signToken(env.secret, persona.userId, now), expiresIn: TOKEN_TTL_SECONDS, persona: persona.userId, demoIdentity: !env.sessionKey });
}

export async function handleAsk(req: Request, env: HandlerEnv): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!configured(env)) return json(503, { error: "not_configured" });
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  const nowDate = env.now?.() ?? new Date();
  const sub = m ? await verifyToken(env.secret, m[1], Math.floor(nowDate.getTime() / 1000)) : null;
  const who = sub ? personaById(sub) : undefined;
  if (!who) return json(401, { error: "unauthenticated" });
  const body = await readBody(req);
  if (!body) return json(400, { error: "bad_request" });
  // Identity comes only from the token. Fields such as body.persona, body.user or body.as are ignored.
  const question = typeof body.question === "string" ? body.question : "";

  // Each request gets its own ledger, keyed from the secret. The entries record how much was denied
  // (and their hashes depend on it), so only a steward receives them: anyone else gets the count.
  const cryptKey = await hmacBytes(await importHmacKey(env.secret), "crypt-key");
  const ledger = new Ledger(cryptKey, () => env.now?.() ?? new Date());
  const engine = new Engine({ documents: env.documents ?? loadDataset().documents, ledger, clock: () => env.now?.() ?? new Date(), walnut: walnutFor(env) });
  const result = await engine.ask(who, question);
  if (result.status === "invalid_query") return json(400, { error: "invalid_query", message: result.message });
  if (result.status === "ledger_unavailable") return json(503, { error: "ledger_unavailable", message: result.message });
  const entries = ledger.entries();
  const receipt = who.groups.includes(STEWARD_GROUP) ? { crypt: entries } : {};
  return json(200, { ...result, asker: who.userId, cryptSealed: entries.length, ...receipt });
}

/** Route by path, for local testing and for hosts that use a single function. */
export async function route(req: Request, env: HandlerEnv): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/api/health")) return handleHealth(env);
  if (path.endsWith("/api/session")) return handleSession(req, env);
  if (path.endsWith("/api/ask")) return handleAsk(req, env);
  return json(404, { error: "not_found" });
}
