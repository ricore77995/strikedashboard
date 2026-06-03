import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { checkCreditGates } from "@/lib/gamification/gates";
import { getCurrentPeriod, getTodayISO } from "@/lib/gamification/poll/shared";

const CID = 91001;
const PHONE = "+351910000001";
const EMAIL = "gates-test@example.com";

async function cleanup() {
  await db.yogoMembershipSnapshot.deleteMany({ where: { userId: CID } }).catch(() => {});
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
}

describe("checkCreditGates", () => {
  beforeAll(async () => {
    await cleanup();
    // Create identity — auto-opt-in via upsert
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: PHONE, email: EMAIL, consentTraining: true, optInAt: new Date() },
    });

    // Create an active membership snapshot
    await db.yogoMembershipSnapshot.create({
      data: {
        userId: CID,
        snapshotDate: getTodayISO(),
        membershipTypeName: "8 sessões/mês",
        status: "active",
        statusText: "",
        paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        capturedAt: new Date(),
      },
    });
  });

  afterAll(cleanup);

  it("passes all gates for a fully set up student", async () => {
    const result = await checkCreditGates(CID);
    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("fails gate 1 — no identity", async () => {
    const result = await checkCreditGates(999991);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("no_identity");
  });

  it("fails gate 1 — erased identity", async () => {
    // Temporarily mark as erased
    await db.gamificationIdentity.update({
      where: { customerId: CID },
      data: { erasedAt: new Date() },
    });

    const result = await checkCreditGates(CID);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("erased");

    // Restore
    await db.gamificationIdentity.update({
      where: { customerId: CID },
      data: { erasedAt: null },
    });
  });

  it("fails gate 2 — dunning membership", async () => {
    // Update snapshot to dunning
    await db.yogoMembershipSnapshot.updateMany({
      where: { userId: CID },
      data: { statusText: "Pausado. Renovação automática falhou 4 vezes." },
    });

    const result = await checkCreditGates(CID);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("membership_paused");

    // Restore
    await db.yogoMembershipSnapshot.updateMany({
      where: { userId: CID },
      data: { statusText: "" },
    });
  });

  it("passes when no snapshot exists (first observation)", async () => {
    // Delete snapshot
    await db.yogoMembershipSnapshot.deleteMany({ where: { userId: CID } });

    const result = await checkCreditGates(CID);
    expect(result.passed).toBe(true);

    // Restore snapshot for other tests
    await db.yogoMembershipSnapshot.create({
      data: {
        userId: CID,
        snapshotDate: getTodayISO(),
        membershipTypeName: "8 sessões/mês",
        status: "active",
        statusText: "",
        paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        capturedAt: new Date(),
      },
    });
  });
});
