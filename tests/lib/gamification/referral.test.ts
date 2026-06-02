import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { linkReferral, tryReferralTrial, tryReferralPhase1, tryReferralPhase2 } from "@/lib/gamification/referral";
import { upsertIdentity } from "@/lib/gamification/identity";
import { appendEvent } from "@/lib/gamification/event-log";
import { applyConsent } from "@/lib/gamification/consent";
import { getCurrentPeriod, getTodayISO } from "@/lib/gamification/poll/shared";

// ─── Test IDs (high numbers to avoid collisions) ──────────────────────

const INVITER_CID = 92001;
const REFERRED_CID = 92002;
const REFERRED_PHONE = "+351920000001";
const REFERRED_EMAIL = "referred-ref-test@example.com";
const INVITER_PHONE = "+351920000002";
const INVITER_EMAIL = "inviter-ref-test@example.com";

let inviterCode: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────

async function cleanup() {
  await db.referral.deleteMany({
    where: {
      OR: [
        { inviterCustomerId: INVITER_CID },
        { referredCustomerId: REFERRED_CID },
      ],
    },
  }).catch(() => {});
  await db.gamificationEventLog.deleteMany({
    where: { customerId: { in: [INVITER_CID, REFERRED_CID] } },
  }).catch(() => {});
  await db.gamificationState.deleteMany({
    where: { customerId: { in: [INVITER_CID, REFERRED_CID] } },
  }).catch(() => {});
  await db.yogoMembershipSnapshot.deleteMany({
    where: { userId: { in: [INVITER_CID, REFERRED_CID] } },
  }).catch(() => {});
  await db.gamificationIdentity.deleteMany({
    where: { customerId: { in: [INVITER_CID, REFERRED_CID] } },
  }).catch(() => {});
}

async function createTestIdentity(cid: number, phone: string, email: string) {
  return db.gamificationIdentity.create({
    data: { customerId: cid, phoneE164: phone, email },
  });
}

async function createActiveMembership(cid: number) {
  return db.yogoMembershipSnapshot.create({
    data: {
      userId: cid,
      snapshotDate: getTodayISO(),
      membershipTypeName: "8 sessões/mês",
      status: "active",
      statusText: "",
      paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      capturedAt: new Date(),
    },
  });
}

async function emitCheckin(cid: number, classId: number) {
  return appendEvent({
    customerId: cid,
    eventType: "checkin_observed",
    pointsDelta: 110,
    xpDelta: 110,
    payloadJson: { classId },
    source: "cron",
    idempotencyKey: `checkin:${cid}:${classId}`,
    pointsPeriod: getCurrentPeriod(),
  });
}

