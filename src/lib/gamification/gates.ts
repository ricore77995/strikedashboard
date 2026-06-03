import { db } from "@/lib/db";
import { findByCustomerId } from "./identity";
import { classify } from "@/lib/yogo/classify";
import { isNonActionableLead } from "@/lib/yogo/non-actionable-lead";
import { getTodayISO } from "./poll/shared";

export interface GateCheckResult {
  passed: boolean;
  reason?: string;
}

/**
 * Check credit gates before awarding real points.
 *
 * Gates:
 * 1. Identity exists and is not erased
 * 2. Not paused (medical/vacation/personal)
 * 3. classify(membership) === "active"
 * 4. Not an aggregator/USC/internal account
 *
 * Note: consentTraining gate removed — students consent via T&Cs at signup.
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

  // Gate 2: Not paused (pause is active if date is in the future)
  const now = new Date();
  if (
    (identity.medicalPauseUntil && identity.medicalPauseUntil > now) ||
    (identity.vacationPauseUntil && identity.vacationPauseUntil > now) ||
    (identity.personalPauseUntil && identity.personalPauseUntil > now)
  ) {
    return { passed: false, reason: "paused" };
  }

  // Gate 3: Membership classify === "active"
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

  // Gate 4: Not aggregator
  if (identity.email && isNonActionableLead(identity.email)) {
    return { passed: false, reason: "aggregator" };
  }

  return { passed: true };
}
