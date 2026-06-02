-- CreateTable
CREATE TABLE IF NOT EXISTS "CronRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cronName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "durationMs" INTEGER,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CronRunLog_cronName_startedAt_idx" ON "CronRunLog"("cronName", "startedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CronRunLog_startedAt_idx" ON "CronRunLog"("startedAt" DESC);
