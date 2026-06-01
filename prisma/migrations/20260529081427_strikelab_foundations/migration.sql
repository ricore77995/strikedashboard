-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationIdentity" (
    "customerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneE164" TEXT NOT NULL,
    "email" TEXT,
    "whatsappWaId" TEXT,
    "manychatSubscriber" TEXT,
    "instagramHandle" TEXT,
    "igVerifiedAt" DATETIME,
    "igChallengeCode" TEXT,
    "igChallengeExpiry" DATETIME,
    "optInAt" DATETIME,
    "optOutAt" DATETIME,
    "consentVersion" TEXT DEFAULT 'v1.0',
    "consentTraining" BOOLEAN NOT NULL DEFAULT false,
    "consentUgc" BOOLEAN NOT NULL DEFAULT false,
    "consentRealName" BOOLEAN NOT NULL DEFAULT false,
    "consentBroadcasts" BOOLEAN NOT NULL DEFAULT false,
    "parentalConsentRef" TEXT,
    "birthYear" INTEGER,
    "medicalPauseUntil" DATETIME,
    "vacationPauseUntil" DATETIME,
    "personalPauseUntil" DATETIME,
    "erasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationEventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL DEFAULT 0,
    "xpDelta" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "operatorId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "pointsPeriod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GamificationEventLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "GamificationIdentity" ("customerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationState" (
    "customerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthlyPoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimeXp" INTEGER NOT NULL DEFAULT 0,
    "currentTier" TEXT NOT NULL DEFAULT 'bronze',
    "proposedTier" TEXT,
    "currentStreakDays" INTEGER NOT NULL DEFAULT 0,
    "streakShieldAvailable" BOOLEAN NOT NULL DEFAULT false,
    "shieldResetForMonth" TEXT,
    "lastClassAt" DATETIME,
    "lastReplayedEventId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GamificationState_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "GamificationIdentity" ("customerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationMonthlySnapshot" (
    "customerId" INTEGER NOT NULL,
    "pointsPeriod" TEXT NOT NULL,
    "monthlyPoints" INTEGER NOT NULL DEFAULT 0,
    "xpAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
    "classesInPeriod" INTEGER NOT NULL DEFAULT 0,
    "finalTier" TEXT NOT NULL DEFAULT 'bronze',
    "sealedAt" DATETIME,

    PRIMARY KEY ("customerId", "pointsPeriod")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationResetAudit" (
    "resetId" TEXT NOT NULL PRIMARY KEY,
    "resetPeriod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "batchesApplied" INTEGER NOT NULL DEFAULT 0,
    "customersZeroed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "YogoMembershipSnapshot" (
    "userId" INTEGER NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "membershipTypeId" INTEGER,
    "membershipTypeName" TEXT,
    "paidUntil" DATETIME,
    "nextPaymentDate" DATETIME,
    "status" TEXT,
    "statusText" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "snapshotDate")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationIdentity_phoneE164_key" ON "GamificationIdentity"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationIdentity_email_key" ON "GamificationIdentity"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationIdentity_whatsappWaId_key" ON "GamificationIdentity"("whatsappWaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationIdentity_manychatSubscriber_key" ON "GamificationIdentity"("manychatSubscriber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationIdentity_instagramHandle_key" ON "GamificationIdentity"("instagramHandle");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationEventLog_eventId_key" ON "GamificationEventLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationEventLog_idempotencyKey_key" ON "GamificationEventLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationEventLog_customerId_createdAt_idx" ON "GamificationEventLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationEventLog_eventType_pointsPeriod_idx" ON "GamificationEventLog"("eventType", "pointsPeriod");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationEventLog_pointsPeriod_idx" ON "GamificationEventLog"("pointsPeriod");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YogoMembershipSnapshot_snapshotDate_idx" ON "YogoMembershipSnapshot"("snapshotDate");
