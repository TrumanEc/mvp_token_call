-- CreateTable
CREATE TABLE "MarketPriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "yesOdds" DECIMAL NOT NULL,
    "noOdds" DECIMAL NOT NULL,
    "totalPool" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketPriceHistory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerName" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outcome" TEXT,
    "yesPool" DECIMAL NOT NULL DEFAULT 0,
    "noPool" DECIMAL NOT NULL DEFAULT 0,
    "maxPool" DECIMAL NOT NULL DEFAULT 20000,
    "platformFee" DECIMAL NOT NULL DEFAULT 0.10,
    "resolutionDate" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Market" ("createdAt", "description", "id", "noPool", "outcome", "platformFee", "playerName", "question", "resolutionDate", "resolvedAt", "status", "updatedAt", "yesPool") SELECT "createdAt", "description", "id", "noPool", "outcome", "platformFee", "playerName", "question", "resolutionDate", "resolvedAt", "status", "updatedAt", "yesPool" FROM "Market";
DROP TABLE "Market";
ALTER TABLE "new_Market" RENAME TO "Market";
CREATE INDEX "Market_status_idx" ON "Market"("status");
CREATE INDEX "Market_resolutionDate_idx" ON "Market"("resolutionDate");
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
    "initialProbability" DECIMAL NOT NULL DEFAULT 0,
    "lastTransferredAt" DATETIME,
    CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_originalOwnerId_fkey" FOREIGN KEY ("originalOwnerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Position_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Position" ("amount", "createdAt", "currentOwnerId", "id", "isForSale", "lastTransferredAt", "marketId", "originalOwnerId", "payout", "side", "status", "updatedAt") SELECT "amount", "createdAt", "currentOwnerId", "id", "isForSale", "lastTransferredAt", "marketId", "originalOwnerId", "payout", "side", "status", "updatedAt" FROM "Position";
DROP TABLE "Position";
ALTER TABLE "new_Position" RENAME TO "Position";
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");
CREATE INDEX "Position_currentOwnerId_idx" ON "Position"("currentOwnerId");
CREATE INDEX "Position_status_idx" ON "Position"("status");
CREATE INDEX "Position_isForSale_idx" ON "Position"("isForSale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MarketPriceHistory_marketId_idx" ON "MarketPriceHistory"("marketId");

-- CreateIndex
CREATE INDEX "MarketPriceHistory_createdAt_idx" ON "MarketPriceHistory"("createdAt");
