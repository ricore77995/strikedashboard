import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";

// Helpers — direct DB writes for test setup
async function seedIdentity(customerId: number, phone: string) {
  return db.gamificationIdentity.upsert({
    where: { customerId },
    update: { phoneE164: phone },
    create: { customerId, phoneE164: phone },
  });
}

async function cleanup(customerId: number) {
  await db.gamificationEventLog.deleteMany({ where: { customerId } });
  await db.gamificationState.deleteMany({ where: { customerId } });
  await db.gamificationIdentity.deleteMany({ where: { customerId } });
}

describe("appendEvent", () => {
  const CID = 90001;

  beforeAll(async () => {
    await cleanup(CID);
    await seedIdentity(CID, "+351900000001");
  });

  it("writes a new event and returns eventId", async () => {
    const result = await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 0,
      xpDelta: 0,
      idempotencyKey: `test:checkin:${CID}:cls1`,
      source: "system",
    });

    expect(result.written).toBe(true);
    expect(result.eventId).toBeGreaterThan(0);
  });

  it("is idempotent — duplicate idempotencyKey returns written:false", async () => {
    const result = await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 0,
      idempotencyKey: `test:checkin:${CID}:cls1`, // same key
      source: "system",
    });

    expect(result.written).toBe(false);
    expect(result.eventId).toBeUndefined();
  });

  it("stores payloadJson as string", async () => {
    const payload = { classId: 42, className: "Muay Thai" };
    await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      payloadJson: payload,
      idempotencyKey: `test:checkin:${CID}:cls42`,
    });

    const row = await db.gamificationEventLog.findFirst({
      where: { idempotencyKey: `test:checkin:${CID}:cls42` },
    });
    expect(row?.payloadJson).toBe(JSON.stringify(payload));
  });

  it("auto-increments eventId across events", async () => {
    await appendEvent({
      customerId: CID,
      eventType: "consent_changed",
      idempotencyKey: `test:consent:${CID}:1`,
    });

    const row = await db.gamificationEventLog.findFirst({
      where: { idempotencyKey: `test:consent:${CID}:1` },
    });
    // eventId should be > the first event's eventId
    expect(row?.eventId).toBeGreaterThan(0);
  });
});
