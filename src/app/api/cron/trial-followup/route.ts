import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { yogoFetch } from "@/lib/yogo/fetch";
import { sendTemplate } from "@/lib/wa/meta";
import { isWaEnabled } from "@/lib/wa/config";
import { isoLisbonDate, lisbonHour } from "@/lib/wa/lisbon";
import { normalize } from "@/lib/phone";
import { isNonActionableLead, parseReport } from "@/lib/utils";
import { TRIAL_CLASS_TYPE_ID } from "@/lib/constants";
import { withCronLog } from "@/lib/cron-log";

const TARGET_LISBON_HOUR = 11;
const LANGUAGE_CODE = "pt_PT";

interface TrialAttendee {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

// GET /api/cron/trial-followup
// Bearer-auth gated. Dual-scheduled in vercel.json (0 10 UTC + 0 11 UTC) to
// cover both Lisbon DST seasons; we exit early unless Lisbon wall-clock hour
// is 11 so we never send twice.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isWaEnabled()) return NextResponse.json({ skipped: "wa_disabled" });

  const hour = lisbonHour();
  if (hour !== TARGET_LISBON_HOUR) {
    return NextResponse.json({ skipped: "wrong_hour", lisbonHour: hour });
  }

  const result = await withCronLog("trial-followup", async () => {
    const dateKey = isoLisbonDate(yesterday()); // e.g. "2026-05-25"
  const attendees = await fetchYesterdayTrialAttendees(dateKey);
  const eligible = attendees.filter((c) => !isNonActionableLead({ email: c.email }));

  const stats = { eligible: eligible.length, sent: 0, skipped: 0, pending: 0, failed: 0 };

  for (const c of eligible) {
    if (typeof c.id !== "number" || !c.phone) {
      stats.skipped++;
      continue;
    }
    const { e164 } = normalize(c.phone);
    if (!e164) {
      stats.skipped++;
      continue;
    }
    const outcome = await sendOnce(e164, c, dateKey);
    if (outcome === "sent") stats.sent++;
    else if (outcome === "duplicate") stats.skipped++;
    else if (outcome === "pending") stats.pending++;
    else stats.failed++;
  }

    return { ranAt: new Date().toISOString(), dateKey, ...stats };
  });

  return NextResponse.json(result);
}

type SendOutcome = "sent" | "duplicate" | "pending" | "failed";

async function sendOnce(phoneE164: string, customer: TrialAttendee, dateKey: string): Promise<SendOutcome> {
  const templateName = process.env.WA_TEMPLATE_TRIAL_FOLLOWUP;
  if (!templateName) {
    await logPending(phoneE164, { reason: "no_template_configured", dateKey });
    return "pending";
  }

  try {
    await db.waContact.upsert({
      where: { phoneE164 },
      create: { phoneE164 },
      update: {},
    });

    // (phoneE164, templateKey) @@unique handles the dedupe across cron re-runs
    // (e.g. 10 UTC sees no work because hour gate exits; if the DST changes
    // mid-day, we still won't double-fire).
    await db.waOutbound.create({
      data: {
        phoneE164,
        kind: "template",
        payload: JSON.stringify({ templateName, language: LANGUAGE_CODE, parameterCount: 1 }),
        status: "pending",
        templateKey: `trial_followup:${dateKey}`,
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return "duplicate";
    }
    throw err;
  }

  const result = await sendTemplate(phoneE164, templateName, LANGUAGE_CODE, [
    { type: "text", text: customer.first_name ?? "atleta" },
  ]);

  if (result.ok) {
    await db.waOutbound.updateMany({
      where: { phoneE164, templateKey: `trial_followup:${dateKey}` },
      data: { status: "sent" },
    });
    await db.waEvent.create({ data: { kind: "TEMPLATE_SENT", phoneE164 } });
    return "sent";
  }

  // Meta template-not-found / not-approved errors -> TEMPLATE_PENDING.
  const looksPending = /template|not.{0,10}translated|not.{0,10}approved/i.test(result.body);
  if (looksPending || result.status === 400) {
    await db.waOutbound.updateMany({
      where: { phoneE164, templateKey: `trial_followup:${dateKey}` },
      data: { status: "skipped_pending", error: snippet(result.body) },
    });
    await logPending(phoneE164, { status: result.status, body: snippet(result.body), dateKey });
    return "pending";
  }

  await db.waOutbound.updateMany({
    where: { phoneE164, templateKey: `trial_followup:${dateKey}` },
    data: { status: "failed", error: snippet(result.body) },
  });
  await db.waEvent.create({
    data: { kind: "TEMPLATE_FAIL", phoneE164, meta: JSON.stringify({ status: result.status }) },
  });
  return "failed";
}

async function logPending(phoneE164: string, meta: Record<string, unknown>): Promise<void> {
  await db.waEvent.create({
    data: { kind: "TEMPLATE_PENDING", phoneE164, meta: JSON.stringify(meta) },
  });
}

async function fetchYesterdayTrialAttendees(yesterdayDate: string): Promise<TrialAttendee[]> {
  const res = await yogoFetch<unknown>("reports/customers", {
    method: "POST",
    body: JSON.stringify({
      filters: [
        {
          type: "numberOfSignups",
          classTypeId: [TRIAL_CLASS_TYPE_ID],
          membershipTypeId: [],
          conditionType: "greaterThanOrEquals",
          conditionAmount: 1,
          averagePerTimeUnit: "month",
          startDate: yesterdayDate,
          endDate: yesterdayDate,
          includeClassSignups: true,
          onlyCheckedInClassSignups: true,
          includeWaitingListSignups: false,
          includeLivestreamSignups: false,
          includeZeroSignups: false,
        },
      ],
      returnColumnHeaders: true,
    }),
  });
  if (!res.ok) return [];
  return parseReport(res.data) as unknown as TrialAttendee[];
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function snippet(s: string): string {
  return s.length <= 200 ? s : s.slice(0, 200);
}
