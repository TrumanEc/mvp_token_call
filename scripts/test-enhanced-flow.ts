/**
 * Enhanced LMSR Flow Test (Multi-Outcome)
 * Usage: npx tsx scripts/test-enhanced-flow.ts
 */

import { PrismaClient } from '@prisma/client'
import { LmsrService } from '../src/services/lmsr.service'
import { PositionService } from '../src/services/position'

const prisma = new PrismaClient()
const lmsr = new LmsrService()

async function main() {
  const TEST_ID = `TEST_${Date.now()}`
  console.log(`\nStarting Enhanced Flow Test: ${TEST_ID}\n`)

  try {
    const user = await prisma.user.create({
      data: {
        username: `user_${TEST_ID}`,
        email: `test_${TEST_ID}@win.com`,
        balance: 2000,
      },
    })
    console.log(`Created User: ${user.username} (Balance: $2000)`)

    const b = 1000
    const params = { b, alpha: null, bMin: null }
    const priors = [0.5, 0.5]
    const qValues = lmsr.getInitialQValuesLSN(params, priors)
    const seedCost = lmsr.getSeedCostLSN(params, 2)

    const market = await prisma.market.create({
      data: {
        question: `Will it rain in ${TEST_ID}?`,
        status: 'ACTIVE',
        b,
        resolutionDate: new Date(Date.now() + 86400000),
        maxBetAmount: 100,
        maxPriceImpact: 5.0,
        seedCost,
        totalPool: 0,
        outcomes: {
          create: [
            { name: 'YES', qOutstanding: qValues[0], displayOrder: 0 },
            { name: 'NO', qOutstanding: qValues[1], displayOrder: 1 },
          ],
        },
      },
      include: { outcomes: { orderBy: { displayOrder: 'asc' } } },
    })
    const yesOutcome = market.outcomes[0]
    console.log(`Created Market with CAPs ($100 max bet, 5% max impact)`)

    // Test CAP Enforcement
    console.log(`\n--- Testing CAP Enforcement ---`)
    try {
      await PositionService.create({
        marketId: market.id,
        userId: user.id,
        outcomeId: yesOutcome.id,
        amount: 500,
      })
      console.error(`FAILED: Should have rejected $500 bet (CAP is $100)`)
    } catch (e: any) {
      console.log(`Passed: Correctly rejected $500 bet. Reason: ${e.message}`)
    }

    // Purchase 1
    console.log(`\n--- Purchase 1: $50 YES ---`)
    const pos1 = await PositionService.create({
      marketId: market.id,
      userId: user.id,
      outcomeId: yesOutcome.id,
      amount: 50,
    })
    console.log(`Purchase 1 successful. Shares: ${pos1.shares.toFixed(4)}`)

    // Purchase 2
    console.log(`\n--- Purchase 2: $30 YES ---`)
    const pos2 = await PositionService.create({
      marketId: market.id,
      userId: user.id,
      outcomeId: yesOutcome.id,
      amount: 30,
    })
    console.log(`Purchase 2 successful. Shares: ${pos2.shares.toFixed(4)}`)

    // Verify Consolidation
    console.log(`\n--- Verifying Consolidation Logic ---`)
    const consolidated = await PositionService.getUserConsolidatedPositions(user.id, market.id)
    const pos = consolidated[0]

    console.log(`  Consolidated Shares: ${pos.shares.toFixed(4)}`)
    console.log(`  Total Amount Invested: $${pos.amount.toFixed(2)}`)
    console.log(`  Weighted Avg Cost: $${pos.purchasePrice.toFixed(4)}`)
    console.log(`  Break-even Price: $${pos.breakEvenPrice.toFixed(4)}`)
    console.log(`  History items: ${pos.history.length}`)

    if (Math.abs(pos.amount - 80) < 0.01 && pos.history.length === 2) {
      console.log(`Consolidation verification successful!`)
    } else {
      console.error(`FAILED Consolidation check. Amount: ${pos.amount}, History: ${pos.history.length}`)
    }

    // Resolve Market
    console.log(`\n--- Resolving Market as YES ---`)
    const finalPayout = pos.shares * 1.0

    await prisma.market.update({
      where: { id: market.id },
      data: { status: 'RESOLVED', winningOutcomeId: yesOutcome.id, resolvedAt: new Date() },
    })

    await prisma.position.updateMany({
      where: { marketId: market.id, outcomeId: yesOutcome.id },
      data: { status: 'WON', payout: finalPayout / 2 },
    })

    console.log(`Market Resolved. Potential Payout for consolidated: $${finalPayout.toFixed(2)}`)

  } catch (error) {
    console.error(`\nTest crashed:`, error)
  } finally {
    console.log(`\n--- Cleaning Up ---`)
    const testUsername = `user_${TEST_ID}`
    const testUser = await prisma.user.findUnique({ where: { username: testUsername } })

    if (testUser) {
      await prisma.transaction.deleteMany({ where: { userId: testUser.id } })
      await prisma.marketplaceListing.deleteMany({ where: { sellerId: testUser.id } })
      await prisma.positionTransfer.deleteMany({
        where: { OR: [{ fromUserId: testUser.id }, { toUserId: testUser.id }] },
      })
    }

    const m = await prisma.market.findFirst({ where: { question: { contains: TEST_ID } } })
    if (m) {
      await prisma.position.deleteMany({ where: { marketId: m.id } })
      await prisma.lmsrSnapshot.deleteMany({ where: { marketId: m.id } })
      await prisma.marketOutcome.deleteMany({ where: { marketId: m.id } })
      await prisma.market.delete({ where: { id: m.id } })
    }

    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } })
    }

    console.log(`Cleanup finished.`)
    await prisma.$disconnect()
  }
}

main()
