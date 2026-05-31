/**
 * Phase 0 Acceptance Test — exercises the full happy path.
 *
 * Covers: identity → consent → IG verify → membership snapshot → class poll →
 * materialize → dunning gate → erasure.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { upsertIdentity, generateIgChallenge, verifyIgChallenge } from "@/lib/gamification/identity";
import { appendEvent } from "@/lib/gamification/event-log";
import { materializeState, persistState } from "@/lib/gamification/state";
import { applyConsent } from "@/lib/gamification/consent";
import { executeTrackA } from "@/lib/gamification/erasure";
import { classify } from "@/lib/yogo/classify";
import { pickBestMembership } from "@/lib/yogo/pick-best-membership";
import { isNonActionableLead } from "@/lib/yogo/non-actionable-lead";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

const CID = 90999;

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  await db.gamificationState.deleteMany({ where: { customerId: CID } });
  await db.gamificationMonthlySnapshot.deleteMany({ where: { customerId: CID } });
  await db.yogoMembershipSnapshot.deleteMany({ where: { userId: CID } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } });
}

describe("Phase 0 acceptance — full happy path with classify gate", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("1. Create identity with DOB filled", async () => {
    const identity = await upsertIdentity({
      customerId: CID,
      phoneE164: "+351999999999",
      email: "acceptance@test.com",
    });

    await db.gamificationIdentity.update({
      where: { customerId: CID },
      data: { birthYear: 1995 },
    });

    expect(identity.customerId).toBe(CID);
  });

  it("2. Capture consent (training=true)", async () => {
    const result = await applyConsent(CID, {
      training: true,
      ugc: false,
      realName: false,
      broadcasts: false,
    });

    expect(result.changed).toContain("training");

    const identity = await db.gamificationIdentity.findUnique({ where: { customerId: CID } });
    expect(identity?.consentTraining).toBe(true);
    expect(identity?.optInAt).not.toBeNull();
  });

  it("3. IG verify via challenge code", async () => {
    const code = await generateIgChallenge(CID);
    expect(code).toMatch(/^\d{6}$/);

    const result = await verifyIgChallenge({
      customerId: CID,
      code,
      igHandle: "@acceptance_test",
    });

    expect(result.ok).toBe(true);

    const identity = await db.gamificationIdentity.findUnique({ where: { customerId: CID } });
    expect(identity?.instagramHandle).toBe("@acceptance_test");
    expect(identity?.igVerifiedAt).not.toBeNull();
  });

  it("4. Daily membership snapshot captures membership in active state", async () => {
    await db.yogoMembershipSnapshot.create({
      data: {
        userId: CID,
        snapshotDate: "2026-05-28",
        membershipTypeId: 6021,
        membershipTypeName: "Mensal",
        status: "active",
        statusText: "",
        paidUntil: new Date("2026-06-30"),
      },
    });

    const snapshot = await db.yogoMembershipSnapshot.findUnique({
      where: { userId_snapshotDate: { userId: CID, snapshotDate: "2026-05-28" } },
    });

    expect(snapshot?.status).toBe("active");

    // Classify should return "active"
    const state = classify(
      { status: snapshot!.status!, status_text: snapshot!.statusText ?? "", paid_until: snapshot!.paidUntil?.toISOString() ?? null },
      "2026-05-28",
    );
    expect(state).toBe("active");
  });

  it("5. Class poll observes check-in → event recorded with pointsDelta=0", async () => {
    const period = getCurrentPeriod();
    const result = await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 0,
      xpDelta: 0,
      payloadJson: { classId: 999, className: "Acceptance Test Class", membershipState: "active" },
      source: "cron",
      idempotencyKey: `checkin:${CID}:999`,
      pointsPeriod: period,
    });

    expect(result.written).toBe(true);
  });

  it("6. Materialize state", async () => {
    const state = await materializeState(CID);

    expect(state).not.toBeNull();
    expect(state!.monthlyPoints).toBe(0); // Phase 0: no points yet
    expect(state!.lifetimeXp).toBe(0);
    expect(state!.currentTier).toBe("iniciante");
    expect(state!.lastReplayedEventId).not.toBeNull();

    await persistState(state!);

    const row = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(row).not.toBeNull();
    expect(row!.monthlyPoints).toBe(0);
  });

  it("7. Insert a dunning membership snapshot → classify changes to paused", async () => {
    await db.yogoMembershipSnapshot.upsert({
      where: { userId_snapshotDate: { userId: CID, snapshotDate: "2026-05-29" } },
      update: {
        status: "active",
        statusText: "Pausado. Renovação automática falhou 4 vezes.",
        paidUntil: new Date("2026-03-31"),
      },
      create: {
        userId: CID,
        snapshotDate: "2026-05-29",
        membershipTypeId: 6021,
        membershipTypeName: "Mensal",
        status: "active",
        statusText: "Pausado. Renovação automática falhou 4 vezes.",
        paidUntil: new Date("2026-03-31"),
      },
    });

    const state = classify(
      {
        status: "active",
        status_text: "Pausado. Renovação automática falhou 4 vezes.",
        paid_until: "2026-03-31",
      },
      "2026-05-29",
    );
    expect(state).toBe("paused");
  });

  it("8. Yogo helpers work correctly", () => {
    // pickBestMembership
    const active = { status: "active", status_text: "", paid_until: "2026-06-30" };
    const paused = { status: "active", status_text: "Pausado", paid_until: "2026-06-30" };
    const best = pickBestMembership([paused, active], "2026-05-29");
    expect(best?.status).toBe("active");

    // isNonActionableLead
    expect(isNonActionableLead("usc-abc@urbansportsclub.com")).toBe(true);
    expect(isNonActionableLead("normal@gmail.com")).toBe(false);
  });

  it("9. Erasure → state zeroed, identity tombstoned", async () => {
    const result = await executeTrackA(CID, 1);

    expect(result.eventsAnonymised).toBeGreaterThanOrEqual(1);
    expect(result.stateZeroed).toBe(true);

    const identity = await db.gamificationIdentity.findUnique({ where: { customerId: CID } });
    expect(identity?.erasedAt).not.toBeNull();
    expect(identity?.email).toBeNull();
    expect(identity?.consentTraining).toBe(false);

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state?.monthlyPoints).toBe(0);
    expect(state?.lifetimeXp).toBe(0);
  });
});
