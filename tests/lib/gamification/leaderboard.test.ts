import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { formatLeaderName, getMonthlyLeaderboard } from "@/lib/gamification/leaderboard";

describe("formatLeaderName", () => {
  it("formats first name + last initial", () => {
    expect(formatLeaderName("João", "Silva")).toBe("João S.");
  });
  it("uses first name only when last name is missing", () => {
    expect(formatLeaderName("João", null)).toBe("João");
    expect(formatLeaderName("João", "  ")).toBe("João");
  });
  it("returns null when there is no first name", () => {
    expect(formatLeaderName(null, "Silva")).toBeNull();
    expect(formatLeaderName("", "Silva")).toBeNull();
  });
  it("uppercases the last initial", () => {
    expect(formatLeaderName("ana", "costa")).toBe("ana C.");
  });
});

// CIDs in a dedicated range to avoid collisions with other suites.
const VIEWER = 90070;
const CIDS = [90070, 90071, 90072, 90073, 90074, 90075];

async function cleanup() {
  for (const id of CIDS) {
    await db.gamificationState.deleteMany({ where: { customerId: id } });
    await db.gamificationIdentity.deleteMany({ where: { customerId: id } });
  }
}

async function seed(
  customerId: number,
  monthlyPoints: number,
  over: Partial<{ optInAt: Date | null; erasedAt: Date | null; consentTraining: boolean }> = {},
) {
  await db.gamificationIdentity.create({
    data: {
      customerId,
      phoneE164: `+3519110000${customerId}`,
      optInAt: over.optInAt === undefined ? new Date() : over.optInAt,
      erasedAt: over.erasedAt ?? null,
      consentTraining: over.consentTraining ?? true,
    },
  });
  await db.gamificationState.create({ data: { customerId, monthlyPoints, lifetimeXp: monthlyPoints } });
}

describe("getMonthlyLeaderboard", () => {
  beforeAll(async () => {
    await cleanup();
    await seed(90071, 500); // top
    await seed(90072, 300);
    await seed(VIEWER, 100); // the viewer, mid-pack
    await seed(90073, 0); // zero points → excluded
    await seed(90074, 999, { erasedAt: new Date() }); // erased → excluded
    await seed(90075, 999, { optInAt: null, consentTraining: false }); // not opted in → excluded
  });
  afterAll(cleanup);

  // Use a large limit and filter to OUR seeded CIDs: the query is global, so
  // other suites' eligible rows may interleave — only relative order is stable.
  it("ranks eligible students by monthly points and flags the viewer", async () => {
    const board = await getMonthlyLeaderboard(VIEWER, 1000);
    const mine = board.filter((r) => CIDS.includes(r.customerId));
    expect(mine.map((r) => r.customerId)).toEqual([90071, 90072, VIEWER]);
    // ranks strictly increase down the board
    expect(mine[0].rank).toBeLessThan(mine[1].rank);
    expect(mine[1].rank).toBeLessThan(mine[2].rank);
    expect(mine.find((r) => r.customerId === VIEWER)?.isViewer).toBe(true);
    expect(mine.find((r) => r.customerId === 90071)?.isViewer).toBe(false);
  });

  it("excludes zero-point, erased, and non-consented students", async () => {
    const board = await getMonthlyLeaderboard(VIEWER, 1000);
    const ids = board.map((r) => r.customerId);
    expect(ids).not.toContain(90073);
    expect(ids).not.toContain(90074);
    expect(ids).not.toContain(90075);
  });

  it("respects the limit", async () => {
    const board = await getMonthlyLeaderboard(VIEWER, 1);
    expect(board.length).toBe(1);
  });
});
