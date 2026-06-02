-- AlterTable: Add referralCode to GamificationIdentity
ALTER TABLE `GamificationIdentity` ADD COLUMN `referralCode` TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS `GamificationIdentity_referralCode_key` ON `GamificationIdentity`(`referralCode`);

-- CreateTable: Referral
CREATE TABLE IF NOT EXISTS `Referral` (
    `id` TEXT NOT NULL PRIMARY KEY,
    `inviterCustomerId` INTEGER NOT NULL,
    `referredCustomerId` INTEGER NOT NULL,
    `referralCodeUsed` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `linkedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `trialCreditedAt` DATETIME,
    `phase1CreditedAt` DATETIME,
    `phase2CreditedAt` DATETIME,
    CONSTRAINT `Referral_inviterCustomerId_fkey` FOREIGN KEY (`inviterCustomerId`) REFERENCES `GamificationIdentity`(`customerId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Referral_referredCustomerId_fkey` FOREIGN KEY (`referredCustomerId`) REFERENCES `GamificationIdentity`(`customerId`) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: unique referredCustomerId (one inviter per referee)
CREATE UNIQUE INDEX IF NOT EXISTS `Referral_referredCustomerId_key` ON `Referral`(`referredCustomerId`);

-- CreateIndex: lookup referrals made by an inviter
CREATE INDEX IF NOT EXISTS `Referral_inviterCustomerId_idx` ON `Referral`(`inviterCustomerId`);

-- CreateIndex: filter by status
CREATE INDEX IF NOT EXISTS `Referral_status_idx` ON `Referral`(`status`);
