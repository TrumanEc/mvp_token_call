import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

function createId() {
  return "sim" + crypto.randomBytes(12).toString("hex");
}

const prisma = new PrismaClient();

const MARKET_ID = "cmpfivm0m004xvh6fzi4t4vdl";

const OUTCOMES = [
  { id: "cmpfivm0m004yvh6fniznncnv", name: "San Antonio Spurs" },
  { id: "cmpfivm0m004zvh6fwjl3bcs1", name: "Oklahoma City Thunder" },
];

const USERS = [
  "cmpefl4if0001707tf90pmhf2", // juan_futbol
  "cmpefl5720002707tvxqwnn7z", // maria_sports
  "cmpefl5uh0003707t4v7zpq22", // pedro_trader
  "cmpefl6jc0004707t3hwehiuh", // carlos_bet
  "cmpefl77w0005707t1to7zc4f", // Tecnico
];

// N-outcome LMSR: p_i = exp(q_i / b) / sum(exp(q_j / b))
function lmsrPricesN(qVec: number[], b: number): number[] {
  const maxQ = Math.max(...qVec);
  const exps = qVec.map((q) => Math.exp((q - maxQ) / b));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / sum);
}

// Cost to buy delta shares of outcome idx
function lmsrCostN(qVec: number[], b: number, idx: number, delta: number): number {
  const maxQ1 = Math.max(...qVec);
  const before = b * Math.log(qVec.reduce((s, q) => s + Math.exp((q - maxQ1) / b), 0)) + maxQ1;

  const newQ = [...qVec];
  newQ[idx] += delta;

  const maxQ2 = Math.max(...newQ);
  const after = b * Math.log(newQ.reduce((s, q) => s + Math.exp((q - maxQ2) / b), 0)) + maxQ2;

  return after - before;
}

