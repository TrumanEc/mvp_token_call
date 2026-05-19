-- LS-LMSR: dynamic b parameters
-- alpha is the slope of b(Q) = max(bMin, alpha·Q)
-- bMin is the floor preventing singularity at Q=0
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "alpha" DOUBLE PRECISION;
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "bMin" DOUBLE PRECISION;
