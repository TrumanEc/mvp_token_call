import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

function createId() {
  return "sim" + crypto.randomBytes(12).toString("hex");
}

const prisma = new PrismaClient();

const USERS = [
  "cmpefl4if0001707tf90pmhf2",
  "cmpefl5720002707tvxqwnn7z",
  "cmpefl5uh0003707t4v7zpq22",
  "cmpefl6jc0004707t3hwehiuh",
  "cmpefl77w0005707t1to7zc4f",
];

// ── LMSR helpers ────────────────────────────────────────────────────────────

function lmsrPricesN(qVec: number[], b: number): number[] {
  const maxQ = Math.max(...qVec);
  const exps = qVec.map((q) => Math.exp((q - maxQ) / b));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / sum);
}

function lmsrCostN(qVec: number[], b: number, idx: number, delta: number): number {
  const maxQ1 = Math.max(...qVec);
  const before = b * Math.log(qVec.reduce((s, q) => s + Math.exp((q - maxQ1) / b), 0)) + maxQ1;
  const newQ = [...qVec];
  newQ[idx] += delta;
  const maxQ2 = Math.max(...newQ);
  const after = b * Math.log(newQ.reduce((s, q) => s + Math.exp((q - maxQ2) / b), 0)) + maxQ2;
  return after - before;
}

// ── Market definitions ───────────────────────────────────────────────────────

interface OutcomeDef { id: string; name: string }

interface MarketDef {
  id: string;
  question: string;
  outcomes: OutcomeDef[];
  daysBack: number;       // how many days ago market was created
  // Final target prob for each outcome (determines chart trend)
  finalProbs: number[];
  // Narrative shape: 'rise', 'fall', 'volatile', 'steady', 'comeback'
  shape: "rise" | "fall" | "volatile" | "steady" | "comeback";
}

