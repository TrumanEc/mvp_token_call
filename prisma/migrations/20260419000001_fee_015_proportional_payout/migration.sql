-- Migration: Lower LMSR platform fee from 10% to 1.5%
-- Settlement model: Option B (proportional payout) requires lower fees
-- as WIN revenue = fees only (no settlement risk)

-- Update default for new markets
ALTER TABLE "Market" ALTER COLUMN "platformFee" SET DEFAULT 0.015;

-- Update all existing DRAFT and ACTIVE markets to the new fee rate
-- (RESOLVED/VOIDED markets keep historical values for accurate reporting)
UPDATE "Market"
SET "platformFee" = 0.015
WHERE "status" IN ('DRAFT', 'ACTIVE') AND "platformFee" = 0.10;
