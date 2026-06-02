import { db } from "@/lib/db";
import { findByReferralCode, findByCustomerId } from "./identity";
import { appendEvent } from "./event-log";
import { checkCreditGates } from "./gates";
import { getCurrentPeriod } from "./poll/shared";

// ─── Constants ────────────────────────────────────────────────────────

const TRIAL_POINTS = 200;
const PHASE1_POINTS = 800;
const PHASE2_POINTS = 1200;
const PHASE2_CHECKIN_THRESHOLD = 6;

// ─── Anti-ring ────────────────────────────────────────────────────────

interface LinkResult {
  ok: boolean;
  reason?: string;
  referralId?: string;
}

/**
 * Link a referral code to a referred customer.
 * Creates the Referral row with status "pending".
 * Anti-ring: no self-referral, no duplicate (one inviter per referee).
 */
export async function linkReferral(
  code: string,
  referredCustomerId: number,
): Promise<LinkResult> {
  // 1. Look up inviter by code
  const inviter = await findByReferralCode(code.toUpperCase().trim());
  if (!inviter) {
    return { ok: false, reason: "code_not_found" };
  }

  // 2. Anti-ring: no self-referral
  if (inviter.customerId === referredCustomerId) {
    return { ok: false, reason: "self_referral" };
  }

  // 3. Anti-ring: no duplicate (one inviter per referee)
  const existing = await db.referral.findUnique({
    where: { referredCustomerId },
  });
  if (existing) {
    return { ok: false, reason: "already_referred" };
  }

  // 4. Create Referral row
  try {
    const referral = await db.referral.create({
      data: {
        inviterCustomerId: inviter.customerId,
        referredCustomerId,
        referralCodeUsed: code.toUpperCase().trim(),
        status: "pending",
      },
    });
    return { ok: true, referralId: referral.id };
  } catch (err: unknown) {
    // P2002 on referredCustomerId unique → concurrent link
    if (isP2002(err)) {
      return { ok: false, reason: "already_referred" };
    }
    throw err;
  }
}

// ─── Gates ────────────────────────────────────────────────────────────

/**
 * Check referral credit gates:
 * 1. Inviter passes checkCreditGates (opted-in, active, not erased, not paused)
 * 2. Referred has consentTraining === true
 */
async function checkReferralGates(
  inviterCustomerId: number,
  referredCustomerId: number,
): Promise<{ passed: boolean; reason?: string }> {
  // Gate 1: Inviter passes standard credit gates
  const inviterGates = await checkCreditGates(inviterCustomerId);
  if (!inviterGates.passed) {
    return { passed: false, reason: `inviter_${inviterGates.reason}` };
  }

  // Gate 2: Referred has consented to training tracking
  const referred = await findByCustomerId(referredCustomerId);
  if (!referred || referred.erasedAt) {
    return { passed: false, reason: "referred_no_identity" };
  }
  if (!referred.consentTraining) {
    return { passed: false, reason: "referred_no_consent" };
  }

  return { passed: true };
}

// ─── Trial ────────────────────────────────────────────────────────────

/**
 * Check if a pending referral should be credited for trial.
 * Called from pollClasses after a check-in is observed.
 */
export async function tryReferralTrial(
  referredCustomerId: number,
): Promise<void> {
  const referral = await db.referral.findFirst({
    where: { referredCustomerId, status: "pending" },
  });
  if (!referral) return;

  const gates = await checkReferralGates(
    referral.inviterCustomerId,
    referredCustomerId,
  );
  if (!gates.passed) return;

  const period = getCurrentPeriod();
  const appended = await appendEvent({
    customerId: referral.inviterCustomerId,
    eventType: "referral_trial_only",
    pointsDelta: TRIAL_POINTS,
    xpDelta: TRIAL_POINTS,
    payloadJson: { referredCustomerId },
    source: "cron",
    idempotencyKey: `ref_trial:${referral.inviterCustomerId}:${referredCustomerId}`,
    pointsPeriod: period,
  });

  if (appended.written) {
    // Conditional status update — prevents TOCTOU race
    await db.referral.updateMany({
      where: { id: referral.id, status: "pending" },
      data: { status: "trial_credited", trialCreditedAt: new Date() },
    });
  }
}