const MARKETS: MarketDef[] = [
  // ── F1 ──────────────────────────────────────────────────────────────────
  {
    id: "cmpefldep000h707tel0oopkz",
    question: "¿Hamilton 3+ carreras Ferrari 2026?",
    outcomes: [
      { id: "cmpefldep000i707tadk9qu5r", name: "YES" },
      { id: "cmpefldep000j707tlqmeldg8", name: "NO" },
    ],
    daysBack: 7, finalProbs: [0.61, 0.39], shape: "rise",
  },
  {
    id: "cmpekoxsk0008vh6fg8z3h5ex",
    question: "¿Colapinto puntos GP Canadá 2026?",
    outcomes: [
      { id: "cmpekoxsk0009vh6feb88n8zq", name: "YES" },
      { id: "cmpekoxsk000avh6ffm7slrpe", name: "NO" },
    ],
    daysBack: 5, finalProbs: [0.55, 0.45], shape: "volatile",
  },
  // ── Copa del Mundo ───────────────────────────────────────────────────────
  {
    id: "cmpfilaym003kvh6f32y5drth",
    question: "Argentina Campeón del Mundo 2026",
    outcomes: [
      { id: "cmpfilaym003lvh6fza35e573", name: "YES" },
      { id: "cmpfilaym003mvh6f7sd809dh", name: "NO" },
    ],
    daysBack: 4, finalProbs: [0.64, 0.36], shape: "rise",
  },
  {
    id: "cmpfmnvtb001jy3c4o8w32oc9",
    question: "¿Argentina o Brasil Campeón 2026?",
    outcomes: [
      { id: "cmpfmnvtb001ky3c4oytz8v3h", name: "YES" },
      { id: "cmpfmnvtb001ly3c4s99ngtz9", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.67, 0.33], shape: "rise",
  },
  {
    id: "cmpfmtitp001ny3c46zu7lkp5",
    question: "Lamine Yamal MVP Copa del Mundo 2026",
    outcomes: [
      { id: "cmpfmtitp001oy3c43e5es5vs", name: "YES" },
      { id: "cmpfmtitp001py3c4gg0alams", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.57, 0.43], shape: "volatile",
  },
  {
    id: "cmpfmv89a001ry3c45y4m42k2",
    question: "¿Mbappé Campeón del Mundo 2026?",
    outcomes: [
      { id: "cmpfmv89a001sy3c4bxdwm99q", name: "YES" },
      { id: "cmpfmv89a001ty3c4s56tm9av", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.38, 0.62], shape: "fall",
  },
  {
    id: "cmpfn85ab0020y3c4a0gc4hw1",
    question: "Messi gol debut Copa del Mundo 2026",
    outcomes: [
      { id: "cmpfn85ab0021y3c4znuxbr5k", name: "YES" },
      { id: "cmpfn85ab0022y3c4djjaa7xu", name: "NO" },
    ],
    daysBack: 1, finalProbs: [0.73, 0.27], shape: "rise",
  },
  // ── Copa Libertadores / Sudamericana ────────────────────────────────────
  {
    id: "cmpfm7uy60013y3c40ucq0w1n",
    question: "¿Boca Jrs octavos Copa Libertadores 2026?",
    outcomes: [
      { id: "cmpfm7uy60014y3c4hxwlipjo", name: "YES" },
      { id: "cmpfm7uy60015y3c4m9evqg3i", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.53, 0.47], shape: "volatile",
  },
  {
    id: "cmpfmgzim0017y3c4zvcphhp8",
    question: "Equipo Argentino Campeón Libertadores 2026",
    outcomes: [
      { id: "cmpfmgzim0018y3c46d1g0oxf", name: "YES" },
      { id: "cmpfmgzim0019y3c45j0b849z", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.62, 0.38], shape: "rise",
  },
  {
    id: "cmpfmklfv001by3c4jd1hnu1o",
    question: "Equipo Argentino Campeón Sudamericana 2026",
    outcomes: [
      { id: "cmpfmklfv001cy3c4rj9h2czd", name: "YES" },
      { id: "cmpfmklfv001dy3c48e5wmf7b", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.59, 0.41], shape: "steady",
  },
  {
    id: "cmpfmlov7001fy3c4udy8nyge",
    question: "River Plate Campeón Sudamericana 2026",
    outcomes: [
      { id: "cmpfmlov8001gy3c4x11amggx", name: "YES" },
      { id: "cmpfmlov8001hy3c4riythc5n", name: "NO" },
    ],
    daysBack: 2, finalProbs: [0.56, 0.44], shape: "volatile",
  },
  // ── Liga Profesional ─────────────────────────────────────────────────────
  {
    id: "cmpfifcpw0039vh6facnua07x",
    question: "Liga Prof: River vs Belgrano",
    outcomes: [
      { id: "cmpfifcpw003avh6fmsw7xlei", name: "River Plate" },
      { id: "cmpfifcpw003bvh6fcq58gkvl", name: "Belgrano" },
    ],
    daysBack: 4, finalProbs: [0.72, 0.28], shape: "steady",
  },
  // ── NBA ──────────────────────────────────────────────────────────────────
  {
    id: "cmpfj1c3b0054vh6fy2ecf63b",
    question: "Game 2: New York vs Cleveland",
    outcomes: [
      { id: "cmpfj1c3b0055vh6fqvctmcts", name: "New York Knicks" },
      { id: "cmpfj1c3b0056vh6fz4kvl8sd", name: "Cleveland Cavaliers" },
    ],
    daysBack: 3, finalProbs: [0.44, 0.56], shape: "comeback",
  },
  // ── Tenis ────────────────────────────────────────────────────────────────
  {
    id: "cmpfl8nh7000ny3c4r1jp4vgk",
    question: "Etcheverry vs Borges",
    outcomes: [
      { id: "cmpfl8nh7000oy3c49n0psoq9", name: "T. Etcheverry" },
      { id: "cmpfl8nh7000py3c46t3zn1fk", name: "N. Borges" },
    ],
    daysBack: 1, finalProbs: [0.59, 0.41], shape: "volatile",
  },
  {
    id: "cmpfluoji000ry3c4sgcp9jn8",
    question: "Davidovich vs Džumhur",
    outcomes: [
      { id: "cmpfluoji000sy3c47vyostlf", name: "A. Davidovich" },
      { id: "cmpfluoji000ty3c4x5koj1dc", name: "D. Džumhur" },
    ],
    daysBack: 1, finalProbs: [0.66, 0.34], shape: "rise",
  },
  {
    id: "cmpfm1lov000vy3c47nnts9kl",
    question: "Fritz vs Basavareddy",
    outcomes: [
      { id: "cmpfm1lov000wy3c478pynj4a", name: "T. Fritz" },
      { id: "cmpfm1lov000xy3c4w6gkzqdg", name: "N. Basavareddy" },
    ],
    daysBack: 1, finalProbs: [0.76, 0.24], shape: "steady",
  },
  {
    id: "cmpfm3pk9000zy3c48epd86y6",
    question: "Wawrinka vs Fils",
    outcomes: [
      { id: "cmpfm3pk90010y3c42rvpthv0", name: "S. Wawrinka" },
      { id: "cmpfm3pk90011y3c4gtd299uf", name: "A. Fils" },
    ],
    daysBack: 1, finalProbs: [0.37, 0.63], shape: "fall",
  },
];

// ── Price trajectory generator ───────────────────────────────────────────────

function targetProbs(
  progress: number,
  finalProbs: number[],
  shape: MarketDef["shape"]
): number[] {
  const n = finalProbs.length;
  // Start near 50/50
  const start = finalProbs.map(() => 1 / n);

  let t: number;
  switch (shape) {
    case "rise":
      // Smooth s-curve with early dip
      t = 1 / (1 + Math.exp(-8 * (progress - 0.45)));
      break;
    case "fall":
      // Inverse of rise for the main outcome
      t = 1 / (1 + Math.exp(-8 * (progress - 0.45)));
      break;
    case "volatile":
      // Wavy progress
      t = progress + 0.12 * Math.sin(progress * Math.PI * 5);
      t = Math.max(0, Math.min(1, t));
      break;
    case "steady":
      // Quick establishment then flat
      t = Math.min(1, progress * 2.5);
      break;
    case "comeback":
      // Lead change: outcome[1] trails then surges past outcome[0]
      if (progress < 0.5) {
        // outcome[0] leads early
        const localT = progress / 0.5;
        const flipped = finalProbs.map((_, i) => (i === 0 ? 0.6 : 0.4));
        const blended = start.map((s, i) => s + (flipped[i] - s) * localT);
        const sum = blended.reduce((a, b) => a + b, 0);
        return blended.map((v) => v / sum + (Math.random() - 0.5) * 0.02);
      }
      t = (progress - 0.5) / 0.5;
      break;
    default:
      t = progress;
  }

  const blended = start.map((s, i) => s + (finalProbs[i] - s) * t);
  const noise = (Math.random() - 0.5) * 0.04;
  blended[0] += noise;
  blended[1] -= noise;

  const sum = blended.reduce((a, b) => a + b, 0);
  return blended.map((v) => Math.max(0.05, v / sum));
}

// ── Per-market simulator ─────────────────────────────────────────────────────

async function simulateMarket(mDef: MarketDef) {
  const b = 1000;
  const NUM_TRADES = 150; // More trades for higher volume
  const now = Date.now();
  const createdAt = new Date(now - mDef.daysBack * 24 * 60 * 60 * 1000);
  const startTime = createdAt.getTime();
  const timeSpan = now - startTime;

  // Clean existing data
  await prisma.$executeRawUnsafe(`DELETE FROM "LmsrSnapshot" WHERE "marketId" = $1`, mDef.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE "reference" = $1`, mDef.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "Position" WHERE "marketId" = $1`, mDef.id);
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET "createdAt" = $1, "totalPool" = 0, "winningOutcomeId" = NULL, "resolvedAt" = NULL WHERE id = $2`,
    createdAt, mDef.id
  );
  for (const o of mDef.outcomes) {
    await prisma.marketOutcome.update({ where: { id: o.id }, data: { qOutstanding: 0, pool: 0 } });
  }

  // Build time points — clustered toward recent
  const times: number[] = [];
  for (let i = 0; i < NUM_TRADES; i++) {
    const t = Math.pow((i + 1) / NUM_TRADES, 0.6);
    const jitter = (Math.random() - 0.5) * (timeSpan / NUM_TRADES) * 0.2;
    times.push(Math.min(now - 5000, startTime + t * timeSpan + jitter));
  }
  times.sort((a, c) => a - c);

  const qVec = mDef.outcomes.map(() => 0);
  const snapshots: any[] = [];
  const positions: any[] = [];
  const transactions: any[] = [];
  let totalPool = 0;

  for (let i = 0; i < NUM_TRADES; i++) {
    const tradeTime = new Date(times[i]);
    const progress = (times[i] - startTime) / timeSpan;
    const tProbs = targetProbs(progress, mDef.finalProbs, mDef.shape);
    const currentPrices = lmsrPricesN(qVec, b);

    // Pick outcome with biggest positive gap vs target
    let bestIdx = 0;
    let bestDiff = -Infinity;
    for (let j = 0; j < mDef.outcomes.length; j++) {
      const diff = tProbs[j] - currentPrices[j];
      if (diff > bestDiff) { bestDiff = diff; bestIdx = j; }
    }

    const contrarian = Math.random() < 0.12;
    const tradeIdx = contrarian ? (bestIdx === 0 ? 1 : 0) : bestIdx;

    // Larger base amounts to hit $4k+ pool
    const diffMag = Math.abs(tProbs[tradeIdx] - currentPrices[tradeIdx]);
    // Mix small and large trades: ~15% are "whale" trades 3-5x bigger
    const isWhale = Math.random() < 0.15;
    const whaleMul = isWhale ? 3 + Math.random() * 2 : 1;
    const baseDelta = diffMag * b * (3 + Math.random() * 3) * whaleMul;
    const delta = Math.max(40, Math.min(500, contrarian ? baseDelta * 0.4 : baseDelta));

    const qBefore: Record<string, number> = {};
    const pBefore: Record<string, number> = {};
    mDef.outcomes.forEach((o, idx) => { qBefore[o.id] = qVec[idx]; pBefore[o.id] = currentPrices[idx]; });

    const cost = lmsrCostN(qVec, b, tradeIdx, delta);
    qVec[tradeIdx] += delta;

    const pAfterArr = lmsrPricesN(qVec, b);
    const qAfter: Record<string, number> = {};
    const pAfter: Record<string, number> = {};
    mDef.outcomes.forEach((o, idx) => { qAfter[o.id] = qVec[idx]; pAfter[o.id] = pAfterArr[idx]; });

    totalPool += Math.abs(cost);
    const userId = USERS[Math.floor(Math.random() * USERS.length)];
    const outcome = mDef.outcomes[tradeIdx];

    snapshots.push({
      id: createId(), marketId: mDef.id, outcomeId: outcome.id,
      qBefore, pBefore, side: outcome.name, deltaShares: delta, cost: Math.abs(cost),
      qAfter, pAfter, triggerType: "ROUTED_BUY", userId, createdAt: tradeTime,
    });
    positions.push({
      id: createId(), marketId: mDef.id, outcomeId: outcome.id,
      originalOwnerId: userId, currentOwnerId: userId,
      side: outcome.name, amount: Math.abs(cost), status: "ACTIVE",
      shares: delta, avgCostPerShare: Math.abs(cost) / delta,
      totalCost: Math.abs(cost), initialProbability: pBefore[outcome.id],
      purchasePrice: Math.abs(cost) / delta,
      createdAt: tradeTime, updatedAt: tradeTime,
    });
    transactions.push({
      id: createId(), userId, type: "BET_PLACED",
      amount: -Math.abs(cost), balanceBefore: 5000, balanceAfter: 5000 - Math.abs(cost),
      reference: mDef.id,
      description: `Market Buy: ${delta.toFixed(2)} ${outcome.name} for $${Math.abs(cost).toFixed(2)}`,
      createdAt: tradeTime,
    });
  }

  // Batch insert via createMany for speed
  await prisma.position.createMany({ data: positions });
  await prisma.transaction.createMany({ data: transactions });

  // Snapshots need raw insert due to jsonb — do them in parallel
  await Promise.all(snapshots.map((s) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "LmsrSnapshot" (id,"marketId","outcomeId","qBefore","pBefore",side,"deltaShares",cost,"qAfter","pAfter","triggerType","userId","createdAt")
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,
      s.id, s.marketId, s.outcomeId,
      JSON.stringify(s.qBefore), JSON.stringify(s.pBefore),
      s.side, s.deltaShares, s.cost,
      JSON.stringify(s.qAfter), JSON.stringify(s.pAfter),
      s.triggerType, s.userId, s.createdAt
    )
  ));

  // Update market totals
  await prisma.$executeRawUnsafe(
    `UPDATE "Market" SET "totalPool" = $1 WHERE id = $2`, totalPool, mDef.id
  );

  const finalPrices = lmsrPricesN(qVec, b);
  for (let idx = 0; idx < mDef.outcomes.length; idx++) {
    const pool = positions.filter((p) => p.outcomeId === mDef.outcomes[idx].id).reduce((s, p) => s + p.amount, 0);
    await prisma.marketOutcome.update({
      where: { id: mDef.outcomes[idx].id },
      data: { qOutstanding: qVec[idx], pool },
    });
  }

  const priceStr = mDef.outcomes.map((o, i) => `${o.name}: ${(finalPrices[i] * 100).toFixed(1)}%`).join(" | ");
  console.log(`  ✓ $${totalPool.toFixed(0).padStart(6)}  [${priceStr}]  ${mDef.question}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Simulando ${MARKETS.length} mercados con volumen >$4,000 cada uno...\n`);

  for (const mDef of MARKETS) {
    await simulateMarket(mDef);
  }

  console.log("\n✅ Todos los mercados simulados.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
