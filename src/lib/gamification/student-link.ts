import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed magic-link tokens for student self-service.
 *
 * A student has no dashboard login. The WhatsApp bot sends them a signed,
 * expiring link tied to their customerId; the /api/strikelab/me endpoint
 * verifies the token and returns that student's own progress.
 *
 * Token format: `1.<base64url(payload)>.<base64url(hmac-sha256)>`
 * Payload: `{ cid: number, exp: number }` where exp is unix seconds.
 *
 * Mirrors the HMAC + timing-safe-compare approach in src/lib/wa/verify.ts.
 */

const TOKEN_VERSION = "1";

/** Default token lifetime. Low-sensitivity (own points); sent over WhatsApp. */
export const STUDENT_LINK_TTL_DAYS = 30;

export type VerifyResult =
  | { ok: true; customerId: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "no_secret" };

function getSecret(): string | null {
  const s = process.env.STRIKELAB_LINK_SECRET;
  return s && s.length > 0 ? s : null;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/**
 * Mint a signed token for a student. Throws if STRIKELAB_LINK_SECRET is unset.
 */
export function mintStudentToken(
  customerId: number,
  opts?: { nowMs?: number; ttlDays?: number },
): string {
  const secret = getSecret();
  if (!secret) throw new Error("STRIKELAB_LINK_SECRET is not set");

  const nowMs = opts?.nowMs ?? Date.now();
  const ttlDays = opts?.ttlDays ?? STUDENT_LINK_TTL_DAYS;
  const exp = Math.floor(nowMs / 1000) + ttlDays * 24 * 60 * 60;

  const payloadB64 = Buffer.from(JSON.stringify({ cid: customerId, exp })).toString("base64url");
  return `${TOKEN_VERSION}.${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a token. Checks the signature (timing-safe) BEFORE trusting the
 * payload, then checks expiry. Fails closed on any problem.
 */
export function verifyStudentToken(token: string, opts?: { nowMs?: number }): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { ok: false, reason: "malformed" };
  }
  const [, payloadB64, sig] = parts;

  const expectedSig = sign(payloadB64, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, reason: "malformed" };
  }
  const { cid, exp } = payload as Record<string, unknown>;
  if (typeof cid !== "number" || typeof exp !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const nowSec = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  if (nowSec >= exp) return { ok: false, reason: "expired" };

  return { ok: true, customerId: cid };
}
