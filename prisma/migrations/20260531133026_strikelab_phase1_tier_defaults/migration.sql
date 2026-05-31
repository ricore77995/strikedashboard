-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GamificationMonthlySnapshot" (
    "customerId" INTEGER NOT NULL,
    "pointsPeriod" TEXT NOT NULL,
    "monthlyPoints" INTEGER NOT NULL DEFAULT 0,
    "xpAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
    "classesInPeriod" INTEGER NOT NULL DEFAULT 0,
    "finalTier" TEXT NOT NULL DEFAULT 'iniciante',
    "sealedAt" DATETIME,

    PRIMARY KEY ("customerId", "pointsPeriod")
);
INSERT INTO "new_GamificationMonthlySnapshot" ("classesInPeriod", "customerId", "finalTier", "monthlyPoints", "pointsPeriod", "sealedAt", "xpAtPeriodEnd") SELECT "classesInPeriod", "customerId", "finalTier", "monthlyPoints", "pointsPeriod", "sealedAt", "xpAtPeriodEnd" FROM "GamificationMonthlySnapshot";
DROP TABLE "GamificationMonthlySnapshot";
ALTER TABLE "new_GamificationMonthlySnapshot" RENAME TO "GamificationMonthlySnapshot";
CREATE TABLE "new_GamificationState" (
    "customerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthlyPoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimeXp" INTEGER NOT NULL DEFAULT 0,
    "currentTier" TEXT NOT NULL DEFAULT 'iniciante',
    "proposedTier" TEXT,
    "currentStreakDays" INTEGER NOT NULL DEFAULT 0,
    "streakShieldAvailable" BOOLEAN NOT NULL DEFAULT false,
    "shieldResetForMonth" TEXT,
    "lastClassAt" DATETIME,
    "lastReplayedEventId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GamificationState_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "GamificationIdentity" ("customerId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GamificationState" ("currentStreakDays", "currentTier", "customerId", "lastClassAt", "lastReplayedEventId", "lifetimeXp", "monthlyPoints", "proposedTier", "shieldResetForMonth", "streakShieldAvailable", "updatedAt") SELECT "currentStreakDays", "currentTier", "customerId", "lastClassAt", "lastReplayedEventId", "lifetimeXp", "monthlyPoints", "proposedTier", "shieldResetForMonth", "streakShieldAvailable", "updatedAt" FROM "GamificationState";
DROP TABLE "GamificationState";
ALTER TABLE "new_GamificationState" RENAME TO "GamificationState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