async function emitRenewal(cid: number) {
  return appendEvent({
    customerId: cid,
    eventType: "subscription_renewed",
    pointsDelta: 350,
    xpDelta: 350,
    payloadJson: { test: true },
    source: "cron",
    idempotencyKey: `renewal:${cid}:${getTodayISO()}`,
    pointsPeriod: getCurrentPeriod(),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Referral system", () => {
  beforeAll(async () => {
    await cleanup();

    // Create both identities via upsertIdentity (generates referral codes)
    const inviter = await upsertIdentity({
      customerId: INVITER_CID,
      phoneE164: INVITER_PHONE,
      email: INVITER_EMAIL,
    });
    inviterCode = inviter.referralCode;
    expect(inviterCode).toBeTruthy();
    expect(inviterCode!.length).toBe(6);

    await upsertIdentity({
      customerId: REFERRED_CID,
      phoneE164: REFERRED_PHONE,
      email: REFERRED_EMAIL,
    });

    // Both consent to training
    await applyConsent(INVITER_CID, { training: true, ugc: false, realName: false, broadcasts: false });
    await applyConsent(REFERRED_CID, { training: true, ugc: false, realName: false, broadcasts: false });

    // Both have active memberships
    await createActiveMembership(INVITER_CID);
    await createActiveMembership(REFERRED_CID);
  });

  afterAll(cleanup);

  // ─── Referral code generation ─────────────────────────────────────

  it("generates a 6-char referral code on identity creation", () => {
    expect(inviterCode).toBeTruthy();
    expect(inviterCode!.length).toBe(6);
    expect(/^[A-HJ-NP-Z2-9]{6}$/.test(inviterCode!)).toBe(true);
  });

  // ─── linkReferral ─────────────────────────────────────────────────

  describe("linkReferral", () => {
    it("links a valid referral code to a referred customer", async () => {
      const result = await linkReferral(inviterCode!, REFERRED_CID);
      expect(result.ok).toBe(true);
      expect(result.referralId).toBeTruthy();
    });

    it("rejects self-referral", async () => {
      const result = await linkReferral(inviterCode!, INVITER_CID);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("self_referral");
    });

    it("rejects duplicate referral (one inviter per referee)", async () => {
      const result = await linkReferral(inviterCode!, REFERRED_CID);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("already_referred");
    });

    it("rejects invalid code", async () => {
      const result = await linkReferral("INVALID", INVITER_CID);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("code_not_found");
    });
  });

  // ─── Tier 1: Trial (+200) ────────────────────────────────────────

  describe("tryReferralTrial", () => {
    it("credits +200 to inviter when referred checks in", async () => {
      // Emit a check-in for the referred customer
      const checkin = await emitCheckin(REFERRED_CID, 99001);
      expect(checkin.written).toBe(true);

      // Run trial check
      await tryReferralTrial(REFERRED_CID);

      // Verify trial event was created for inviter
      const trialEvent = await db.gamificationEventLog.findFirst({
        where: {
          customerId: INVITER_CID,
          eventType: "referral_trial_only",
        },
      });
      expect(trialEvent).toBeTruthy();
      expect(trialEvent!.pointsDelta).toBe(200);
      expect(trialEvent!.xpDelta).toBe(200);
    });

    it("is idempotent — calling again does not create duplicate events", async () => {
      const before = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_trial_only" },
      });

      await tryReferralTrial(REFERRED_CID);

      const after = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_trial_only" },
      });
      expect(after).toBe(before);
    });
  });

  // ─── Tier 2: Phase 1 (+800) ──────────────────────────────────────

  describe("tryReferralPhase1", () => {
    it("credits +800 to inviter when referred gets a renewal", async () => {
      // Emit a renewal for the referred customer
      const renewal = await emitRenewal(REFERRED_CID);
      expect(renewal.written).toBe(true);

      await tryReferralPhase1(REFERRED_CID);

      const phase1Event = await db.gamificationEventLog.findFirst({
        where: {
          customerId: INVITER_CID,
          eventType: "referral_phase_1",
        },
      });
      expect(phase1Event).toBeTruthy();
      expect(phase1Event!.pointsDelta).toBe(800);
    });

    it("is idempotent — no duplicate phase 1 events", async () => {
      const before = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_phase_1" },
      });

      await tryReferralPhase1(REFERRED_CID);

      const after = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_phase_1" },
      });
      expect(after).toBe(before);
    });
  });

  // ─── Tier 3: Phase 2 (+1200) ─────────────────────────────────────

  describe("tryReferralPhase2", () => {
    it("does NOT credit phase 2 with insufficient check-ins", async () => {
      // We only have 1 check-in so far — need 6
      await tryReferralPhase2(REFERRED_CID);

      const phase2Event = await db.gamificationEventLog.findFirst({
        where: {
          customerId: INVITER_CID,
          eventType: "referral_phase_2",
        },
      });
      expect(phase2Event).toBeNull();
    });

    it("credits +1200 when 6 check-ins + 1 renewal both after linkedAt", async () => {
      // Get the referral to find linkedAt
      const referral = await db.referral.findUnique({
        where: { referredCustomerId: REFERRED_CID },
      });
      expect(referral).toBeTruthy();
      expect(referral!.status).toBe("phase1_credited");

      // Emit 5 more check-ins (total = 6) — all after linkedAt
      for (let i = 2; i <= 6; i++) {
        const checkin = await emitCheckin(REFERRED_CID, 99000 + i);
        expect(checkin.written).toBe(true);
      }

      // Now try phase 2 — should succeed (6 check-ins + 1 renewal)
      await tryReferralPhase2(REFERRED_CID);

      const phase2Event = await db.gamificationEventLog.findFirst({
        where: {
          customerId: INVITER_CID,
          eventType: "referral_phase_2",
        },
      });
      expect(phase2Event).toBeTruthy();
      expect(phase2Event!.pointsDelta).toBe(1200);
    });

    it("updates referral status to phase2_credited", async () => {
      const referral = await db.referral.findUnique({
        where: { referredCustomerId: REFERRED_CID },
      });
      expect(referral!.status).toBe("phase2_credited");
      expect(referral!.phase2CreditedAt).toBeTruthy();
    });

    it("is idempotent — no duplicate phase 2 events", async () => {
      const before = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_phase_2" },
      });

      await tryReferralPhase2(REFERRED_CID);

      const after = await db.gamificationEventLog.count({
        where: { customerId: INVITER_CID, eventType: "referral_phase_2" },
      });
      expect(after).toBe(before);
    });
  });

  // ─── Temporal scoping verification ────────────────────────────────

  describe("temporal scoping", () => {
    it("phase 2 payload includes linkedAt for audit", async () => {
      const phase2Event = await db.gamificationEventLog.findFirst({
        where: {
          customerId: INVITER_CID,
          eventType: "referral_phase_2",
        },
      });
      // payloadJson is stored as a JSON string in SQLite, parse it
      const payload = typeof phase2Event!.payloadJson === "string"
        ? JSON.parse(phase2Event!.payloadJson)
        : phase2Event!.payloadJson;
      expect(payload.linkedAt).toBeTruthy();
      expect(payload.checkinCount).toBe(6);
    });
  });

  // ─── Total points verification ────────────────────────────────────

  it("inviter received correct total referral points (200+800+1200=2200)", async () => {
    const referralEvents = await db.gamificationEventLog.findMany({
      where: {
        customerId: INVITER_CID,
        eventType: { in: ["referral_trial_only", "referral_phase_1", "referral_phase_2"] },
      },
    });
    const totalPoints = referralEvents.reduce((sum, e) => sum + e.pointsDelta, 0);
    expect(totalPoints).toBe(2200);
  });
});
