import { describe, it, expect } from "vitest";
import { challengeWindow } from "@/lib/gamification/challenges/window";

describe("challengeWindow", () => {
  it("summer week (WEST, UTC+1): Wed 12:00 / Sun 23:59:59 Lisbon", () => {
    const w = challengeWindow(new Date("2026-06-03T10:00:00Z"));
    expect(w.isoWeek).toBe("2026-06-01");
    expect(w.windowStart.toISOString()).toBe("2026-06-03T11:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-06-07T22:59:59.000Z");
  });

  it("winter week (WET, UTC+0): Wed 12:00 / Sun 23:59:59 Lisbon", () => {
    const w = challengeWindow(new Date("2026-01-07T10:00:00Z"));
    expect(w.isoWeek).toBe("2026-01-05");
    expect(w.windowStart.toISOString()).toBe("2026-01-07T12:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-01-11T23:59:59.000Z");
  });

  it("is stable regardless of which weekday 'now' falls on", () => {
    const w = challengeWindow(new Date("2026-06-05T09:00:00Z"));
    expect(w.isoWeek).toBe("2026-06-01");
    expect(w.windowStart.toISOString()).toBe("2026-06-03T11:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-06-07T22:59:59.000Z");
  });
});
