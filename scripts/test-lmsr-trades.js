/**
 * LMSR Manual Trade & Settlement Test Script
 * 
 * This script performs end-to-end testing using the actual database:
 *   1. Creates a test market with LMSR parameters
 *   2. Creates test users
 *   3. Simulates trades via the PositionService logic
 *   4. Resolves the market and validates payouts
 *   5. Cleans up test data
 * 
 * Usage: node scripts/test-lmsr-trades.js
 * Requires: DATABASE_URL in .env
 */

const { PrismaClient, Decimal } = require('@prisma/client')
const prisma = new PrismaClient()

// ─── LMSR Functions (mirroring LmsrService) ───

function costFunction(qYes, qNo, b) {
  const maxQ = Math.max(qYes / b, qNo / b)
  return b * (maxQ + Math.log(
    Math.exp(qYes / b - maxQ) + Math.exp(qNo / b - maxQ)
  ))
}

function getPrice(qYes, qNo, b) {
  const expYes = Math.exp(qYes / b)
  const expNo  = Math.exp(qNo / b)
  const sum    = expYes + expNo
  return { pYes: expYes / sum, pNo: expNo / sum }
}

function getSharesToBuy(qYes, qNo, b, side, amount) {
  let low = 0, high = amount * 10
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    const before = costFunction(qYes, qNo, b)
    const after  = side === 'YES'
      ? costFunction(qYes + mid, qNo, b)
      : costFunction(qYes, qNo + mid, b)
    const cost = after - before
    if (Math.abs(cost - amount) < 1e-6) return mid
    if (cost < amount) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function getCostToBuy(qYes, qNo, b, side, delta) {
  const before = costFunction(qYes, qNo, b)
  const after  = side === 'YES'
    ? costFunction(qYes + delta, qNo, b)
    : costFunction(qYes, qNo + delta, b)
  return after - before
}

// ─── Test Helpers ───

let passed = 0, failed = 0
const TEST_PREFIX = `__LMSR_TEST_${Date.now()}`

function assert(condition, label) {
  if (condition) { console.log(`  ✅ ${label}`); passed++ }
  else { console.error(`  ❌ FAILED: ${label}`); failed++ }
}

function assertApprox(a, b, tolerance, label) {
  assert(Math.abs(a - b) < tolerance, `${label} (got ${a.toFixed(4)}, expected ~${b.toFixed(4)})`)
}

// ─── Main Test ───

async function main() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  LMSR Manual Trade & Settlement Test               ║')
  console.log('╚════════════════════════════════════════════════════╝')

  const b = 100
  const seedCost = b * Math.log(2)
  const platformFee = 0.10

  // ─── Step 1: Create Test Users ───
  console.log('\n━━━ Step 1: Create Test Users ━━━')
  
  const userA = await prisma.user.create({
    data: { username: `${TEST_PREFIX}_userA`, email: `${TEST_PREFIX}_a@test.com`, balance: 1000 }
  })
  const userB = await prisma.user.create({
    data: { username: `${TEST_PREFIX}_userB`, email: `${TEST_PREFIX}_b@test.com`, balance: 1000 }
  })
  console.log(`  Created User A: ${userA.id} (balance: $${userA.balance})`)
  console.log(`  Created User B: ${userB.id} (balance: $${userB.balance})`)
  assert(userA.id && userB.id, 'Users created successfully')

  // ─── Step 2: Create Test Market ───
  console.log('\n━━━ Step 2: Create Test Market ━━━')
  
  const market = await prisma.market.create({
    data: {
      question: `${TEST_PREFIX} Test Market`,
      resolutionDate: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
      b,
      qYes: 0,
      qNo: 0,
      seedCost,
      yesPool: 0,
      noPool: 0,
      maxPool: 10000,
      lmsrSnapshots: {
        create: {
          qYesBefore: 0, qNoBefore: 0, pYesBefore: 0.5,
          side: 'INIT', deltaShares: 0, cost: seedCost,
          qYesAfter: 0, qNoAfter: 0, pYesAfter: 0.5,
          triggerType: 'INIT', userId: 'SYSTEM',
        }
      }
    }
  })
  console.log(`  Created Market: ${market.id}`)
  assert(market.status === 'ACTIVE', 'Market is ACTIVE')
  assertApprox(market.b, 100, 0.01, 'Market b = 100')
  assertApprox(market.seedCost, seedCost, 0.01, 'SeedCost = b*ln(2)')

  // ─── Step 3: User A buys YES for $50 ───
  console.log('\n━━━ Step 3: User A buys YES for $50 ━━━')
  
  let qYes = market.qYes
  let qNo  = market.qNo
  const amountA = 50
  const netAmountA = amountA * (1 - platformFee)
  const sharesA = getSharesToBuy(qYes, qNo, b, 'YES', netAmountA)
  const costA = getCostToBuy(qYes, qNo, b, 'YES', sharesA)
  
  // Deduct balance
  await prisma.user.update({ where: { id: userA.id }, data: { balance: { decrement: amountA } } })
  
  // Create position
  const posA = await prisma.position.create({
    data: {
      marketId: market.id,
      originalOwnerId: userA.id,
      currentOwnerId: userA.id,
      side: 'YES',
      amount: amountA,
      status: 'ACTIVE',
      shares: sharesA,
      avgCostPerShare: sharesA > 0 ? costA / sharesA : 0,
      totalCost: costA,
    }
  })
  
  qYes += sharesA
  await prisma.market.update({
    where: { id: market.id },
    data: { qYes, yesPool: { increment: amountA } }
  })
  
  const pricesAfterA = getPrice(qYes, qNo, b)
  
  console.log(`  Shares: ${sharesA.toFixed(4)}, Cost: $${costA.toFixed(4)}`)
  console.log(`  New Prices: YES ${(pricesAfterA.pYes * 100).toFixed(2)}%, NO ${(pricesAfterA.pNo * 100).toFixed(2)}%`)
  assert(sharesA > 0, 'User A got positive shares')
  assert(pricesAfterA.pYes > 0.5, 'YES price increased after YES buy')

  // ─── Step 4: User B buys NO for $30 ───
  console.log('\n━━━ Step 4: User B buys NO for $30 ━━━')
  
  const amountB = 30
  const netAmountB = amountB * (1 - platformFee)
  const sharesB = getSharesToBuy(qYes, qNo, b, 'NO', netAmountB)
  const costB = getCostToBuy(qYes, qNo, b, 'NO', sharesB)
  
  await prisma.user.update({ where: { id: userB.id }, data: { balance: { decrement: amountB } } })
  
  const posB = await prisma.position.create({
    data: {
      marketId: market.id,
      originalOwnerId: userB.id,
      currentOwnerId: userB.id,
      side: 'NO',
      amount: amountB,
      status: 'ACTIVE',
      shares: sharesB,
      avgCostPerShare: sharesB > 0 ? costB / sharesB : 0,
      totalCost: costB,
    }
  })
  
  qNo += sharesB
  await prisma.market.update({
    where: { id: market.id },
    data: { qNo, noPool: { increment: amountB } }
  })
  
  const pricesAfterB = getPrice(qYes, qNo, b)
  
  console.log(`  Shares: ${sharesB.toFixed(4)}, Cost: $${costB.toFixed(4)}`)
  console.log(`  New Prices: YES ${(pricesAfterB.pYes * 100).toFixed(2)}%, NO ${(pricesAfterB.pNo * 100).toFixed(2)}%`)
  assert(sharesB > 0, 'User B got positive shares')
  assert(pricesAfterB.pNo > pricesAfterA.pNo, 'NO price increased after NO buy')

  // ─── Step 5: Resolve Market as YES ───
  console.log('\n━━━ Step 5: Resolve Market as YES ━━━')
  
  // User A wins: payout = shares * $1
  const payoutA = sharesA * 1.0
  // User B loses: payout = $0
  
  await prisma.user.update({ where: { id: userA.id }, data: { balance: { increment: payoutA } } })
  await prisma.position.update({ where: { id: posA.id }, data: { status: 'WON', payout: payoutA } })
  await prisma.position.update({ where: { id: posB.id }, data: { status: 'LOST', payout: 0 } })
  await prisma.market.update({
    where: { id: market.id },
    data: { status: 'RESOLVED', outcome: 'YES', resolvedAt: new Date() }
  })
  
  const userAFinal = await prisma.user.findUnique({ where: { id: userA.id } })
  const userBFinal = await prisma.user.findUnique({ where: { id: userB.id } })
  
  console.log(`  User A payout: $${payoutA.toFixed(4)} (${sharesA.toFixed(4)} shares × $1)`)
  console.log(`  User A final balance: $${Number(userAFinal.balance).toFixed(2)} (started $1000, bet $${amountA}, won $${payoutA.toFixed(2)})`)
  console.log(`  User B final balance: $${Number(userBFinal.balance).toFixed(2)} (started $1000, bet $${amountB}, lost)`)
  
  const userAProfit = Number(userAFinal.balance) - 1000
  const userBProfit = Number(userBFinal.balance) - 1000
  
  console.log(`  User A Net P&L: $${userAProfit.toFixed(2)}`)
  console.log(`  User B Net P&L: $${userBProfit.toFixed(2)}`)
  
  assert(payoutA > 0, 'Winner received positive payout')
  assert(Number(userAFinal.balance) > 950, 'User A has more than initial minus bet')
  assertApprox(Number(userBFinal.balance), 970, 0.01, 'User B lost $30 bet')
  
  // Platform analysis
  const totalCollected = amountA + amountB
  const totalPaidOut = payoutA
  const platformPnL = totalCollected - totalPaidOut
  
  console.log(`\n  --- Platform Analysis ---`)
  console.log(`  Total Collected: $${totalCollected}`)
  console.log(`  Total Paid Out: $${totalPaidOut.toFixed(2)}`)
  console.log(`  Platform Net P&L: $${platformPnL.toFixed(2)}`)
  
  // ─── Step 6: Verify DB State ───
  console.log('\n━━━ Step 6: Verify Database State ━━━')
  
  const finalMarket = await prisma.market.findUnique({
    where: { id: market.id },
    include: { positions: true, lmsrSnapshots: true }
  })
  
  assert(finalMarket.status === 'RESOLVED', 'Market status is RESOLVED')
  assert(finalMarket.outcome === 'YES', 'Market outcome is YES')
  assert(finalMarket.positions.length === 2, 'Market has 2 positions')
  
  const wonPositions = finalMarket.positions.filter(p => p.status === 'WON')
  const lostPositions = finalMarket.positions.filter(p => p.status === 'LOST')
  assert(wonPositions.length === 1, '1 winning position')
  assert(lostPositions.length === 1, '1 losing position')
  assert(Number(wonPositions[0].payout) > 0, 'Winner payout > 0')
  assert(Number(lostPositions[0].payout) === 0, 'Loser payout = 0')

  // ─── Cleanup ───
  console.log('\n━━━ Cleanup ━━━')
  
  await prisma.lmsrSnapshot.deleteMany({ where: { marketId: market.id } })
  await prisma.position.deleteMany({ where: { marketId: market.id } })
  await prisma.market.delete({ where: { id: market.id } })
  await prisma.user.deleteMany({ where: { username: { startsWith: TEST_PREFIX } } })
  
  console.log('  Test data cleaned up.')

  // ─── Summary ───
  console.log(`\n\n╔════════════════════════════════════════════════════╗`)
  console.log(`║  Results: ${passed} passed, ${failed} failed                       `)
  console.log('╚════════════════════════════════════════════════════╝')
  
  if (failed > 0) {
    console.error('\n⚠️  Some tests FAILED.')
    process.exit(1)
  } else {
    console.log('\n🎉 All trade & settlement tests PASSED!')
  }
}

main()
  .catch((e) => {
    console.error('Test error:', e)
    // Attempt cleanup on failure
    prisma.user.deleteMany({ where: { username: { startsWith: TEST_PREFIX } } })
      .then(() => prisma.$disconnect())
      .then(() => process.exit(1))
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
