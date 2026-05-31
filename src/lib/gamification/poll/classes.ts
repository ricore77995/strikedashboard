import { db } from "@/lib/db";
import { yogoFetch } from "@/lib/yogo/fetch";
import { findByCustomerId } from "@/lib/gamification/identity";
import { appendEvent } from "@/lib/gamification/event-log";
import { isOptedIn } from "@/lib/gamification/consent";
import { classify } from "@/lib/yogo/classify";
import { getCurrentPeriod, getTodayISO } from "./shared";
import { resolvePlanCategory, getPointsPerClass } from "@/lib/gamification/plan-resolver";
import { checkCreditGates } from "@/lib/gamification/gates";
import type { PlanCategory } from "@/lib/gamification/constants";

// ─── Types ───────────────────────────────────────────────────────────

interface YogoSignupUser {
  id: number;
  phone?: string;
  email?: string;
  date_of_birth?: string | null;
}

interface YogoSignup {
  id: number;
  user: YogoSignupUser;
  checked_in: number; // Unix ms, 0 = not checked in
}

interface YogoClass {
  id: number;
  class_type?: { id: number; name: string };
  signups: YogoSignup[];
}

// ─── Result ──────────────────────────────────────────────────────────

export interface PollResult {
  classesProcessed: number;
  checkinsObserved: number;
  skippedNoIdentity: number;
  skippedOptOut: number;
  skippedNotActive: number;
  dobCaptured: number;
}

// ─── Membership snapshot lookup ──────────────────────────────────────

/**
 * Get the customer's membership state and plan name from the most recent snapshot.
 */
async function getMembershipInfo(customerId: number): Promise<{
  state: string | null;
  planCategory: PlanCategory;
}> {
  const snapshot = await db.yogoMembershipSnapshot.findFirst({
    where: { userId: customerId },
    orderBy: { snapshotDate: "desc" },
  });

  if (!snapshot) return { state: null, planCategory: "OTHER" };

  const membershipState = classify(
    {
      status: snapshot.status ?? "unknown",
      status_text: snapshot.statusText ?? "",
      paid_until: snapshot.paidUntil?.toISOString() ?? null,
    },
    getTodayISO(),
  );

  const planCategory = resolvePlanCategory(snapshot.membershipTypeName);

  return { state: membershipState, planCategory };
}

// ─── DOB passive capture ─────────────────────────────────────────────

async function captureDob(customerId: number, dob: string | null | undefined): Promise<boolean> {
  if (!dob) return false;

  const year = new Date(dob).getFullYear();
  if (isNaN(year) || year < 1900) return false;

  const identity = await db.gamificationIdentity.findUnique({
    where: { customerId },
    select: { birthYear: true },
  });

  if (!identity || identity.birthYear !== null) return false;

  await db.gamificationIdentity.update({
    where: { customerId },
    data: { birthYear: year },
  });

  return true;
}

// ─── Main poll ───────────────────────────────────────────────────────

/**
 * Poll today's Yogo classes and emit checkin_observed events for
 * checked-in students who have an identity and are opted in.
 *
 * Phase 0: pointsDelta is always 0. Phase 1 will calculate from plan + boosts.
 */
export async function pollClasses(): Promise<PollResult> {
  const today = getTodayISO();
  const period = getCurrentPeriod();

  const result: PollResult = {
    classesProcessed: 0,
    checkinsObserved: 0,
    skippedNoIdentity: 0,
    skippedOptOut: 0,
    skippedNotActive: 0,
    dobCaptured: 0,
  };

  // Fetch today's classes with signups
  const response = await yogoFetch<YogoClass[]>(
    `classes?startDate=${today}&endDate=${today}&populate[]=signups.user&populate[]=class_type`,
  );

  if (!response.ok || !Array.isArray(response.data)) {
    throw new Error(`Yogo classes fetch failed: ${response.status}`);
  }

  const classes = response.data;
  result.classesProcessed = classes.length;

  for (const cls of classes) {
    for (const signup of cls.signups) {
      // Only process checked-in students
      if (!signup.checked_in) continue;

      const customerId = signup.user.id;

      // 1. Identity lookup
      const identity = await findByCustomerId(customerId);
      if (!identity) {
        result.skippedNoIdentity++;
        continue;
      }

      // 2. Erased check
      if (identity.erasedAt) continue;

      // 3. Passive DOB capture
      const dobCaptured = await captureDob(customerId, signup.user.date_of_birth);
      if (dobCaptured) result.dobCaptured++;

      // 4. Opt-in check
      const optedIn = await isOptedIn(customerId);
      if (!optedIn) {
        result.skippedOptOut++;
        continue;
      }

      // 5. Classify gate — check membership state and resolve plan
      const { state: membershipState, planCategory } = await getMembershipInfo(customerId);
      const isActive = membershipState === "active" || membershipState === null;

      // 6. Compute points
      //    Phase 0 (flag off): pointsDelta=0 always
      //    Phase 1 (flag on): resolve plan, check gates, compute real points
      let pointsDelta = 0;
      let xpDelta = 0;
      const realPointsEnabled = process.env.STRIKELAB_REAL_POINTS_ENABLED === "true";

      if (realPointsEnabled && isActive) {
        const gates = await checkCreditGates(customerId);
        if (gates.passed) {
          pointsDelta = getPointsPerClass(planCategory);
          xpDelta = pointsDelta; // Base only, boosts added in Sprint 2
        }
      }

      const payload: Record<string, unknown> = {
        classId: cls.id,
        className: cls.class_type?.name,
        checkedInAt: signup.checked_in,
        membershipState,
        planCategory,
      };

      if (!isActive) {
        result.skippedNotActive++;
        payload.skippedReason = "not_active";
      }

      const appended = await appendEvent({
        customerId,
        eventType: "checkin_observed",
        pointsDelta,
        xpDelta,
        payloadJson: payload,
        source: "cron",
        idempotencyKey: `checkin:${customerId}:${cls.id}`,
        pointsPeriod: period,
      });

      if (appended.written) {
        result.checkinsObserved++;
      }
    }
  }

  return result;
}
