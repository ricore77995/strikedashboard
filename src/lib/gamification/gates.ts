import { db } from "@/lib/db";
import { findByCustomerId } from "./identity";
import { isOptedIn } from "./consent";
import { classify } from "@/lib/yogo/classify";
import { isNonActionableLead } from "@/lib/yogo/non-actionable-lead";
import { getTodayISO } from "./poll/shared";

export interface GateCheckResult {
  passed: boolean;
  reason?: string;
}

/**
 * Check all 5 credit gates before awarding real points.
 *
 * Gates:
 * 1. Identity exists and is not erased
 * 2. consentTraining === true (opted in)
 * 3. Not paused (medical/vacation/personal)
 * 4. classify(membership) === "active"
 * 5. Not an aggregator/USC/internal account
 *
 * Returns { passed: true } if all gates pass, or { passed: false, reason }
 * with the first failing gate.
 */
export async function checkCreditGates(customerId: number): Promise<GateCheckResult> {
  // Gate 1: Identity exists and not erased
  const identity = await findByCustomerId(customerId);
  if (!identity) {
    return { passed: false, reason: "no_identity" };
  }
  if (identity.erasedAt) {
    return { passed: false, reason: "erased" };
  }

  // Gate 2: Training consent opted in
  const optedIn = await isOptedIn(customerId);
  if (!optedIn) {
    return { passed: false, reason: "not_opted_in" };
  }

  // Gate 3: Not paused (pause is active if date is in the future)
  const now = new Date();
  if (
    (identity.medicalPauseUntil && identity.medicalPauseUntil > now) ||
    (identity.vacationPauseUntil && identity.vacationPauseUntil > now) ||
    (identity.personalPauseUntil && identity.personalPauseUntil > now)
  ) {
    return { passed: false, reason: "paused" };
  }

  // Gate 4: Membership classify === "active"
  const snapshot = await db.yogoMembershipSnapshot.findFirst({
    where: { userId: customerId },
    orderBy: { snapshotDate: "desc" },
  });

  if (snapshot) {
    const membershipState = classify(
      {
        status: snapshot.status ?? "unknown",
        status_text: snapshot.statusText ?? "",
        paid_until: snapshot.paidUntil?.toISOString() ?? null,
      },
      getTodayISO(),
    );

    if (membershipState !== "active") {
      return { passed: false, reason: `membership_${membershipState}` };
    }
  }
  // No snapshot = first observation, allow through (will be caught by other gates if needed)

  // Gate 5: Not aggregator
  if (identity.email && isNonActionableLead(identity.email)) {
    return { passed: false, reason: "aggregator" };
  }

  return { passed: true };
}
