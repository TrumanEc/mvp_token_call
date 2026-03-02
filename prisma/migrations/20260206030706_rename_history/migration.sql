/*
  Warnings:

  - You are about to drop the `MarketPriceHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MarketPriceHistory";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MarketHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "yesOdds" DECIMAL NOT NULL,
    "noOdds" DECIMAL NOT NULL,
    "totalPool" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketHistory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MarketHistory_marketId_idx" ON "MarketHistory"("marketId");

-- CreateIndex
CREATE INDEX "MarketHistory_createdAt_idx" ON "MarketHistory"("createdAt");