// ─── Phase 1 (subscription) ───────────────────────────────────────────

/**
 * Check if a referral should be credited for phase 1 (subscription).
 * Called from pollMemberships when a subscription is detected.
 * Handles pending → phase1 skip (credits trial first if needed).
 */
export async function tryReferralPhase1(
  referredCustomerId: number,
): Promise<void> {
  const referral = await db.referral.findFirst({
    where: {
      referredCustomerId,
      status: { in: ["pending", "trial_credited"] },
    },
  });
  if (!referral) return;

  // If still pending, credit trial first
  if (referral.status === "pending") {
    await tryReferralTrial(referredCustomerId);
  }

  const gates = await checkReferralGates(
    referral.inviterCustomerId,
    referredCustomerId,
  );
  if (!gates.passed) return;

  const period = getCurrentPeriod();
  const appended = await appendEvent({
    customerId: referral.inviterCustomerId,
    eventType: "referral_phase_1",
    pointsDelta: PHASE1_POINTS,
    xpDelta: PHASE1_POINTS,
    payloadJson: { referredCustomerId },
    source: "cron",
    idempotencyKey: `ref_p1:${referral.inviterCustomerId}:${referredCustomerId}`,
    pointsPeriod: period,
  });

  if (appended.written) {
    // Conditional status update — prevents TOCTOU race
    await db.referral.updateMany({
      where: {
        id: referral.id,
        status: { in: ["pending", "trial_credited"] },
      },
      data: { status: "phase1_credited", phase1CreditedAt: new Date() },
    });
  }
}

// ─── Phase 2 (retention: 6 check-ins + 1 renewal) ─────────────────────

/**
 * Check if a referral should be credited for phase 2 (retention).
 * Called from BOTH pollClasses AND pollMemberships.
 *
 * Temporal scoping: only counts events AFTER referral.linkedAt.
 * This prevents existing students from getting phase 2 instantly.
 */
export async function tryReferralPhase2(
  referredCustomerId: number,
): Promise<void> {
  const referral = await db.referral.findFirst({
    where: { referredCustomerId, status: "phase1_credited" },
  });
  if (!referral) return;

  const gates = await checkReferralGates(
    referral.inviterCustomerId,
    referredCustomerId,
  );
  if (!gates.passed) return;

  // Temporal scoping: only count events after linkedAt
  const linkedAt = referral.linkedAt;

  // Condition 1: ≥ 6 check-ins after linkedAt
  const checkinCount = await db.gamificationEventLog.count({
    where: {
      customerId: referredCustomerId,
      eventType: "checkin_observed",
      createdAt: { gte: linkedAt },
    },
  });
  if (checkinCount < PHASE2_CHECKIN_THRESHOLD) return;

  // Condition 2: at least 1 renewal after linkedAt
  const renewal = await db.gamificationEventLog.findFirst({
    where: {
      customerId: referredCustomerId,
      eventType: "subscription_renewed",
      createdAt: { gte: linkedAt },
    },
    select: { eventId: true },
  });
  if (!renewal) return;

  // Both conditions met — credit phase 2
  const period = getCurrentPeriod();
  const appended = await appendEvent({
    customerId: referral.inviterCustomerId,
    eventType: "referral_phase_2",
    pointsDelta: PHASE2_POINTS,
    xpDelta: PHASE2_POINTS,
    payloadJson: {
      referredCustomerId,
      checkinCount,
      linkedAt: linkedAt.toISOString(),
    },
    source: "cron",
    idempotencyKey: `ref_p2:${referral.inviterCustomerId}:${referredCustomerId}`,
    pointsPeriod: period,
  });

  if (appended.written) {
    // Conditional status update — prevents TOCTOU race
    await db.referral.updateMany({
      where: { id: referral.id, status: "phase1_credited" },
      data: { status: "phase2_credited", phase2CreditedAt: new Date() },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Type guard for Prisma P2002 unique-constraint error. */
function isP2002(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "P2002";
  }
  return false;
}
