import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { performMonthlyReset } from "@/lib/gamification/reset";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

// Unique CID range for reset tests to avoid collisions with other test files
const CID_A = 90301;
const CID_B = 90302;
const CID_C = 90303; // no points — should be skipped
const ALL_CIDS = [CID_A, CID_B, CID_C];

async function seedIdentity(customerId: number, phone: string) {
  return db.gamificationIdentity.upsert({
    where: { customerId },
    update: { phoneE164: phone },
    create: { customerId, phoneE164: phone },
  });
}

async function seedState(customerId: number, monthlyPoints: number, lifetimeXp: number) {
  await db.gamificationState.upsert({
    where: { customerId },
    update: { monthlyPoints, lifetimeXp },
    create: { customerId, monthlyPoints, lifetimeXp },
  });
}

async function cleanup() {
  for (const cid of ALL_CIDS) {
    await db.gamificationMonthlySnapshot.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationEventLog.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationState.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationIdentity.deleteMany({ where: { customerId: cid } }).catch(() => {});
  }
  // Clean up reset audits from test runs
  await db.gamificationResetAudit.deleteMany({
    where: { resetPeriod: getCurrentPeriod() },
  }).catch(() => {});
}

describe("performMonthlyReset", () => {
  beforeAll(async () => {
    await cleanup();
    await seedIdentity(CID_A, "+351903000001");
    await seedIdentity(CID_B, "+351903000002");
    await seedIdentity(CID_C, "+351903000003");

    // CID_A has 150 monthly points
    await seedState(CID_A, 150, 500);
    // CID_B has 80 monthly points
    await seedState(CID_B, 80, 200);
    // CID_C has 0 monthly points
    await seedState(CID_C, 0, 50);
  });

  afterAll(cleanup);

  it("creates snapshots for students with monthlyPoints > 0", async () => {
    const result = await performMonthlyReset();

    expect(result.snapshotCount).toBe(2); // CID_A and CID_B only
    expect(result.resetCount).toBe(2);

    // Verify snapshots were created
    const period = getCurrentPeriod();
    const snapA = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_A, pointsPeriod: period } },
    });
    const snapB = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_B, pointsPeriod: period } },
    });
    const snapC = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_C, pointsPeriod: period } },
    });

    expect(snapA).not.toBeNull();
    expect(snapA!.monthlyPoints).toBe(150);
    expect(snapB).not.toBeNull();
    expect(snapB!.monthlyPoints).toBe(80);
    expect(snapC).toBeNull(); // 0 points → no snapshot
  });

  it("zeroes monthlyPoints on all reset students", async () => {
    const stateA = await db.gamificationState.findUnique({ where: { customerId: CID_A } });
    const stateB = await db.gamificationState.findUnique({ where: { customerId: CID_B } });
    const stateC = await db.gamificationState.findUnique({ where: { customerId: CID_C } });

    expect(stateA!.monthlyPoints).toBe(0);
    expect(stateB!.monthlyPoints).toBe(0);
    expect(stateC!.monthlyPoints).toBe(0); // already was 0
  });

  it("preserves lifetimeXp (not reset)", async () => {
    const stateA = await db.gamificationState.findUnique({ where: { customerId: CID_A } });
    const stateB = await db.gamificationState.findUnique({ where: { customerId: CID_B } });

    expect(stateA!.lifetimeXp).toBe(500);
    expect(stateB!.lifetimeXp).toBe(200);
  });

  it("creates a single reset audit entry", async () => {
    const period = getCurrentPeriod();
    const audit = await db.gamificationResetAudit.findFirst({
      where: { resetPeriod: period },
    });

    expect(audit).not.toBeNull();
    expect(audit!.status).toBe("completed");
    expect(audit!.customersZeroed).toBe(2);
    expect(audit!.completedAt).not.toBeNull();
  });

  it("is idempotent — second call in same month is a no-op", async () => {
    const result = await performMonthlyReset();

    // Should skip because audit already exists for this period
    expect(result.resetCount).toBe(0);
    expect(result.snapshotCount).toBe(0);
    expect(result.skipped).toBe(true);
  });

  it("returns correct result shape", async () => {
    // First clean up the audit to test a fresh run
    const period = getCurrentPeriod();
    await db.gamificationResetAudit.deleteMany({ where: { resetPeriod: period } });
    // Re-seed points
    await seedState(CID_A, 100, 500);

    const result = await performMonthlyReset();
    expect(result).toEqual({
      resetCount: 1,
      snapshotCount: 1,
      auditId: expect.any(String),
      skipped: false,
    });
  });
});
