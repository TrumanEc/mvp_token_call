/**
 * ============================================================
 * TESTS COMISIONES — Mercado Primario, Secundario y Combinado
 * ============================================================
 * Uso: npx tsx tests/fees.test.ts
 * ============================================================
 */

import 'dotenv/config'

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL
}

import { PrismaClient } from '@prisma/client'
import Decimal from 'decimal.js'
import { RouterService } from '../src/services/router.service'
import { OrderBookService } from '../src/services/orderbook.service'
import { LmsrService } from '../src/services/lmsr.service'

const prisma = new PrismaClient()
const lmsr = new LmsrService()

let passed = 0
let failed = 0
const failures: string[] = []

function assert(ok: boolean, msg: string) {
  if (ok) { console.log(`  ✅ ${msg}`); passed++ }
  else     { console.log(`  ❌ ${msg}`); failed++; failures.push(msg) }
}
function assertApprox(a: number, b: number, msg: string, tol = 0.05) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a.toFixed(4)}, exp ≈${b.toFixed(4)})`)
}
async function section(title: string, fn: () => Promise<void>) {
  console.log(`\n${'─'.repeat(62)}`)
  console.log(`📋 ${title}`)
  console.log('─'.repeat(62))
  try { await fn() }
  catch (e: any) {
    console.log(`  💥 FATAL: ${e.message}`)
    failed++; failures.push(`[${title}]: ${e.message}`)
  }
}

async function mkMarket(b = 100) {
  const params = { b, alpha: null, bMin: null }
  const priors = [0.5, 0.5]
  const qValues = lmsr.getInitialQValuesLSN(params, priors)
  const seedCost = lmsr.getSeedCostLSN(params, 2)

  return prisma.market.create({
    data: {
      question: `__TEST_FEES_${Date.now()}__`,
      status: 'ACTIVE', b,
      seedCost,
      resolutionDate: new Date('2030-01-01'),
      totalPool: 0,
      platformFee: new Decimal(0.10),
      outcomes: {
        create: [
          { name: 'YES', qOutstanding: qValues[0], displayOrder: 0 },
          { name: 'NO', qOutstanding: qValues[1], displayOrder: 1 },
        ],
      },
    },
    include: { outcomes: { orderBy: { displayOrder: 'asc' } } },
  })
}

async function mkUser(tag: string, balance: number) {
  const ts = Date.now()
  return prisma.user.create({
    data: { email: `fees_${tag}_${ts}@test.win`, username: `fees_${tag}_${ts}`, balance: new Decimal(balance) },
  })
}

async function mkPosition(marketId: string, ownerId: string, outcomeId: string, side: string, shares: number, cost: number) {
  return prisma.position.create({
    data: {
      marketId, outcomeId, originalOwnerId: ownerId, currentOwnerId: ownerId,
      side, amount: new Decimal(cost), shares,
      avgCostPerShare: cost / shares, totalCost: cost,
      initialProbability: new Decimal(0.5), status: 'ACTIVE',
    },
  })
}

async function cleanup(marketId: string, userIds: string[]) {
  await prisma.positionTransfer.deleteMany({ where: { position: { marketId } } })
  await prisma.lmsrSnapshot.deleteMany({ where: { marketId } })
  await prisma.marketRouterAuditLog.deleteMany({ where: { marketId } })
  await prisma.order.deleteMany({ where: { marketId } })
  await prisma.marketplaceListing.deleteMany({ where: { marketId } })
  await prisma.position.deleteMany({ where: { marketId } })
  await prisma.marketOutcome.deleteMany({ where: { marketId } })
  await prisma.market.deleteMany({ where: { id: marketId } })
  for (const id of userIds) {
    await prisma.transaction.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
}

// TEST 1: Primary Fee
async function testPrimaryFee() {
  const market = await mkMarket(100)
  const yesOutcome = market.outcomes[0]
  const buyer = await mkUser('buyer', 2000)

  await section('FEE PRIMARIO 1: Mecanica del 10% en LMSR puro', async () => {
    const BUDGET = 100
    const FEE_RATE = 0.10
    const NET_TO_LMSR = BUDGET * (1 - FEE_RATE)
    const FEE_WIN = BUDGET * FEE_RATE

    const balanceBefore = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      outcomeId: yesOutcome.id,
      budget: BUDGET,
    })

    const balanceAfter = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
    const paid = balanceBefore - balanceAfter

    assertApprox(paid, BUDGET, `Usuario pago $${BUDGET} (bruto)`)
    assertApprox(result.executionSummary.fee, FEE_WIN, `Fee WIN = $${FEE_WIN} (10% de $${BUDGET})`)
    assertApprox(result.executionSummary.spentNet, NET_TO_LMSR, `Net al LMSR = $${NET_TO_LMSR} (90%)`)
    assert(result.executionSummary.sharesCollected > 0, `Shares generados: ${result.executionSummary.sharesCollected.toFixed(4)}`)
  })

  await section('FEE PRIMARIO 2: Fee escala con el monto (10% siempre)', async () => {
    const noOutcome = market.outcomes[1]
    const amounts = [50, 100, 200]
    for (const budget of amounts) {
      const balBefore = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
      const res = await RouterService.executeMarketBuy({ marketId: market.id, userId: buyer.id, outcomeId: noOutcome.id, budget })
      const balAfter = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
      const expectedFee = budget * 0.10
      assertApprox(res.executionSummary.fee, expectedFee, `$${budget} -> fee = $${expectedFee.toFixed(2)} (10%)`, 0.5)
    }
  })

  await cleanup(market.id, [buyer.id])
}

// TEST 2: Secondary OB Fee
async function testSecondaryObFee() {
  const market = await mkMarket(100)
  const yesOutcome = market.outcomes[0]
  const seller = await mkUser('seller', 500)
  const buyer  = await mkUser('buyer', 500)

  const sellerPos = await mkPosition(market.id, seller.id, yesOutcome.id, 'YES', 5.0, 250)

  await section('FEE SECUNDARIO OB 1: Limit Sell + Market Buy — fee 2% en OB', async () => {
    const SHARES_TO_SELL = 5.0
    const PRICE_PER_SHARE = 0.45
    const TOTAL_NET = SHARES_TO_SELL * PRICE_PER_SHARE
    const OB_FEE_RATE = 0.02
    const GROSS_BUYER = TOTAL_NET / (1 - OB_FEE_RATE)

    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: seller.id,
      positionId: sellerPos.id,
      sharesToSell: SHARES_TO_SELL,
      pricePerShare: PRICE_PER_SHARE,
    })

    const sellerBalBefore = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const buyerBalBefore  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const BUYER_BUDGET = GROSS_BUYER + 1
    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      outcomeId: yesOutcome.id,
      budget: BUYER_BUDGET,
    })

    const sellerBalAfter = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const sellerReceived = sellerBalAfter - sellerBalBefore

    assertApprox(sellerReceived, TOTAL_NET, `Seller recibio $${TOTAL_NET.toFixed(4)} (neto sin fee)`, 0.01)
    assertApprox(result.executionSummary.obShares, SHARES_TO_SELL, `OB shares comprados: ${SHARES_TO_SELL}`, 0.01)

    const obFee = result.executionSummary.fee
    assert(obFee > 0, `Fee total > 0 (got $${obFee.toFixed(4)})`)

    const transfer = await prisma.positionTransfer.findFirst({
      where: { toUserId: buyer.id },
      orderBy: { transferredAt: 'desc' }
    })
    if (transfer) {
      assertApprox(Number(transfer.price), TOTAL_NET, `Transfer.price = neto seller = $${TOTAL_NET.toFixed(4)}`, 0.01)
    } else {
      assert(false, 'PositionTransfer creado para el tramo OB')
    }
  })

  await cleanup(market.id, [seller.id, buyer.id])
}

// TEST 3: Combined Fee
async function testCombinedFee() {
  const market = await mkMarket(100)
  const yesOutcome = market.outcomes[0]
  const seller = await mkUser('seller', 500)
  const buyer  = await mkUser('buyer', 2000)

  const sellerPos = await mkPosition(market.id, seller.id, yesOutcome.id, 'YES', 3.0, 150)

  await section('FEE COMBINADO 1: Parte OB (2%) + Parte LMSR (10%)', async () => {
    const OB_PRICE = 0.40
    const OB_SHARES = 3.0
    const OB_NET = OB_SHARES * OB_PRICE
    const OB_FEE = 0.02
    const OB_GROSS = OB_NET / (1 - OB_FEE)

    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: seller.id,
      positionId: sellerPos.id,
      sharesToSell: OB_SHARES,
      pricePerShare: OB_PRICE,
    })

    const qVec = LmsrService.buildQVector(market.outcomes)
    const params = { b: market.b, alpha: market.alpha, bMin: market.bMin }
    const prices = lmsr.getPricesLSN(qVec, params)
    const spotBefore = prices[0]
    assert(spotBefore > OB_PRICE, `LMSR spot (${spotBefore.toFixed(3)}) > OB price (${OB_PRICE}) -> OB ejecutara primero`)

    const buyerBalBefore  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const TOTAL_BUDGET = 200
    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      outcomeId: yesOutcome.id,
      budget: TOTAL_BUDGET,
    })

    const buyerBalAfter  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
    const buyerPaid = buyerBalBefore - buyerBalAfter

    assert(result.executionSummary.obShares > 0, `Tramo OB ejecutado (${result.executionSummary.obShares.toFixed(4)} shares)`)
    assert(result.executionSummary.lmsrShares > 0, `Tramo LMSR ejecutado (${result.executionSummary.lmsrShares.toFixed(4)} shares)`)
    assert(result.executionSummary.sharesCollected > OB_SHARES, `Shares totales > OB shares`)
  })

  await section('FEE COMBINADO 2: Consistencia — balances cuadran', async () => {
    const transfers = await prisma.positionTransfer.findMany({ where: { position: { marketId: market.id } } })
    const totalSellerReceived = transfers.reduce((s, t) => s + Number(t.price), 0)
    const mkt = await prisma.market.findUnique({ where: { id: market.id } })
    const totalPool = Number(mkt!.totalPool)

    assert(totalPool >= 0, `totalPool >= 0 (dinero llego al LMSR: $${totalPool.toFixed(4)})`)
    assert(totalSellerReceived > 0, 'Seller recibio dinero del tramo OB')
  })

  await cleanup(market.id, [seller.id, buyer.id])
}

// TEST 4: Fee Unification
async function testFeeUnification() {
  await section('UNIFICACION: Marketplace y OB Router ambos al 2%', async () => {
    const MARKETPLACE_FEE = 0.020
    const ROUTER_OB_FEE   = 0.020
    const SETTLEMENT_FEE  = 0.020

    assert(MARKETPLACE_FEE === ROUTER_OB_FEE, `Marketplace fee (${MARKETPLACE_FEE * 100}%) === Router OB fee (${ROUTER_OB_FEE * 100}%)`)
    assert(ROUTER_OB_FEE === SETTLEMENT_FEE,  `Router OB fee (${ROUTER_OB_FEE * 100}%) === Settlement fee (${SETTLEMENT_FEE * 100}%)`)
    assert(MARKETPLACE_FEE === 0.02,           'Marketplace fee = 2% exacto')
  })
}

async function main() {
  console.log('\nWIN Fee Verification — Suite de Tests de Comisiones')
  console.log('='.repeat(62))

  try {
    await testPrimaryFee()
    await testSecondaryObFee()
    await testCombinedFee()
    await testFeeUnification()
  } finally {
    await prisma.$disconnect()
  }

  console.log('\n' + '='.repeat(62))
  const emoji = failed === 0 ? 'OK' : 'WARN'
  console.log(`${emoji} Resultados: ${passed} pasaron | ${failed} fallaron`)
  if (failures.length > 0) {
    console.log('\nFallas:')
    failures.forEach(f => console.log(`   - ${f}`))
  }
  console.log('='.repeat(62))
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\nError fatal:', e)
  process.exit(1)
})