async function main() {
  console.log("Generating realistic multi-outcome volume for Game 3: SA vs OKC...\n");

  // 1. Clean existing data
  await prisma.$executeRawUnsafe(`DELETE FROM "LmsrSnapshot" WHERE "marketId" = $1`, MARKET_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE "reference" = $1`, MARKET_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "Position" WHERE "marketId" = $1`, MARKET_ID);

  // 2. Reset market — created 3 days ago
  const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET status = 'ACTIVE', "winningOutcomeId" = NULL, "resolvedAt" = NULL, "createdAt" = $1, "totalPool" = 0 WHERE id = $2`,
    createdAt,
    MARKET_ID
  );

  for (const o of OUTCOMES) {
    await prisma.marketOutcome.update({
      where: { id: o.id },
      data: { qOutstanding: 0, pool: 0 },
    });
  }

  // 3. Simulate trades
  const b = 1000;
  const qVec = OUTCOMES.map(() => 0); // [SA, OKC]
  const NUM_TRADES = 80;
  const startTime = createdAt.getTime();
  const now = Date.now();
  const timeSpan = now - startTime;

  // Time distribution: clusters of activity (news events, game-day buzz)
  const times: number[] = [];
  for (let i = 0; i < NUM_TRADES; i++) {
    const t = Math.pow((i + 1) / NUM_TRADES, 0.65);
    const jitter = (Math.random() - 0.5) * (timeSpan / NUM_TRADES) * 0.25;
    times.push(startTime + t * timeSpan + jitter);
  }
  times.sort((a, c) => a - c);

  // Narrative: OKC starts slight favorite (~55%), SA gets a momentum surge mid-way
  // pushing to ~52% SA, then OKC recovers strongly to ~62%
  // Creates an exciting chart with lead changes
  function targetProbsAtTime(t: number): number[] {
    const progress = (t - startTime) / timeSpan; // 0→1

    // OKC probability trajectory
    let okc: number;

    if (progress < 0.15) {
      // Early: OKC slight favorite, market forming
      okc = 0.54 + 0.03 * Math.sin(progress * Math.PI * 6);
    } else if (progress < 0.35) {
      // SA momentum surge — lead change!
      const localP = (progress - 0.15) / 0.2;
      okc = 0.54 - 0.12 * Math.sin(localP * Math.PI);
    } else if (progress < 0.55) {
      // Uncertain period — tight race
      const localP = (progress - 0.35) / 0.2;
      okc = 0.48 + 0.06 * Math.sin(localP * Math.PI * 3);
    } else if (progress < 0.75) {
      // OKC surges back
      const localP = (progress - 0.55) / 0.2;
      okc = 0.50 + 0.14 * localP;
    } else {
      // Final stretch: OKC strong favorite with minor wobbles
      const localP = (progress - 0.75) / 0.25;
      okc = 0.64 + 0.04 * localP + 0.02 * Math.sin(localP * Math.PI * 4);
    }

    // Add noise
    okc += (Math.random() - 0.5) * 0.03;
    okc = Math.max(0.20, Math.min(0.80, okc));

    return [1 - okc, okc]; // [SA, OKC]
  }

  const snapshots: any[] = [];
  const positions: any[] = [];
  const transactions: any[] = [];
  let totalPool = 0;

  for (let i = 0; i < NUM_TRADES; i++) {
    const tradeTime = new Date(times[i]);
    const targetProbs = targetProbsAtTime(times[i]);
    const currentPrices = lmsrPricesN(qVec, b);

    // Find which outcome to buy to move toward target
    let bestIdx = 0;
    let bestDiff = -Infinity;
    for (let j = 0; j < OUTCOMES.length; j++) {
      const diff = targetProbs[j] - currentPrices[j];
      if (diff > bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }

    // Contrarian trades ~12% of the time
    const contrarian = Math.random() < 0.12;
    const tradeIdx = contrarian ? (1 - bestIdx) : bestIdx;

    const baseDelta = Math.abs(targetProbs[tradeIdx] - currentPrices[tradeIdx]) * b * (1.5 + Math.random());
    const delta = Math.max(5, Math.min(100, contrarian ? baseDelta * 0.35 : baseDelta));

    // Record before state
    const qBefore: Record<string, number> = {};
    const pBefore: Record<string, number> = {};
    OUTCOMES.forEach((o, idx) => {
      qBefore[o.id] = qVec[idx];
      pBefore[o.id] = currentPrices[idx];
    });

    const cost = lmsrCostN(qVec, b, tradeIdx, delta);
    qVec[tradeIdx] += delta;

    const pAfterArr = lmsrPricesN(qVec, b);
    const qAfter: Record<string, number> = {};
    const pAfter: Record<string, number> = {};
    OUTCOMES.forEach((o, idx) => {
      qAfter[o.id] = qVec[idx];
      pAfter[o.id] = pAfterArr[idx];
    });

    totalPool += Math.abs(cost);
    const userId = USERS[Math.floor(Math.random() * USERS.length)];
    const outcomeId = OUTCOMES[tradeIdx].id;
    const outcomeName = OUTCOMES[tradeIdx].name;

    snapshots.push({
      id: createId(),
      marketId: MARKET_ID,
      outcomeId,
      qBefore,
      pBefore,
      side: outcomeName,
      deltaShares: delta,
      cost: Math.abs(cost),
      qAfter,
      pAfter,
      triggerType: "ROUTED_BUY",
      userId,
      createdAt: tradeTime,
    });

    positions.push({
      id: createId(),
      marketId: MARKET_ID,
      outcomeId,
      originalOwnerId: userId,
      currentOwnerId: userId,
      side: outcomeName,
      amount: Math.abs(cost),
      status: "ACTIVE",
      shares: delta,
      avgCostPerShare: Math.abs(cost) / delta,
      totalCost: Math.abs(cost),
      initialProbability: pBefore[outcomeId],
      purchasePrice: Math.abs(cost) / delta,
      createdAt: tradeTime,
      updatedAt: tradeTime,
    });

    transactions.push({
      id: createId(),
      userId,
      type: "BET_PLACED",
      amount: -Math.abs(cost),
      balanceBefore: 1000,
      balanceAfter: 1000 - Math.abs(cost),
      reference: MARKET_ID,
      description: `Market Buy: ${delta.toFixed(2)} ${outcomeName} for $${Math.abs(cost).toFixed(2)}`,
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

  // 5. Update final market/outcome state
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET "totalPool" = $1 WHERE id = $2`,
    totalPool,
    MARKET_ID
  );

  const finalPrices = lmsrPricesN(qVec, b);
  for (let idx = 0; idx < OUTCOMES.length; idx++) {
    const pool = positions
      .filter((p) => p.outcomeId === OUTCOMES[idx].id)
      .reduce((s, p) => s + p.amount, 0);
    await prisma.marketOutcome.update({
      where: { id: OUTCOMES[idx].id },
      data: { qOutstanding: qVec[idx], pool },
    });
  }

  console.log("\n=== Summary ===");
  console.log(`Trades generated: ${NUM_TRADES}`);
  console.log(`Total pool: $${totalPool.toFixed(2)}`);
  OUTCOMES.forEach((o, i) => {
    console.log(`  ${o.name}: q=${qVec[i].toFixed(2)}, price=${(finalPrices[i] * 100).toFixed(1)}%`);
  });
  console.log(`Time span: ${createdAt.toISOString()} → ${new Date().toISOString()}`);
  console.log("\nDone!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
