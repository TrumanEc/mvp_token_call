import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

function createId() {
  return "sim" + crypto.randomBytes(12).toString("hex");
}

const prisma = new PrismaClient();

const MARKET_ID = "cmpfez8uj002ivh6fdq7kdg6m";
const YES_ID = "cmpfez8uj002jvh6fb541dlqw";
const NO_ID = "cmpfez8uj002kvh6fppiw6emc";

const USERS = [
  "cmpefl4if0001707tf90pmhf2", // juan_futbol
  "cmpefl5720002707tvxqwnn7z", // maria_sports
  "cmpefl5uh0003707t4v7zpq22", // pedro_trader
  "cmpefl6jc0004707t3hwehiuh", // carlos_bet
  "cmpefl77w0005707t1to7zc4f", // Tecnico
];

// LMSR price: p_yes = exp(qYes/b) / (exp(qYes/b) + exp(qNo/b))
function lmsrPrices(qYes: number, qNo: number, b: number) {
  const eY = Math.exp(qYes / b);
  const eN = Math.exp(qNo / b);
  const sum = eY + eN;
  return { pYes: eY / sum, pNo: eN / sum };
}

// LMSR cost to buy deltaShares of an outcome
function lmsrCost(
  qYes: number,
  qNo: number,
  b: number,
  side: "YES" | "NO",
  delta: number
) {
  const before = b * Math.log(Math.exp(qYes / b) + Math.exp(qNo / b));
  const newQYes = side === "YES" ? qYes + delta : qYes;
  const newQNo = side === "NO" ? qNo + delta : qNo;
  const after = b * Math.log(Math.exp(newQYes / b) + Math.exp(newQNo / b));
  return after - before;
}

