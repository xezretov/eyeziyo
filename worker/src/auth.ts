/**
 * JWT authentication — sign/verify tokens, password hashing.
 * Uses Web Crypto API (available in Cloudflare Workers).
 *
 * Password hashing: PBKDF2-SHA256, 200000 iterations, 16-byte random salt.
 * Stored format:  pbkdf2$<iter>$<saltHex>$<hashHex>
 * Legacy format:  64-char hex (SHA-256(password+"eyeziyo_2024")) — still verified
 *                 but auto-upgraded to pbkdf2 on next successful login.
 */

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const REFRESH_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days
// Cloudflare Workers' Web Crypto caps PBKDF2 at 100,000 iterations — anything
// higher throws NotSupportedError at verify/hash time. This is the platform max.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN_BITS = 256;
const PBKDF2_SALT_BYTES = 16;
const LEGACY_SALT = "eyeziyo_2024";

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), ALGORITHM, false, ["sign", "verify"]);
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const pad = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function signJWT(
  payload: Record<string, any>,
  secret: string,
  expiresIn = TOKEN_EXPIRY_SECONDS
): Promise<string> {
  const key = await getKey(secret);
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresIn };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const bodyB64 = base64url(enc.encode(JSON.stringify(body)));
  const data = enc.encode(`${headerB64}.${bodyB64}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);

  return `${headerB64}.${bodyB64}.${base64url(sig)}`;
}

export async function verifyJWT(
  token: string,
  secret: string
): Promise<Record<string, any> | null> {
  try {
    const [headerB64, bodyB64, sigB64] = token.split(".");
    if (!headerB64 || !bodyB64 || !sigB64) return null;

    const key = await getKey(secret);
    const enc = new TextEncoder();
    const data = enc.encode(`${headerB64}.${bodyB64}`);
    const sig = base64urlDecode(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sig, data);
    if (!valid) return null;

    const body = JSON.parse(new TextDecoder().decode(base64urlDecode(bodyB64)));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;

    return body;
  } catch {
    return null;
  }
}

/** SHA-256 hash (kept for legacy password verification only — do NOT use for new hashes) */
export async function sha256Hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    PBKDF2_KEYLEN_BITS
  );
  return new Uint8Array(bits);
}

/** Constant-time string comparison (prevents timing attacks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hash a password using PBKDF2-SHA256. Returns `pbkdf2$<iter>$<saltHex>$<hashHex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export interface VerifyResult {
  valid: boolean;
  /** True when stored hash uses the legacy SHA-256 format and should be re-hashed. */
  needsRehash: boolean;
}

/**
 * Verify password against a stored hash. Supports:
 *  - new format: `pbkdf2$<iter>$<saltHex>$<hashHex>`
 *  - legacy:     64-char hex SHA-256(password + LEGACY_SALT)
 *
 * Caller should re-hash and update the row when `needsRehash` is true.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<VerifyResult> {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith("pbkdf2$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 4) return { valid: false, needsRehash: false };
    const iter = parseInt(parts[1], 10);
    const salt = hexToBytes(parts[2]);
    const expected = parts[3];
    const computed = bytesToHex(await pbkdf2(password, salt, iter));
    return { valid: timingSafeEqual(computed, expected), needsRehash: false };
  }

  // Legacy SHA-256
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const computed = await sha256Hash(`${password}${LEGACY_SALT}`);
    const valid = timingSafeEqual(computed, storedHash);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

export { TOKEN_EXPIRY_SECONDS, REFRESH_EXPIRY_SECONDS };
