-- Add primary market pause fields to Market table
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "primaryMarketPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "primaryPauseScheduledAt" TIMESTAMP(3);
