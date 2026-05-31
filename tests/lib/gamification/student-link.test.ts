import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mintStudentToken,
  verifyStudentToken,
  STUDENT_LINK_TTL_DAYS,
} from "@/lib/gamification/student-link";

const SECRET = "test-secret-abc123";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("student-link token", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.STRIKELAB_LINK_SECRET;
    process.env.STRIKELAB_LINK_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.STRIKELAB_LINK_SECRET;
    else process.env.STRIKELAB_LINK_SECRET = original;
  });

  it("round-trips a customerId", () => {
    const token = mintStudentToken(90001);
    const res = verifyStudentToken(token);
    expect(res).toEqual({ ok: true, customerId: 90001 });
  });

  it("rejects a tampered payload", () => {
    const token = mintStudentToken(90001);
    const [v, , sig] = token.split(".");
    // Re-encode a different customerId, keep the old signature
    const forgedPayload = Buffer.from(JSON.stringify({ cid: 99999, exp: 9999999999 })).toString("base64url");
    const res = verifyStudentToken(`${v}.${forgedPayload}.${sig}`);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered signature", () => {
    const token = mintStudentToken(90001);
    const [v, payload] = token.split(".");
    const res = verifyStudentToken(`${v}.${payload}.deadbeef`);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintStudentToken(90001);
    process.env.STRIKELAB_LINK_SECRET = "a-completely-different-secret";
    const res = verifyStudentToken(token);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 40 * DAY_MS; // minted 40 days ago, 30-day TTL
    const token = mintStudentToken(90001, { nowMs: past });
    const res = verifyStudentToken(token);
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts a token just inside its TTL window", () => {
    const nowMs = Date.now();
    const token = mintStudentToken(90001, { nowMs });
    const justBeforeExpiry = nowMs + STUDENT_LINK_TTL_DAYS * DAY_MS - 60_000;
    const res = verifyStudentToken(token, { nowMs: justBeforeExpiry });
    expect(res).toEqual({ ok: true, customerId: 90001 });
  });

  it("rejects malformed tokens", () => {
    expect(verifyStudentToken("not-a-token").ok).toBe(false);
    expect(verifyStudentToken("1.onlytwo").ok).toBe(false);
    expect(verifyStudentToken("9.x.y").ok).toBe(false); // wrong version
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.STRIKELAB_LINK_SECRET;
    expect(verifyStudentToken("1.a.b")).toEqual({ ok: false, reason: "no_secret" });
    expect(() => mintStudentToken(90001)).toThrow();
  });
});
