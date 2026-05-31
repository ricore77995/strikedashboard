import { describe, it, expect } from "vitest";
import { resolveTier, getTierProgress } from "@/lib/gamification/tier";

describe("resolveTier", () => {
  it("returns iniciante at 0 XP", () => {
    expect(resolveTier(0)).toBe("iniciante");
  });

  it("returns iniciante below bronze threshold", () => {
    expect(resolveTier(4999)).toBe("iniciante");
  });

  it("returns bronze at exactly 5000 XP", () => {
    expect(resolveTier(5000)).toBe("bronze");
  });

  it("returns bronze between 5000 and 14999", () => {
    expect(resolveTier(14999)).toBe("bronze");
  });

  it("returns prata at 15000", () => {
    expect(resolveTier(15000)).toBe("prata");
  });

  it("returns prata between 15000 and 39999", () => {
    expect(resolveTier(39999)).toBe("prata");
  });

  it("returns ouro at 40000", () => {
    expect(resolveTier(40000)).toBe("ouro");
  });

  it("returns ouro between 40000 and 79999", () => {
    expect(resolveTier(79999)).toBe("ouro");
  });

  it("returns diamante at 80000", () => {
    expect(resolveTier(80000)).toBe("diamante");
  });

  it("returns diamante well above threshold", () => {
    expect(resolveTier(100000)).toBe("diamante");
    expect(resolveTier(500000)).toBe("diamante");
  });
});

describe("getTierProgress", () => {
  it("returns 0 progress at tier boundary", () => {
    const p = getTierProgress(5000);
    expect(p.current).toBe("bronze");
    expect(p.next).toBe("prata");
    expect(p.progress).toBe(0);
    expect(p.xpToNext).toBe(10000);
  });

  it("returns ~0.5 progress halfway through bronze", () => {
    const p = getTierProgress(10000);
    expect(p.current).toBe("bronze");
    expect(p.next).toBe("prata");
    expect(p.progress).toBeCloseTo(0.5, 1);
    expect(p.xpToNext).toBe(5000);
  });

  it("returns null next for diamante", () => {
    const p = getTierProgress(80000);
    expect(p.current).toBe("diamante");
    expect(p.next).toBeNull();
    expect(p.progress).toBe(1);
    expect(p.xpToNext).toBe(0);
  });

  it("returns progress from iniciante to bronze", () => {
    const p = getTierProgress(2500);
    expect(p.current).toBe("iniciante");
    expect(p.next).toBe("bronze");
    expect(p.progress).toBeCloseTo(0.5, 1);
    expect(p.xpToNext).toBe(2500);
  });
});