async function main() {
  console.log("Resetting market and generating realistic volume...\n");

  // 1. Delete existing snapshots, positions, transactions for this market
  await prisma.$executeRawUnsafe(
    `DELETE FROM "LmsrSnapshot" WHERE "marketId" = $1`,
    MARKET_ID
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Transaction" WHERE "reference" = $1`,
    MARKET_ID
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Position" WHERE "marketId" = $1`,
    MARKET_ID
  );

  // 2. Reset market to ACTIVE, created 5 days ago
  const createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET status = 'ACTIVE', "winningOutcomeId" = NULL, "resolvedAt" = NULL, "createdAt" = $1, "totalPool" = 0 WHERE id = $2`,
    createdAt,
    MARKET_ID
  );

  // Reset outcome pools
  await prisma.marketOutcome.update({
    where: { id: YES_ID },
    data: { qOutstanding: 0, pool: 0 },
  });
  await prisma.marketOutcome.update({
    where: { id: NO_ID },
    data: { qOutstanding: 0, pool: 0 },
  });

  // 3. Generate a realistic price trajectory
  // Start at 50%, gradually trend to ~68% YES with natural volatility
  const b = 1000; // effective b for LS-LMSR with these params
  let qYes = 0;
  let qNo = 0;

  // Generate ~70 trades over 5 days
  const NUM_TRADES = 70;
  const startTime = createdAt.getTime();
  const now = Date.now();
  const timeSpan = now - startTime;

  // Create time distribution: more trades recently, fewer early on
  const times: number[] = [];
  for (let i = 0; i < NUM_TRADES; i++) {
    // Use a power curve for more recent clustering
    const t = Math.pow((i + 1) / NUM_TRADES, 0.7);
    // Add some randomness
    const jitter = (Math.random() - 0.5) * (timeSpan / NUM_TRADES) * 0.3;
    times.push(startTime + t * timeSpan + jitter);
  }
  times.sort((a, b) => a - b);

  // Target price trajectory: starts at 50%, dips to ~42%, recovers to 55%,
  // then trends up to ~68% with oscillations
  function targetPriceAtTime(t: number): number {
    const progress = (t - startTime) / timeSpan; // 0 to 1

    // Base trend: sigmoid-like rise
    const trend = 0.50 + 0.20 / (1 + Math.exp(-8 * (progress - 0.5)));

    // Add waves for realism
    const wave1 = 0.06 * Math.sin(progress * Math.PI * 4);
    const wave2 = 0.03 * Math.sin(progress * Math.PI * 7 + 1.5);
    const wave3 = 0.02 * Math.sin(progress * Math.PI * 12 + 0.8);

    // Initial dip
    const dip = progress < 0.15 ? -0.08 * Math.sin(progress / 0.15 * Math.PI) : 0;

    return Math.max(0.25, Math.min(0.85, trend + wave1 + wave2 + wave3 + dip));
  }

  const snapshots: any[] = [];
  const positions: any[] = [];
  const transactions: any[] = [];
  let totalPool = 0;

  for (let i = 0; i < NUM_TRADES; i++) {
    const tradeTime = new Date(times[i]);
    const targetP = targetPriceAtTime(times[i]);
    const currentPrices = lmsrPrices(qYes, qNo, b);
    const currentPYes = currentPrices.pYes;

    // Decide side and amount to push price toward target
    const diff = targetP - currentPYes;
    const side: "YES" | "NO" = diff > 0 ? "YES" : "NO";

    // Amount: proportional to how far we are from target, with randomness
    const baseDelta = Math.abs(diff) * b * (1.5 + Math.random());
    const delta = Math.max(5, Math.min(120, baseDelta));

    // Add some noise: occasionally someone bets against the trend
    const contrarian = Math.random() < 0.15;
    const finalSide = contrarian ? (side === "YES" ? "NO" : "YES") : side;
    const finalDelta = contrarian ? delta * 0.4 : delta;

    const cost = lmsrCost(qYes, qNo, b, finalSide, finalDelta);

    const qYesBefore = qYes;
    const qNoBefore = qNo;
    const pBefore = lmsrPrices(qYes, qNo, b);

    if (finalSide === "YES") {
      qYes += finalDelta;
    } else {
      qNo += finalDelta;
    }

    const pAfter = lmsrPrices(qYes, qNo, b);
    totalPool += Math.abs(cost);

    const userId = USERS[Math.floor(Math.random() * USERS.length)];
    const snapId = createId();
    const posId = createId();
    const txId = createId();

    snapshots.push({
      id: snapId,
      marketId: MARKET_ID,
      outcomeId: finalSide === "YES" ? YES_ID : NO_ID,
      qBefore: { [YES_ID]: qYesBefore, [NO_ID]: qNoBefore },
      pBefore: { [YES_ID]: pBefore.pYes, [NO_ID]: pBefore.pNo },
      side: finalSide,
      deltaShares: finalDelta,
      cost: Math.abs(cost),
      qAfter: { [YES_ID]: qYes, [NO_ID]: qNo },
      pAfter: { [YES_ID]: pAfter.pYes, [NO_ID]: pAfter.pNo },
      triggerType: "ROUTED_BUY",
      userId,
      createdAt: tradeTime,
    });

    positions.push({
      id: posId,
      marketId: MARKET_ID,
      outcomeId: finalSide === "YES" ? YES_ID : NO_ID,
      originalOwnerId: userId,
      currentOwnerId: userId,
      side: finalSide,
      amount: Math.abs(cost),
      status: "ACTIVE",
      shares: finalDelta,
      avgCostPerShare: Math.abs(cost) / finalDelta,
      totalCost: Math.abs(cost),
      initialProbability: pBefore.pYes,
      purchasePrice: Math.abs(cost) / finalDelta,
      createdAt: tradeTime,
      updatedAt: tradeTime,
    });

    transactions.push({
      id: txId,
      userId,
      type: "BET_PLACED",
      amount: -Math.abs(cost),
      balanceBefore: 1000,
      balanceAfter: 1000 - Math.abs(cost),
      reference: MARKET_ID,
      description: `Market Buy: ${finalDelta.toFixed(2)} ${finalSide} for $${Math.abs(cost).toFixed(2)}`,
      createdAt: tradeTime,
    });
  }

  // 4. Insert all data
  console.log(`Inserting ${snapshots.length} snapshots...`);
  for (const s of snapshots) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "LmsrSnapshot" (id, "marketId", "outcomeId", "qBefore", "pBefore", side, "deltaShares", cost, "qAfter", "pAfter", "triggerType", "userId", "createdAt")
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)`,
      s.id, s.marketId, s.outcomeId,
      JSON.stringify(s.qBefore), JSON.stringify(s.pBefore),
      s.side, s.deltaShares, s.cost,
      JSON.stringify(s.qAfter), JSON.stringify(s.pAfter),
      s.triggerType, s.userId, s.createdAt
    );
  }

  console.log(`Inserting ${positions.length} positions...`);
  for (const p of positions) {
    await prisma.position.create({ data: p });
  }

  console.log(`Inserting ${transactions.length} transactions...`);
  for (const t of transactions) {
    await prisma.transaction.create({ data: t });
  }

  // 5. Update market state with final values
  const finalP = lmsrPrices(qYes, qNo, b);
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET "totalPool" = $1 WHERE id = $2`,
    totalPool,
    MARKET_ID
  );

  // Update outcome pools
  const yesPool = positions
    .filter((p) => p.side === "YES")
    .reduce((s, p) => s + p.amount, 0);
  const noPool = positions
    .filter((p) => p.side === "NO")
    .reduce((s, p) => s + p.amount, 0);

  await prisma.marketOutcome.update({
    where: { id: YES_ID },
    data: { qOutstanding: qYes, pool: yesPool },
  });
  await prisma.marketOutcome.update({
    where: { id: NO_ID },
    data: { qOutstanding: qNo, pool: noPool },
  });

  console.log("\n=== Summary ===");
  console.log(`Trades generated: ${NUM_TRADES}`);
  console.log(`Total pool: $${totalPool.toFixed(2)}`);
  console.log(`Final qYes: ${qYes.toFixed(2)}, qNo: ${qNo.toFixed(2)}`);
  console.log(`Final price YES: ${(finalP.pYes * 100).toFixed(1)}%`);
  console.log(`Final price NO: ${(finalP.pNo * 100).toFixed(1)}%`);
  console.log(`Time span: ${createdAt.toISOString()} → ${new Date().toISOString()}`);
  console.log("\nDone! Market is now ACTIVE with realistic volume.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
