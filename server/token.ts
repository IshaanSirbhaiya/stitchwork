import { hmacBytes, importHmacKey, safeEqual } from "../src/engine/hash";

export const TOKEN_TTL_SECONDS = 15 * 60;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string | null {
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return null;
  }
}

const enc = new TextEncoder();

export async function signToken(secret: string, sub: string, nowSeconds: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ sub, iat: nowSeconds })));
  const sig = b64url(await hmacBytes(await importHmacKey(secret), payload));
  return `${payload}.${sig}`;
}

/** Returns the subject, or null for anything malformed, forged or older than the TTL. */
export async function verifyToken(secret: string, token: string, nowSeconds: number): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  const expected = b64url(await hmacBytes(await importHmacKey(secret), payload));
  if (!safeEqual(expected, sig)) return null;
  const json = fromB64url(payload);
  if (json === null) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;
  const { sub, iat } = claims as { sub?: unknown; iat?: unknown };
  if (typeof sub !== "string" || typeof iat !== "number") return null;
  if (iat > nowSeconds + 30 || nowSeconds - iat > TOKEN_TTL_SECONDS) return null;
  return sub;
}
