import { describe, it, expect } from "vitest";
import { resolvePlanCategory, getPointsPerClass, getPerfectWeekThreshold } from "@/lib/gamification/plan-resolver";

describe("resolvePlanCategory", () => {
  it("maps P8 plans", () => {
    expect(resolvePlanCategory("8 sessões/mês")).toBe("P8");
    expect(resolvePlanCategory("8 sessoes/mes")).toBe("P8");
  });

  it("maps P12 plans", () => {
    expect(resolvePlanCategory("12 sessões/mês")).toBe("P12");
    expect(resolvePlanCategory("12 sessoes/mes")).toBe("P12");
  });

  it("maps Livre plans", () => {
    expect(resolvePlanCategory("24 sessões/mês")).toBe("LIVRE");
    expect(resolvePlanCategory("Livre")).toBe("LIVRE");
    expect(resolvePlanCategory("24 sessoes/mes")).toBe("LIVRE");
  });

  it("maps PT plans", () => {
    expect(resolvePlanCategory("PT (Marcelo) | 3x/sem")).toBe("PT");
    expect(resolvePlanCategory("PT 4 Passes")).toBe("PT");
    expect(resolvePlanCategory("PT 8 Passes")).toBe("PT");
    expect(resolvePlanCategory("PT 12 Passes")).toBe("PT");
  });

  it("returns OTHER for unknown plans", () => {
    expect(resolvePlanCategory("Some Random Plan")).toBe("OTHER");
    expect(resolvePlanCategory("Striking Trimestral")).toBe("OTHER");
  });

  it("returns OTHER for null/undefined/empty", () => {
    expect(resolvePlanCategory(null)).toBe("OTHER");
    expect(resolvePlanCategory(undefined)).toBe("OTHER");
    expect(resolvePlanCategory("")).toBe("OTHER");
  });

  it("matches refreshed 2026-05 plan names", () => {
    // These match the PLAN_VALUES keys from constants.ts
    expect(resolvePlanCategory("8 sessões/mês")).toBe("P8");
    expect(resolvePlanCategory("12 sessões/mês")).toBe("P12");
    expect(resolvePlanCategory("24 sessões/mês")).toBe("LIVRE");
  });
});

describe("getPointsPerClass", () => {
  it("returns correct points for each category", () => {
    expect(getPointsPerClass("P8")).toBe(110);
    expect(getPointsPerClass("P12")).toBe(80);
    expect(getPointsPerClass("LIVRE")).toBe(55);
    expect(getPointsPerClass("PT")).toBe(0);
    expect(getPointsPerClass("OTHER")).toBe(0);
  });
});

describe("getPerfectWeekThreshold", () => {
  it("returns correct thresholds", () => {
    expect(getPerfectWeekThreshold("P8")).toBe(2);
    expect(getPerfectWeekThreshold("P12")).toBe(3);
    expect(getPerfectWeekThreshold("LIVRE")).toBe(4);
    expect(getPerfectWeekThreshold("PT")).toBe(0);
  });
});
