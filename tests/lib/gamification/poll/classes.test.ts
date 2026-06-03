import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { upsertIdentity } from "@/lib/gamification/identity";

// Mock yogoFetch before importing poll
vi.mock("@/lib/yogo/fetch", () => ({
  yogoFetch: vi.fn(),
}));

import { pollClasses } from "@/lib/gamification/poll/classes";
import { yogoFetch } from "@/lib/yogo/fetch";

const CID_ACTIVE = 90030;
const CID_NO_IDENTITY = 90031;
const CID_DUNNING = 90033;

const mockedYogoFetch = vi.mocked(yogoFetch);

async function cleanup() {
  for (const id of [CID_ACTIVE, CID_DUNNING]) {
    await db.gamificationEventLog.deleteMany({ where: { customerId: id } });
    await db.gamificationState.deleteMany({ where: { customerId: id } });
    await db.gamificationIdentity.deleteMany({ where: { customerId: id } });
  }
  await db.yogoMembershipSnapshot.deleteMany({
    where: { userId: { in: [CID_ACTIVE, CID_DUNNING] } },
  });
}

describe("pollClasses", () => {
  beforeAll(async () => {
    await cleanup();

    // Set up identities — auto-opt-in via upsertIdentity
    await upsertIdentity({ customerId: CID_ACTIVE, phoneE164: "+351911000030" });
    await upsertIdentity({ customerId: CID_DUNNING, phoneE164: "+351911000033" });

    // Set up membership snapshots
    await db.yogoMembershipSnapshot.create({
      data: {
        userId: CID_ACTIVE,
        snapshotDate: "2026-05-27",
        status: "active",
        statusText: "",
        paidUntil: new Date("2026-06-30"),
      },
    });
    await db.yogoMembershipSnapshot.create({
      data: {
        userId: CID_DUNNING,
        snapshotDate: "2026-05-27",
        status: "active",
        statusText: "Pausado. Renovação automática falhou 4 vezes.",
        paidUntil: new Date("2026-03-31"),
      },
    });
  });

  afterAll(cleanup);

  it("processes checked-in students and emits events", async () => {
    mockedYogoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: [
        {
          id: 100,
          class_type: { id: 1, name: "Muay Thai" },
          signups: [
            {
              id: 1,
              user: { id: CID_ACTIVE, date_of_birth: "1995-06-15" },
              checked_in: Date.now(),
            },
          ],
        },
      ],
      rawText: "",
    });

    const result = await pollClasses();

    expect(result.classesProcessed).toBe(1);
    expect(result.checkinsObserved).toBe(1);
    expect(result.dobCaptured).toBe(1); // DOB captured passively

    // Verify event was written
    const event = await db.gamificationEventLog.findFirst({
      where: { customerId: CID_ACTIVE, eventType: "checkin_observed" },
    });
    expect(event).not.toBeNull();
    expect(event!.idempotencyKey).toBe(`checkin:${CID_ACTIVE}:100`);
    expect(event!.pointsDelta).toBe(0); // Phase 0
  });

  it("skips students without identity", async () => {
    mockedYogoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: [
        {
          id: 101,
          class_type: { id: 1, name: "BJJ" },
          signups: [
            {
              id: 2,
              user: { id: CID_NO_IDENTITY },
              checked_in: Date.now(),
            },
          ],
        },
      ],
      rawText: "",
    });

    const result = await pollClasses();
    expect(result.skippedNoIdentity).toBe(1);
    expect(result.checkinsObserved).toBe(0);
  });

  it("emits event with pointsDelta=0 for dunning customers (audit trail)", async () => {
    mockedYogoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: [
        {
          id: 103,
          class_type: { id: 1, name: "Wrestling" },
          signups: [
            {
              id: 4,
              user: { id: CID_DUNNING },
              checked_in: Date.now(),
            },
          ],
        },
      ],
      rawText: "",
    });

    const result = await pollClasses();
    expect(result.checkinsObserved).toBe(1);
    expect(result.skippedNotActive).toBe(1);

    const event = await db.gamificationEventLog.findFirst({
      where: { customerId: CID_DUNNING, eventType: "checkin_observed" },
    });
    expect(event).not.toBeNull();
    const payload = JSON.parse(event!.payloadJson ?? "{}");
    expect(payload.membershipState).toBe("paused");
    expect(payload.skippedReason).toBe("not_active");
  });

  it("is idempotent — re-polling same class produces 0 new events", async () => {
    mockedYogoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: [
        {
          id: 100, // same class ID as first test
          class_type: { id: 1, name: "Muay Thai" },
          signups: [
            {
              id: 1,
              user: { id: CID_ACTIVE },
              checked_in: Date.now(),
            },
          ],
        },
      ],
      rawText: "",
    });

    const result = await pollClasses();
    expect(result.checkinsObserved).toBe(0); // duplicate idempotency key
  });

  it("throws on Yogo API failure", async () => {
    mockedYogoFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
      rawText: "Internal Server Error",
    });

    await expect(pollClasses()).rejects.toThrow("Yogo classes fetch failed");
  });
});
