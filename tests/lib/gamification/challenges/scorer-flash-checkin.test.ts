import { describe, it, expect } from "vitest";
import { scoreFlashCheckin, type ScorerClass } from "@/lib/gamification/challenges/scorer-flash-checkin";

const WIN_START = Date.parse("2026-06-03T11:00:00.000Z");
const WIN_END = Date.parse("2026-06-07T22:59:59.000Z");

function cls(signups: Array<{ id: number; checked_in: number }>): ScorerClass {
  return { signups: signups.map((s) => ({ user: { id: s.id }, checked_in: s.checked_in })) };
}

describe("scoreFlashCheckin", () => {
  it("ranks earliest in-window check-ins ascending", () => {
    const classes = [
      cls([{ id: 1, checked_in: WIN_START + 5000 }, { id: 2, checked_in: WIN_START + 1000 }]),
      cls([{ id: 3, checked_in: WIN_START + 3000 }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([2, 3, 1]);
  });

  it("excludes check-ins outside the window and not-checked-in (0)", () => {
    const classes = [
      cls([{ id: 1, checked_in: WIN_START - 1000 }, { id: 2, checked_in: 0 }, { id: 3, checked_in: WIN_END + 1 }]),
      cls([{ id: 4, checked_in: WIN_END }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([4]);
  });

  it("dedupes to each customer's earliest check-in", () => {
    const classes = [
      cls([{ id: 7, checked_in: WIN_START + 9000 }]),
      cls([{ id: 7, checked_in: WIN_START + 2000 }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toEqual({ customerId: 7, checkedInAt: WIN_START + 2000 });
  });

  it("breaks timestamp ties deterministically by customerId ascending", () => {
    const t = WIN_START + 4000;
    const classes = [cls([{ id: 30, checked_in: t }, { id: 10, checked_in: t }, { id: 20, checked_in: t }])];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([10, 20, 30]);
  });
});
