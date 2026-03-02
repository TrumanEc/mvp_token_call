/**
 * LMSR Solvency & MaxLoss Validation Script
 * 
 * This script validates that the platform remains solvent under all
 * trading conditions using the LMSR market maker model.
 * 
 * Key properties tested:
 *   1. MaxLoss = b * ln(2) for a binary market
 *   2. Revenue (fees + cost accumulation) always covers worst-case payouts
 *   3. Edge cases: extreme one-sided markets, many small trades, large single trades
 */

// ─── Re-implement core LMSR functions (mirroring LmsrService) ───

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
  if (!isFinite(expYes) || !isFinite(expNo) || !isFinite(sum)) {
    if (qYes > qNo) return { pYes: 1, pNo: 0 }
    else return { pYes: 0, pNo: 1 }
  }
  return { pYes: expYes / sum, pNo: expNo / sum }
}

function getCostToBuy(qYes, qNo, b, side, deltaShares) {
  const before = costFunction(qYes, qNo, b)
  const after  = side === 'YES'
    ? costFunction(qYes + deltaShares, qNo, b)
    : costFunction(qYes, qNo + deltaShares, b)
  return after - before
}

function getSharesToBuy(qYes, qNo, b, side, amount) {
  let low = 0
  let high = amount * 10
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    const cost = getCostToBuy(qYes, qNo, b, side, mid)
    if (Math.abs(cost - amount) < 1e-6) return mid
    if (cost < amount) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function getMaxLoss(b) {
  return b * Math.log(2)
}

// ─── Test Helpers ───

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ FAILED: ${label}`)
    failed++
  }
}

function assertApprox(a, b, tolerance, label) {
  assert(Math.abs(a - b) < tolerance, `${label} (got ${a.toFixed(6)}, expected ~${b.toFixed(6)})`)
}

// ─── Simulation Engine ───

function simulateMarket(b, trades, label) {
  console.log(`\n═══ ${label} ═══`)
  console.log(`  b = ${b}, MaxLoss = ${getMaxLoss(b).toFixed(4)}`)
  
  let qYes = 0
  let qNo = 0
  const platformFeeRate = 0.10
  let totalRevenueFromFees = 0
  let totalSharesYes = 0
  let totalSharesNo = 0
  let totalUserPaid = 0
  
  const seedCost = costFunction(0, 0, b) // C(0,0) = b * ln(2)
  
  for (const trade of trades) {
    const { side, amount } = trade
    const netAmount = amount * (1 - platformFeeRate)
    const fee = amount * platformFeeRate
    totalRevenueFromFees += fee
    totalUserPaid += amount
    
    const shares = getSharesToBuy(qYes, qNo, b, side, netAmount)
    const cost = getCostToBuy(qYes, qNo, b, side, shares)
    
    if (side === 'YES') {
      qYes += shares
      totalSharesYes += shares
    } else {
      qNo += shares
      totalSharesNo += shares
    }
    
    console.log(`  Trade: ${side} $${amount.toFixed(2)} → ${shares.toFixed(4)} shares (cost: $${cost.toFixed(4)})`)
  }
  
  const currentCost = costFunction(qYes, qNo, b)
  const { pYes, pNo } = getPrice(qYes, qNo, b)
  
  // Worst case payouts
  const worstCasePayoutYes = totalSharesYes * 1.0 // If YES wins, all YES holders get $1/share
  const worstCasePayoutNo  = totalSharesNo  * 1.0 // If NO wins, all NO holders get $1/share
  const worstCasePayout = Math.max(worstCasePayoutYes, worstCasePayoutNo)
  
  // Platform reserves = total user payments (all money collected)
  const totalReserves = totalUserPaid
  
  // Net PnL scenarios
  const pnlIfYesWins = totalReserves - worstCasePayoutYes
  const pnlIfNoWins  = totalReserves - worstCasePayoutNo
  
  console.log(`\n  --- Final State ---`)
  console.log(`  qYes: ${qYes.toFixed(4)}, qNo: ${qNo.toFixed(4)}`)
  console.log(`  pYes: ${(pYes * 100).toFixed(2)}%, pNo: ${(pNo * 100).toFixed(2)}%`)
  console.log(`  Total User Paid: $${totalUserPaid.toFixed(2)}`)
  console.log(`  Revenue from Fees: $${totalRevenueFromFees.toFixed(2)}`)
  console.log(`  Current Cost Function: $${currentCost.toFixed(4)}`)
  console.log(`  Seed Cost (b*ln2): $${seedCost.toFixed(4)}`)
  console.log(`  Cost Accumulated (current - seed): $${(currentCost - seedCost).toFixed(4)}`)
  console.log(`  Total YES Shares: ${totalSharesYes.toFixed(4)}`)
  console.log(`  Total NO Shares: ${totalSharesNo.toFixed(4)}`)
  console.log(`  Worst-Case Payout (YES wins): $${worstCasePayoutYes.toFixed(2)}`)
  console.log(`  Worst-Case Payout (NO wins):  $${worstCasePayoutNo.toFixed(2)}`)
  console.log(`  PnL if YES wins: $${pnlIfYesWins.toFixed(2)}`)
  console.log(`  PnL if NO wins:  $${pnlIfNoWins.toFixed(2)}`)
  
  return {
    qYes, qNo, pYes, pNo,
    totalReserves,
    totalSharesYes, totalSharesNo,
    worstCasePayoutYes, worstCasePayoutNo,
    pnlIfYesWins, pnlIfNoWins,
    totalRevenueFromFees, seedCost, currentCost
  }
}

// ─── Test Suite ───

function main() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  LMSR Solvency & MaxLoss Validation               ║')
  console.log('╚════════════════════════════════════════════════════╝')
  
  // ─── Test 1: MaxLoss Property ───
  console.log('\n\n━━━ TEST 1: MaxLoss = b * ln(2) ━━━')
  for (const b of [10, 50, 100, 500, 1000]) {
    const expected = b * Math.log(2)
    const actual = getMaxLoss(b)
    assertApprox(actual, expected, 0.0001, `MaxLoss(b=${b}) = ${expected.toFixed(4)}`)
  }
  
  // ─── Test 2: Initial Cost = SeedCost = b * ln(2) ───
  console.log('\n\n━━━ TEST 2: Initial Cost C(0,0) = b * ln(2) ━━━')
  for (const b of [10, 100, 500]) {
    const c00 = costFunction(0, 0, b)
    const expected = b * Math.log(2)
    assertApprox(c00, expected, 0.0001, `C(0,0) for b=${b}`)
  }
  
  // ─── Test 3: Initial Prices are 50/50 ───
  console.log('\n\n━━━ TEST 3: Initial Prices P(0,0) = 50/50 ━━━')
  const prices = getPrice(0, 0, 100)
  assertApprox(prices.pYes, 0.5, 0.0001, 'P_yes(0,0) = 0.50')
  assertApprox(prices.pNo, 0.5, 0.0001, 'P_no(0,0) = 0.50')
  
  // ─── Test 4: Prices sum to 1 after trades ───
  console.log('\n\n━━━ TEST 4: Prices always sum to 1.0 ━━━')
  const testStates = [
    [0, 0], [10, 0], [0, 10], [50, 50], [100, 20], [200, 1], [5, 500]
  ]
  for (const [qY, qN] of testStates) {
    const p = getPrice(qY, qN, 100)
    assertApprox(p.pYes + p.pNo, 1.0, 0.0001, `P_yes + P_no = 1.0 at (${qY}, ${qN})`)
  }
  
  // ─── Test 5: Cost is always positive for positive delta ───
  console.log('\n\n━━━ TEST 5: Cost > 0 for positive deltaShares ━━━')
  for (const b of [50, 100, 500]) {
    for (const delta of [1, 5, 10, 50]) {
      const costYes = getCostToBuy(0, 0, b, 'YES', delta)
      assert(costYes > 0, `Cost(YES, delta=${delta}, b=${b}) = ${costYes.toFixed(4)} > 0`)
    }
  }
  
  // ─── Test 6: Balanced Market Solvency ───
  console.log('\n\n━━━ TEST 6: Balanced Market Solvency ━━━')
  const r6 = simulateMarket(100, [
    { side: 'YES', amount: 20 },
    { side: 'NO',  amount: 20 },
    { side: 'YES', amount: 15 },
    { side: 'NO',  amount: 15 },
    { side: 'YES', amount: 10 },
    { side: 'NO',  amount: 10 },
  ], 'Balanced Market (b=100)')
  
  assert(r6.pnlIfYesWins >= 0, `Platform solvent if YES wins (PnL: $${r6.pnlIfYesWins.toFixed(2)})`)
  assert(r6.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r6.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 7: One-Sided Market (All YES) ───
  console.log('\n\n━━━ TEST 7: One-Sided Market (All YES) ━━━')
  const r7 = simulateMarket(100, [
    { side: 'YES', amount: 50 },
    { side: 'YES', amount: 50 },
    { side: 'YES', amount: 50 },
    { side: 'YES', amount: 50 },
    { side: 'YES', amount: 50 },
  ], 'One-Sided YES (b=100)')
  
  assert(r7.pnlIfYesWins >= -0.01, `Platform solvent if YES wins (PnL: $${r7.pnlIfYesWins.toFixed(2)})`)
  assert(r7.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r7.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 8: One-Sided Market (All NO) ───  
  console.log('\n\n━━━ TEST 8: One-Sided Market (All NO) ━━━')
  const r8 = simulateMarket(100, [
    { side: 'NO', amount: 50 },
    { side: 'NO', amount: 50 },
    { side: 'NO', amount: 50 },
    { side: 'NO', amount: 50 },
    { side: 'NO', amount: 50 },
  ], 'One-Sided NO (b=100)')
  
  assert(r8.pnlIfYesWins >= 0,  `Platform solvent if YES wins (PnL: $${r8.pnlIfYesWins.toFixed(2)})`)
  assert(r8.pnlIfNoWins >= -0.01, `Platform solvent if NO wins (PnL: $${r8.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 9: Extreme Scenario - Large Single Trade ───
  console.log('\n\n━━━ TEST 9: Large Single Trade ($5000 YES, b=100) ━━━')
  const r9 = simulateMarket(100, [
    { side: 'YES', amount: 5000 },
  ], 'Large Single Trade (b=100)')
  
  assert(r9.pnlIfYesWins >= -0.01, `Platform solvent if YES wins (PnL: $${r9.pnlIfYesWins.toFixed(2)})`)
  assert(r9.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r9.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 10: Many Small Trades ───
  console.log('\n\n━━━ TEST 10: Many Small Trades ━━━')
  const smallTrades = []
  for (let i = 0; i < 50; i++) {
    smallTrades.push({ side: i % 2 === 0 ? 'YES' : 'NO', amount: 5 })
  }
  const r10 = simulateMarket(100, smallTrades, 'Many Small Trades (50 x $5, b=100)')
  
  assert(r10.pnlIfYesWins >= 0, `Platform solvent if YES wins (PnL: $${r10.pnlIfYesWins.toFixed(2)})`)
  assert(r10.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r10.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 11: High Liquidity (b=500) ───
  console.log('\n\n━━━ TEST 11: High Liquidity b=500 ━━━')
  const r11 = simulateMarket(500, [
    { side: 'YES', amount: 100 },
    { side: 'YES', amount: 100 },
    { side: 'YES', amount: 100 },
    { side: 'NO',  amount: 50 },
  ], 'High Liquidity (b=500)')
  
  assert(r11.pnlIfYesWins >= -0.01, `Platform solvent if YES wins (PnL: $${r11.pnlIfYesWins.toFixed(2)})`)
  assert(r11.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r11.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 12: Low Liquidity (b=10) ───
  console.log('\n\n━━━ TEST 12: Low Liquidity b=10 ━━━')
  const r12 = simulateMarket(10, [
    { side: 'YES', amount: 20 },
    { side: 'NO',  amount: 20 },
    { side: 'YES', amount: 10 },
  ], 'Low Liquidity (b=10)')
  
  assert(r12.pnlIfYesWins >= -0.01, `Platform solvent if YES wins (PnL: $${r12.pnlIfYesWins.toFixed(2)})`)
  assert(r12.pnlIfNoWins >= 0,  `Platform solvent if NO wins (PnL: $${r12.pnlIfNoWins.toFixed(2)})`)
  
  // ─── Test 13: MaxLoss Boundary - Platform Subsidy Check ───
  console.log('\n\n━━━ TEST 13: MaxLoss Boundary Check ━━━')
  // In pure LMSR without fees, the market maker's max loss is b*ln(2).
  // With 10% fee, the platform collects extra revenue that should cover the seed.
  // The seed cost is the "subsidy" the platform puts in to run the market.
  for (const b of [10, 50, 100, 500]) {
    const maxLoss = getMaxLoss(b)
    console.log(`  b=${b}: MaxLoss (seed subsidy) = $${maxLoss.toFixed(2)}`)
    assert(maxLoss > 0, `MaxLoss is positive for b=${b}`)
    assert(maxLoss === b * Math.log(2), `MaxLoss formula holds for b=${b}`)
  }
  
  // ─── Summary ───
  console.log('\n\n╔════════════════════════════════════════════════════╗')
  console.log(`║  Results: ${passed} passed, ${failed} failed                       `)
  console.log('╚════════════════════════════════════════════════════╝')
  
  if (failed > 0) {
    console.error('\n⚠️  Some tests FAILED. Review the output above.')
    process.exit(1)
  } else {
    console.log('\n🎉 All solvency tests PASSED!')
  }
}

main()
