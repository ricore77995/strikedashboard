-- CreateTable
CREATE TABLE IF NOT EXISTS "StrikelabChallengeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challengeKey" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "launchedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StrikelabChallengeRun_isoWeek_key" ON "StrikelabChallengeRun"("isoWeek");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrikelabChallengeRun_status_idx" ON "StrikelabChallengeRun"("status");
