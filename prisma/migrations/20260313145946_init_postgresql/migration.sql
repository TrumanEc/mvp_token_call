-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 1000.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "playerName" TEXT,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outcome" TEXT,
    "b" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "qYes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qNo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yesPool" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "noPool" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxPool" DECIMAL(65,30),
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0.10,
    "resolutionDate" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "maxBetAmount" DOUBLE PRECISION,
    "maxPriceImpact" DOUBLE PRECISION,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "originalOwnerId" TEXT NOT NULL,
    "currentOwnerId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payout" DECIMAL(65,30),
    "isForSale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCostPerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initialProbability" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastTransferredAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "askPrice" DECIMAL(65,30) NOT NULL,
    "suggestedPrice" DECIMAL(65,30) NOT NULL,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0.025,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "shares" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "askPricePerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fairValueAtListing" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "positionId" TEXT,
    "pricePerShare" DOUBLE PRECISION NOT NULL,
    "initialShares" DOUBLE PRECISION NOT NULL,
    "remainingShares" DOUBLE PRECISION NOT NULL,
    "totalLocked" DECIMAL(65,30),
    "simulatedPriceAtCreation" DOUBLE PRECISION,
    "executionLog" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRouterAuditLog" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestAmount" DECIMAL(65,30) NOT NULL,
    "side" TEXT NOT NULL,
    "executionType" TEXT NOT NULL,
    "lmsrAllocated" DECIMAL(65,30) NOT NULL,
    "lmsrSharesGenerated" DOUBLE PRECISION NOT NULL,
    "obAllocated" DECIMAL(65,30) NOT NULL,
    "obSharesBought" DOUBLE PRECISION NOT NULL,
    "lmsrAveragePrice" DOUBLE PRECISION NOT NULL,
    "obAveragePrice" DOUBLE PRECISION NOT NULL,
    "finalAveragePricePaid" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketRouterAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsrSnapshot" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "qYesBefore" DOUBLE PRECISION NOT NULL,
    "qNoBefore" DOUBLE PRECISION NOT NULL,
    "pYesBefore" DOUBLE PRECISION NOT NULL,
    "side" TEXT NOT NULL,
    "deltaShares" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "qYesAfter" DOUBLE PRECISION NOT NULL,
    "qNoAfter" DOUBLE PRECISION NOT NULL,
    "pYesAfter" DOUBLE PRECISION NOT NULL,
    "triggerType" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsrSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionTransfer" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "listingId" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceBefore" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketHistory" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "yesOdds" DECIMAL(65,30) NOT NULL,
    "noOdds" DECIMAL(65,30) NOT NULL,
    "totalPool" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultMaxBet" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "defaultMaxImpact" DOUBLE PRECISION NOT NULL DEFAULT 5.0,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "Market_status_idx" ON "Market"("status");

-- CreateIndex
CREATE INDEX "Market_resolutionDate_idx" ON "Market"("resolutionDate");

-- CreateIndex
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");

-- CreateIndex
CREATE INDEX "Position_currentOwnerId_idx" ON "Position"("currentOwnerId");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "Position_isForSale_idx" ON "Position"("isForSale");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_positionId_key" ON "MarketplaceListing"("positionId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_marketId_idx" ON "MarketplaceListing"("marketId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerId_idx" ON "MarketplaceListing"("sellerId");

-- CreateIndex
CREATE INDEX "Order_marketId_status_idx" ON "Order"("marketId", "status");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "MarketRouterAuditLog_marketId_idx" ON "MarketRouterAuditLog"("marketId");

-- CreateIndex
CREATE INDEX "LmsrSnapshot_marketId_idx" ON "LmsrSnapshot"("marketId");

-- CreateIndex
CREATE INDEX "LmsrSnapshot_createdAt_idx" ON "LmsrSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "PositionTransfer_positionId_idx" ON "PositionTransfer"("positionId");

-- CreateIndex
CREATE INDEX "PositionTransfer_fromUserId_idx" ON "PositionTransfer"("fromUserId");

-- CreateIndex
CREATE INDEX "PositionTransfer_toUserId_idx" ON "PositionTransfer"("toUserId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "MarketHistory_marketId_idx" ON "MarketHistory"("marketId");

-- CreateIndex
CREATE INDEX "MarketHistory_createdAt_idx" ON "MarketHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_originalOwnerId_fkey" FOREIGN KEY ("originalOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRouterAuditLog" ADD CONSTRAINT "MarketRouterAuditLog_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRouterAuditLog" ADD CONSTRAINT "MarketRouterAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsrSnapshot" ADD CONSTRAINT "LmsrSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionTransfer" ADD CONSTRAINT "PositionTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionTransfer" ADD CONSTRAINT "PositionTransfer_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionTransfer" ADD CONSTRAINT "PositionTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketHistory" ADD CONSTRAINT "MarketHistory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
