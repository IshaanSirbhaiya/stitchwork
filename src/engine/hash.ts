// Web Crypto only, so the same code runs in browsers and in Node 20+.
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function importHmacKey(key: Uint8Array | string): Promise<CryptoKey> {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacHex(key: CryptoKey, text: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

export async function hmacBytes(key: CryptoKey, text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

/** JSON with object keys sorted at every depth. Arrays keep their order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

/** Constant-time comparison for equal-length strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomKey(bytes = 32): Uint8Array {
  const k = new Uint8Array(bytes);
  crypto.getRandomValues(k);
  return k;
}
