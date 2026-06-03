import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { applyConsent, isOptedIn } from "@/lib/gamification/consent";

const CID = 90020;

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  await db.gamificationState.deleteMany({ where: { customerId: CID } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } });
}

describe("consent module", () => {
  beforeAll(async () => {
    await cleanup();
    // Create identity WITHOUT auto-opt-in so consent tests are meaningful
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: "+351911000020" },
    });
  });

  afterAll(cleanup);

  it("starts opted-out", async () => {
    const opted = await isOptedIn(CID);
    expect(opted).toBe(false);
  });

  it("applies training consent and marks opted-in", async () => {
    const result = await applyConsent(CID, {
      training: true,
      ugc: false,
      realName: false,
      broadcasts: false,
    });

    expect(result.changed).toContain("training");

    const identity = await db.gamificationIdentity.findUnique({
      where: { customerId: CID },
    });
    expect(identity?.consentTraining).toBe(true);
    expect(identity?.optInAt).not.toBeNull();

    const opted = await isOptedIn(CID);
    expect(opted).toBe(true);
  });

  it("emits consent_changed audit event", async () => {
    const events = await db.gamificationEventLog.findMany({
      where: { customerId: CID, eventType: "consent_changed" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(events[0].payloadJson ?? "{}");
    expect(payload.changed).toContain("training");
  });

  it("no change → no event", async () => {
    const before = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "consent_changed" },
    });

    await applyConsent(CID, {
      training: true,
      ugc: false,
      realName: false,
      broadcasts: false,
    });

    const after = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "consent_changed" },
    });
    expect(after).toBe(before); // no new event
  });

  it("applies multiple toggles at once", async () => {
    const result = await applyConsent(CID, {
      training: true,
      ugc: true,
      realName: true,
      broadcasts: true,
    });

    expect(result.changed).toContain("ugc");
    expect(result.changed).toContain("realName");
    expect(result.changed).toContain("broadcasts");

    const identity = await db.gamificationIdentity.findUnique({
      where: { customerId: CID },
    });
    expect(identity?.consentUgc).toBe(true);
    expect(identity?.consentRealName).toBe(true);
    expect(identity?.consentBroadcasts).toBe(true);
  });

  it("opt-out sets optOutAt and clears training", async () => {
    await applyConsent(CID, {
      training: false,
      ugc: true,
      realName: true,
      broadcasts: true,
    });

    const identity = await db.gamificationIdentity.findUnique({
      where: { customerId: CID },
    });
    expect(identity?.consentTraining).toBe(false);
    expect(identity?.optOutAt).not.toBeNull();

    expect(await isOptedIn(CID)).toBe(false);
  });
});
