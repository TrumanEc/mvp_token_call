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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
