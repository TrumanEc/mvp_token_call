/*
  Warnings:

  - You are about to alter the column `shares` on the `Position` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Float`.

*/
-- CreateTable
CREATE TABLE "LmsrSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "qYesBefore" REAL NOT NULL,
    "qNoBefore" REAL NOT NULL,
    "pYesBefore" REAL NOT NULL,
    "side" TEXT NOT NULL,
    "deltaShares" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "qYesAfter" REAL NOT NULL,
    "qNoAfter" REAL NOT NULL,
    "pYesAfter" REAL NOT NULL,
    "triggerType" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LmsrSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerName" TEXT,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outcome" TEXT,
    "b" REAL NOT NULL DEFAULT 100.0,
    "qYes" REAL NOT NULL DEFAULT 0,
    "qNo" REAL NOT NULL DEFAULT 0,
    "seedCost" REAL NOT NULL DEFAULT 0,
    "yesPool" DECIMAL NOT NULL DEFAULT 0,
    "noPool" DECIMAL NOT NULL DEFAULT 0,
    "maxPool" DECIMAL NOT NULL DEFAULT 20000,
    "platformFee" DECIMAL NOT NULL DEFAULT 0.10,
    "resolutionDate" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Market" ("createdAt", "description", "id", "maxPool", "noPool", "outcome", "platformFee", "playerName", "question", "resolutionDate", "resolvedAt", "status", "updatedAt", "yesPool") SELECT "createdAt", "description", "id", "maxPool", "noPool", "outcome", "platformFee", "playerName", "question", "resolutionDate", "resolvedAt", "status", "updatedAt", "yesPool" FROM "Market";
DROP TABLE "Market";
ALTER TABLE "new_Market" RENAME TO "Market";
CREATE INDEX "Market_status_idx" ON "Market"("status");
CREATE INDEX "Market_resolutionDate_idx" ON "Market"("resolutionDate");
CREATE TABLE "new_MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "askPrice" DECIMAL NOT NULL,
    "suggestedPrice" DECIMAL NOT NULL,
    "platformFee" DECIMAL NOT NULL DEFAULT 0.025,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "listedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" DATETIME,
    "cancelledAt" DATETIME,
    "shares" REAL NOT NULL DEFAULT 0,
    "askPricePerShare" REAL NOT NULL DEFAULT 0,
    "fairValueAtListing" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "MarketplaceListing_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MarketplaceListing" ("askPrice", "buyerId", "cancelledAt", "id", "listedAt", "marketId", "platformFee", "positionId", "sellerId", "soldAt", "status", "suggestedPrice") SELECT "askPrice", "buyerId", "cancelledAt", "id", "listedAt", "marketId", "platformFee", "positionId", "sellerId", "soldAt", "status", "suggestedPrice" FROM "MarketplaceListing";
DROP TABLE "MarketplaceListing";
ALTER TABLE "new_MarketplaceListing" RENAME TO "MarketplaceListing";
CREATE UNIQUE INDEX "MarketplaceListing_positionId_key" ON "MarketplaceListing"("positionId");
CREATE INDEX "MarketplaceListing_marketId_idx" ON "MarketplaceListing"("marketId");
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");
CREATE INDEX "MarketplaceListing_sellerId_idx" ON "MarketplaceListing"("sellerId");
CREATE TABLE "new_Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "originalOwnerId" TEXT NOT NULL,
    "currentOwnerId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payout" DECIMAL,
    "isForSale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "shares" REAL NOT NULL DEFAULT 0,
    "avgCostPerShare" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "initialProbability" DECIMAL NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL NOT NULL DEFAULT 0,
    "lastTransferredAt" DATETIME,
    CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_originalOwnerId_fkey" FOREIGN KEY ("originalOwnerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Position_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Position" ("amount", "createdAt", "currentOwnerId", "id", "initialProbability", "isForSale", "lastTransferredAt", "marketId", "originalOwnerId", "payout", "purchasePrice", "shares", "side", "status", "updatedAt") SELECT "amount", "createdAt", "currentOwnerId", "id", "initialProbability", "isForSale", "lastTransferredAt", "marketId", "originalOwnerId", "payout", "purchasePrice", "shares", "side", "status", "updatedAt" FROM "Position";
DROP TABLE "Position";
ALTER TABLE "new_Position" RENAME TO "Position";
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");
CREATE INDEX "Position_currentOwnerId_idx" ON "Position"("currentOwnerId");
CREATE INDEX "Position_status_idx" ON "Position"("status");
CREATE INDEX "Position_isForSale_idx" ON "Position"("isForSale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LmsrSnapshot_marketId_idx" ON "LmsrSnapshot"("marketId");

-- CreateIndex
CREATE INDEX "LmsrSnapshot_createdAt_idx" ON "LmsrSnapshot"("createdAt");
