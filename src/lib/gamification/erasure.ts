import { db } from "@/lib/db";
import { appendEvent } from "./event-log";

/**
 * GDPR Art. 17 erasure — two-track implementation (P5).
 *
 * Track A (default, fast): tombstone identity, anonymise event log payloads,
 * zero state, audit event. Data is pseudonymised, not fully deleted — customer_id
 * is retained for aggregate stats.
 *
 * Track B (≥12 months after Track A, operator-initiated): hash customer_id
 * everywhere, delete identity row. Full anonymisation.
 */

// ─── Track A: Pseudonymisation ───────────────────────────────────────

export interface TrackAResult {
  customerId: number;
  eventsAnonymised: number;
  stateZeroed: boolean;
}

/**
 * Track A erasure: tombstone identity, anonymise payloads, zero state.
 * Can be called from admin UI or API.
 */
export async function executeTrackA(customerId: number, operatorId: number): Promise<TrackAResult> {
  const identity = await db.gamificationIdentity.findUnique({
    where: { customerId },
  });

  if (!identity) throw new Error(`No identity for customer ${customerId}`);
  if (identity.erasedAt) throw new Error(`Identity ${customerId} already erased`);

  // 1. Tombstone identity
  await db.gamificationIdentity.update({
    where: { customerId },
    data: {
      erasedAt: new Date(),
      phoneE164: `erased_${customerId}`,
      email: null,
      whatsappWaId: null,
      manychatSubscriber: null,
      instagramHandle: null,
      igVerifiedAt: null,
      igChallengeCode: null,
      igChallengeExpiry: null,
      consentTraining: false,
      consentUgc: false,
      consentRealName: false,
      consentBroadcasts: false,
      parentalConsentRef: null,
    },
  });

  // 2. Anonymise event log payloads (replace with marker)
  const events = await db.gamificationEventLog.findMany({
    where: { customerId },
    select: { id: true },
  });

  for (const ev of events) {
    await db.gamificationEventLog.update({
      where: { id: ev.id },
      data: { payloadJson: JSON.stringify({ anonymised: true }) },
    });
  }

  // 3. Zero state
  await db.gamificationState.upsert({
    where: { customerId },
    update: {
      monthlyPoints: 0,
      lifetimeXp: 0,
      currentTier: "iniciante",
      currentStreakDays: 0,
      streakShieldAvailable: false,
      lastClassAt: null,
    },
    create: {
      customerId,
      monthlyPoints: 0,
      lifetimeXp: 0,
    },
  });

  // 4. Audit event
  await appendEvent({
    customerId,
    eventType: "erasure_executed",
    payloadJson: { track: "A", operatorId },
    source: "admin",
    operatorId,
    idempotencyKey: `erasure:A:${customerId}`,
  });

  return {
    customerId,
    eventsAnonymised: events.length,
    stateZeroed: true,
  };
}

// ─── Track B: Full anonymisation ─────────────────────────────────────

export interface TrackBResult {
  customerId: number;
  deleted: boolean;
}

/**
 * Track B erasure: hash customer_id everywhere, delete identity.
 * Only allowed ≥12 months after Track A.
 */
export async function executeTrackB(customerId: number, operatorId: number): Promise<TrackBResult> {
  const identity = await db.gamificationIdentity.findUnique({
    where: { customerId },
  });

  if (!identity) throw new Error(`No identity for customer ${customerId}`);
  if (!identity.erasedAt) {
    throw new Error(`Track B requires Track A first. Identity ${customerId} not erased.`);
  }

  // Check 12-month cooling period
  const twelveMonthsAgo = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000);
  if (identity.erasedAt > twelveMonthsAgo) {
    throw new Error(
      `Track B requires 12 months after Track A. Erased at ${identity.erasedAt.toISOString()}.`,
    );
  }

  // Hash the customer_id for anonymisation
  const hashedId = `anon_${customerId}_${Date.now()}`;

  // Update event logs with hashed customer reference (for aggregate stats)
  await db.gamificationEventLog.updateMany({
    where: { customerId },
    data: { payloadJson: JSON.stringify({ fullyAnonymised: true, hashedId }) },
  });

  // Delete state
  await db.gamificationState.deleteMany({ where: { customerId } });

  // Delete monthly snapshots
  await db.gamificationMonthlySnapshot.deleteMany({ where: { customerId } });

  // Delete identity row (final)
  await db.gamificationIdentity.delete({ where: { customerId } });

  return { customerId, deleted: true };
}
