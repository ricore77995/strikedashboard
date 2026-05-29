import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionRow } from "../../../src/lib/wa/session";

// ---------------------------------------------------------------------------
// Hoisted mock functions — must be declared before vi.mock() call sites
// because vi.hoisted() runs before any imports.
// ---------------------------------------------------------------------------
const upsertContact = vi.fn();
const upsertSession = vi.fn();
const updateManySession = vi.fn();
const findUniqueOrThrowSession = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    waContact: {
      upsert: upsertContact,
    },
    waSession: {
      upsert: upsertSession,
      updateMany: updateManySession,
      findUniqueOrThrow: findUniqueOrThrowSession,
    },
  },
}));

// Import the module under test AFTER mocks are in place.
const {
  loadSession,
  isExpired,
  resetToIdle,
  transition,
  ttlFromNow,
  SESSION_TTL_MS,
} = await import("../../../src/lib/wa/session");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE = "+351912345678";

function makeRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    phoneE164: PHONE,
    state: "IDLE",
    pendingClassId: null,
    pendingSignupId: null,
    pendingSongClassId: null,
    pendingTrackId: null,
    expiresAt: null,
    version: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadSession
// ---------------------------------------------------------------------------

describe("loadSession", () => {
  it("first contact — upserts waContact + waSession with IDLE defaults", async () => {
    const defaultRow = makeRow();
    upsertContact.mockResolvedValue(undefined);
    upsertSession.mockResolvedValue(defaultRow);

    const result = await loadSession(PHONE);

    // waContact.upsert called with create + empty update
    expect(upsertContact).toHaveBeenCalledWith({
      where: { phoneE164: PHONE },
      create: { phoneE164: PHONE },
      update: {},
    });

    // waSession.upsert called with create + empty update
    expect(upsertSession).toHaveBeenCalledWith({
      where: { phoneE164: PHONE },
      create: { phoneE164: PHONE },
      update: {},
    });

    expect(result).toEqual(defaultRow);
  });

  it("existing contact — returns current session as-is", async () => {
    const existingRow = makeRow({
      state: "AWAIT_CLASS_PICK",
      pendingClassId: 42,
      version: 3,
      expiresAt: new Date("2099-01-01"),
    });
    upsertContact.mockResolvedValue(undefined);
    upsertSession.mockResolvedValue(existingRow);

    const result = await loadSession(PHONE);

    expect(result).toEqual(existingRow);
    expect(result.state).toBe("AWAIT_CLASS_PICK");
    expect(result.version).toBe(3);
    expect(result.pendingClassId).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------

describe("isExpired", () => {
  it("expiresAt in the past → true", () => {
    const row = makeRow({ expiresAt: new Date("2020-01-01") });
    expect(isExpired(row)).toBe(true);
  });

  it("expiresAt in the future → false", () => {
    const row = makeRow({ expiresAt: new Date("2099-01-01") });
    expect(isExpired(row)).toBe(false);
  });

  it("expiresAt null → false", () => {
    const row = makeRow({ expiresAt: null });
    expect(isExpired(row)).toBe(false);
  });

  it("expiresAt undefined → false", () => {
    const row = makeRow({ expiresAt: undefined as unknown as null });
    expect(isExpired(row)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ttlFromNow
// ---------------------------------------------------------------------------

describe("ttlFromNow", () => {
  it("returns a Date roughly 10 minutes from now", () => {
    const before = Date.now();
    const result = ttlFromNow();
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    // The returned timestamp should be within [before+TTL, after+TTL].
    const min = before + SESSION_TTL_MS;
    const max = after + SESSION_TTL_MS;
    expect(result.getTime()).toBeGreaterThanOrEqual(min);
    expect(result.getTime()).toBeLessThanOrEqual(max);
  });
});

// ---------------------------------------------------------------------------
// transition
// ---------------------------------------------------------------------------

describe("transition", () => {
  it("version match → updateMany returns count=1 → { ok: true, session with updated fields }", async () => {
    const current = makeRow({ version: 2 });
    const freshRow = makeRow({
      state: "AWAIT_CONFIRM_BOOK",
      pendingClassId: 99,
      version: 3,
    });

    updateManySession.mockResolvedValue({ count: 1 });
    findUniqueOrThrowSession.mockResolvedValue(freshRow);

    const result = await transition(current, {
      state: "AWAIT_CONFIRM_BOOK",
      pendingClassId: 99,
    });

    // updateMany scoped to (phoneE164, version)
    expect(updateManySession).toHaveBeenCalledWith({
      where: { phoneE164: PHONE, version: 2 },
      data: {
        state: "AWAIT_CONFIRM_BOOK",
        pendingClassId: 99,
        version: { increment: 1 },
      },
    });

    expect(result).toEqual({ ok: true, session: freshRow });
    if (result.ok) {
      expect(result.session.state).toBe("AWAIT_CONFIRM_BOOK");
      expect(result.session.pendingClassId).toBe(99);
      expect(result.session.version).toBe(3);
    }
  });

  it("version mismatch → updateMany returns count=0 → { ok: false, reason: 'race' }", async () => {
    const current = makeRow({ version: 2 });

    updateManySession.mockResolvedValue({ count: 0 });

    const result = await transition(current, { state: "AWAIT_CLASS_PICK" });

    expect(result).toEqual({ ok: false, reason: "race" });
    // findUniqueOrThrow should NOT be called when count is 0
    expect(findUniqueOrThrowSession).not.toHaveBeenCalled();
  });

  it("partial patch → only specified fields updated, version incremented", async () => {
    const current = makeRow({ version: 5 });
    const freshRow = makeRow({ version: 6, pendingTrackId: "track_abc" });

    updateManySession.mockResolvedValue({ count: 1 });
    findUniqueOrThrowSession.mockResolvedValue(freshRow);

    const result = await transition(current, {
      pendingTrackId: "track_abc",
    });

    // Only pendingTrackId + version increment — no state, no other fields
    expect(updateManySession).toHaveBeenCalledWith({
      where: { phoneE164: PHONE, version: 5 },
      data: {
        pendingTrackId: "track_abc",
        version: { increment: 1 },
      },
    });

    expect(result).toEqual({ ok: true, session: freshRow });
  });
});

// ---------------------------------------------------------------------------
// resetToIdle
// ---------------------------------------------------------------------------

describe("resetToIdle", () => {
  it("sets state to IDLE, clears all pending fields, increments version", async () => {
    const current = makeRow({
      state: "AWAIT_SONG_CONFIRM",
      pendingClassId: 10,
      pendingSignupId: 20,
      pendingSongClassId: 30,
      pendingTrackId: "track_xyz",
      expiresAt: new Date("2099-06-01"),
      version: 4,
    });

    const resetRow = makeRow({ version: 5 });

    updateManySession.mockResolvedValue({ count: 1 });
    findUniqueOrThrowSession.mockResolvedValue(resetRow);

    const result = await resetToIdle(current);

    // transition() is called with the full reset patch
    expect(updateManySession).toHaveBeenCalledWith({
      where: { phoneE164: PHONE, version: 4 },
      data: {
        state: "IDLE",
        pendingClassId: null,
        pendingSignupId: null,
        pendingSongClassId: null,
        pendingTrackId: null,
        expiresAt: null,
        version: { increment: 1 },
      },
    });

    expect(result).toEqual({ ok: true, session: resetRow });
    if (result.ok) {
      expect(result.session.state).toBe("IDLE");
      expect(result.session.pendingClassId).toBeNull();
      expect(result.session.pendingSignupId).toBeNull();
      expect(result.session.pendingSongClassId).toBeNull();
      expect(result.session.pendingTrackId).toBeNull();
      expect(result.session.expiresAt).toBeNull();
    }
  });

  it("propagates race condition from transition", async () => {
    const current = makeRow({
      state: "AWAIT_CLASS_PICK",
      pendingClassId: 7,
      version: 1,
    });

    // updateMany returns 0 — simulating a concurrent bump
    updateManySession.mockResolvedValue({ count: 0 });

    const result = await resetToIdle(current);

    expect(result).toEqual({ ok: false, reason: "race" });
  });
});
