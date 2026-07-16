import { describe, expect, test } from "vitest";
import { buildChurnReport, formatDuration } from "@/lib/churn-report";

describe("churn-report", () => {
  test("formatDuration", () => {
    expect(formatDuration(5)).toBe("5 dias");
    expect(formatDuration(1)).toBe("1 dia");
    expect(formatDuration(30)).toBe("1 mês");
    expect(formatDuration(75)).toBe("2 meses");
    expect(formatDuration(365)).toBe("1 ano");
    expect(formatDuration(400)).toBe("1 ano 1 mês");
  });

  test("buildChurnReport excludes PT plans", () => {
    const membership = {
      id: 1,
      user_id: 100,
      user_full_name: "Ana Silva",
      membership_type_name: "PT 8 Passes",
      status: "ended" as const,
      paid_until: "2026-06-01",
      start_date: "2026-01-01",
      ended_because: "cancelled" as const,
    };
    const report = buildChurnReport([membership], [], [], { startDate: "2026-01-01", endDate: "2026-07-15" });
    expect(report.rows).toHaveLength(0);
  });

  test("buildChurnReport counts classes in period", () => {
    const membership = {
      id: 1,
      user_id: 100,
      user_full_name: "Ana Silva",
      membership_type_name: "12 sessões/mês",
      status: "ended" as const,
      paid_until: "2026-06-01",
      start_date: "2026-01-01",
      ended_because: "payment_failed" as const,
    };
    const classes = [
      {
        id: 1,
        date: "2026-02-01",
        signups: [{ user_id: 100, checked_in: 1, cancelled_at: 0 }],
      },
      {
        id: 2,
        date: "2026-03-01",
        signups: [{ user_id: 100, checked_in: 0, cancelled_at: 0 }],
      },
      {
        id: 3,
        date: "2026-07-01",
        signups: [{ user_id: 100, checked_in: 1, cancelled_at: 0 }],
      },
    ];
    const customers = [{ id: 100, first_name: "Ana", last_name: "Silva" }];
    const report = buildChurnReport([membership], classes, customers, { startDate: "2026-01-01", endDate: "2026-07-15" });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].totalClasses).toBe(2);
    expect(report.rows[0].checkedInClasses).toBe(1);
    expect(report.rows[0].classesPerMonth).toBeCloseTo(0.4, 1);
  });

  test("buildChurnReport ignores cancelled signups", () => {
    const membership = {
      id: 1,
      user_id: 100,
      user_full_name: "Ana Silva",
      membership_type_name: "12 sessões/mês",
      status: "ended" as const,
      paid_until: "2026-06-01",
      start_date: "2026-01-01",
      ended_because: "cancelled" as const,
    };
    const classes = [
      {
        id: 1,
        date: "2026-02-01",
        signups: [{ user_id: 100, checked_in: 1, cancelled_at: 1770000000000 }],
      },
    ];
    const report = buildChurnReport([membership], classes, [], { startDate: "2026-01-01", endDate: "2026-07-15" });
    expect(report.rows[0].totalClasses).toBe(0);
  });
});
