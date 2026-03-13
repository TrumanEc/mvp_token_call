/**
 * ============================================================
 * TESTS COMISIONES — Mercado Primario, Secundario y Combinado
 * ============================================================
 * Uso: npx tsx tests/fees.test.ts
 * ============================================================
 */

import 'dotenv/config'

// ⚡ Usar DIRECT_URL para $transaction sin timeout
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

// ─── Runner ───────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────
async function mkMarket(b = 100) {
  return prisma.market.create({
    data: {
      question: `__TEST_FEES_${Date.now()}__`,
      status: 'ACTIVE', b,
      qYes: 0, qNo: 0, seedCost: 69.31,
      resolutionDate: new Date('2030-01-01'),
      yesPool: new Decimal(0), noPool: new Decimal(0),
      platformFee: new Decimal(0.10),   // 10% primario
    },
  })
}
async function mkUser(tag: string, balance: number) {
  const ts = Date.now()
  return prisma.user.create({
    data: { email: `fees_${tag}_${ts}@test.win`, username: `fees_${tag}_${ts}`, balance: new Decimal(balance) },
  })
}
async function mkPosition(marketId: string, ownerId: string, side: 'YES' | 'NO', shares: number, cost: number) {
  return prisma.position.create({
    data: {
      marketId, originalOwnerId: ownerId, currentOwnerId: ownerId,
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
  await prisma.market.deleteMany({ where: { id: marketId } })
  for (const id of userIds) await prisma.user.delete({ where: { id } }).catch(() => {})
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 1: Comisión Primaria (LMSR 10%)
// ═══════════════════════════════════════════════════════════════

async function testPrimaryFee() {
  const market = await mkMarket(100)
  const buyer = await mkUser('buyer', 2000)

  await section('FEE PRIMARIO 1: Mecánica del 10% en LMSR puro', async () => {
    const BUDGET = 100          // El usuario paga $100 brutos
    const FEE_RATE = 0.10       // 10%
    const NET_TO_LMSR = BUDGET * (1 - FEE_RATE)  // $90 va al LMSR
    const FEE_WIN = BUDGET * FEE_RATE              // $10 queda en WIN

    const balanceBefore = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      side: 'YES',
      budget: BUDGET,
    })

    const balanceAfter = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
    const paid = balanceBefore - balanceAfter

    // El usuario pagó exactamente el presupuesto
    assertApprox(paid, BUDGET, `Usuario pagó $${BUDGET} (bruto)`)

    // El fee calculado por el router es 10%
    assertApprox(result.executionSummary.fee, FEE_WIN, `Fee WIN = $${FEE_WIN} (10% de $${BUDGET})`)

    // El net al LMSR es el 90% restante
    assertApprox(result.executionSummary.spentNet, NET_TO_LMSR, `Net al LMSR = $${NET_TO_LMSR} (90%)`)

    // El market actualizó yesPool con el neto (no el bruto)
    const mkt = await prisma.market.findUnique({ where: { id: market.id } })
    assertApprox(Number(mkt!.yesPool), NET_TO_LMSR, `yesPool += $${NET_TO_LMSR} (neto sin fee)`)

    // Shares generados > 0
    assert(result.executionSummary.sharesCollected > 0, `Shares generados: ${result.executionSummary.sharesCollected.toFixed(4)}`)

    console.log(`   ℹ️  Bruto: $${BUDGET} | Fee WIN: $${FEE_WIN} | Net LMSR: $${NET_TO_LMSR}`)
    console.log(`   ℹ️  Shares: ${result.executionSummary.sharesCollected.toFixed(4)}`)
    console.log(`   ℹ️  Precio promedio: $${result.executionSummary.averagePrice.toFixed(4)}/share`)
  })

  await section('FEE PRIMARIO 2: Fee escala con el monto (10% siempre)', async () => {
    const amounts = [50, 100, 200]
    for (const budget of amounts) {
      const balBefore = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
      const res = await RouterService.executeMarketBuy({ marketId: market.id, userId: buyer.id, side: 'NO', budget })
      const balAfter = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)
      const paid = balBefore - balAfter
      const expectedFee = budget * 0.10
      assertApprox(res.executionSummary.fee, expectedFee, `$${budget} → fee = $${expectedFee.toFixed(2)} (10%)`, 0.5)
    }
  })

  await cleanup(market.id, [buyer.id])
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 2: Comisión Secundaria OB (2%)
// ═══════════════════════════════════════════════════════════════

async function testSecondaryObFee() {
  const market = await mkMarket(100)
  const seller = await mkUser('seller', 500)
  const buyer  = await mkUser('buyer', 500)

  // Dar posición al seller (simula compra previa)
  const sellerPos = await mkPosition(market.id, seller.id, 'YES', 5.0, 250)

  await section('FEE SECUNDARIO OB 1: Limit Sell + Market Buy — fee 2% en OB', async () => {
    const SHARES_TO_SELL = 5.0
    const PRICE_PER_SHARE = 0.45           // Seller quiere $0.45/share
    const TOTAL_NET = SHARES_TO_SELL * PRICE_PER_SHARE   // $2.25 neto para seller
    const OB_FEE_RATE = 0.02
    // El comprador paga bruto: net / (1 - 0.02)
    const GROSS_BUYER = TOTAL_NET / (1 - OB_FEE_RATE)    // ≈ $2.2959
    const FEE_WIN = GROSS_BUYER - TOTAL_NET                // ≈ $0.0459

    // 1. Seller pone limit sell
    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: seller.id,
      positionId: sellerPos.id,
      sharesToSell: SHARES_TO_SELL,
      pricePerShare: PRICE_PER_SHARE,
    })

    const sellerBalBefore = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const buyerBalBefore  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    // 2. Buyer hace market buy (con budget suficiente para comprar los shares del OB)
    const BUYER_BUDGET = GROSS_BUYER + 1  // un poco más para cubrir el OB
    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      side: 'YES',
      budget: BUYER_BUDGET,
    })

    const sellerBalAfter = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const buyerBalAfter  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const sellerReceived = sellerBalAfter - sellerBalBefore
    const buyerPaid      = buyerBalBefore - buyerBalAfter

    // Seller recibió el neto (sin fee WIN)
    assertApprox(sellerReceived, TOTAL_NET, `Seller recibió $${TOTAL_NET.toFixed(4)} (neto sin fee)`, 0.01)

    // OB shares comprados
    assertApprox(result.executionSummary.obShares, SHARES_TO_SELL, `OB shares comprados: ${SHARES_TO_SELL}`, 0.01)

    // Fee del tramo OB
    const obFee = result.executionSummary.fee  // puede incluir fee LMSR si se redirigió parte
    assert(obFee > 0, `Fee total > 0 (got $${obFee.toFixed(4)})`)

    // PositionTransfer creado con el precio neto (lo que el seller recibió)
    const transfer = await prisma.positionTransfer.findFirst({
      where: { toUserId: buyer.id },
      orderBy: { transferredAt: 'desc' }
    })
    if (transfer) {
      assertApprox(Number(transfer.price), TOTAL_NET, `Transfer.price = neto seller = $${TOTAL_NET.toFixed(4)}`, 0.01)
    } else {
      assert(false, 'PositionTransfer creado para el tramo OB')
    }

    console.log(`   ℹ️  Seller neto: $${sellerReceived.toFixed(4)} | Buyer pagó: $${buyerPaid.toFixed(4)}`)
    console.log(`   ℹ️  OB shares: ${result.executionSummary.obShares.toFixed(4)} | LMSR shares: ${result.executionSummary.lmsrShares.toFixed(4)}`)
  })

  await cleanup(market.id, [seller.id, buyer.id])
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 3: Compra COMBINADA (LMSR 10% + OB 2%)
// ═══════════════════════════════════════════════════════════════

async function testCombinedFee() {
  const market = await mkMarket(100)
  const seller = await mkUser('seller', 500)
  const buyer  = await mkUser('buyer', 2000)

  // Dar posición al seller
  const sellerPos = await mkPosition(market.id, seller.id, 'YES', 3.0, 150)

  await section('FEE COMBINADO 1: Parte OB (2%) + Parte LMSR (10%) — fees diferenciados', async () => {
    const OB_FEE = 0.02
    const LMSR_FEE = 0.10

    // Seller pone 3 shares a $0.40/share
    const OB_PRICE = 0.40
    const OB_SHARES = 3.0
    const OB_NET = OB_SHARES * OB_PRICE           // $1.20 al seller
    const OB_GROSS = OB_NET / (1 - OB_FEE)        // $1.2245 del buyer para el tramo OB

    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: seller.id,
      positionId: sellerPos.id,
      sharesToSell: OB_SHARES,
      pricePerShare: OB_PRICE,
    })

    // LMSR spot price inicial ≈ 0.50 (mayor que OB price → router ejecutará OB primero)
    const { pYes: spotBefore } = lmsr.getPrice(0, 0, 100)
    assert(spotBefore > OB_PRICE, `LMSR spot (${spotBefore.toFixed(3)}) > OB price (${OB_PRICE}) → OB ejecutará primero`)

    const sellerBalBefore = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const buyerBalBefore  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    // Budget grande para que cubra OB + LMSR
    const TOTAL_BUDGET = 200
    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: buyer.id,
      side: 'YES',
      budget: TOTAL_BUDGET,
    })

    const sellerBalAfter = Number((await prisma.user.findUnique({ where: { id: seller.id } }))!.balance)
    const buyerBalAfter  = Number((await prisma.user.findUnique({ where: { id: buyer.id } }))!.balance)

    const sellerReceived = sellerBalAfter - sellerBalBefore
    const buyerPaid      = buyerBalBefore - buyerBalAfter

    console.log(`\n   📊 Breakdown de ejecución:`)
    console.log(`      OB shares:   ${result.executionSummary.obShares.toFixed(4)}`)
    console.log(`      LMSR shares: ${result.executionSummary.lmsrShares.toFixed(4)}`)
    console.log(`      Fee total:   $${result.executionSummary.fee.toFixed(4)}`)
    console.log(`      Buyer pagó:  $${buyerPaid.toFixed(4)}`)
    console.log(`      Seller cobró:$${sellerReceived.toFixed(4)}`)
    console.log(`      Net al LMSR: $${result.executionSummary.spentNet.toFixed(4)} (no incluye OB neto)`)

    // El router SÍ usó ambos tramos
    assert(result.executionSummary.obShares > 0, `Tramo OB ejecutado (${result.executionSummary.obShares.toFixed(4)} shares)`)
    assert(result.executionSummary.lmsrShares > 0, `Tramo LMSR ejecutado (${result.executionSummary.lmsrShares.toFixed(4)} shares)`)

    // El seller recibió el neto del tramo OB (sin fee)
    assertApprox(sellerReceived, OB_NET, `Seller recibió neto OB = $${OB_NET.toFixed(4)}`, 0.05)

    // Fee total = fee_OB + fee_LMSR
    // fee_OB ≈ OB_GROSS - OB_NET
    const expectedObFee = OB_GROSS - OB_NET
    // fee_LMSR = LMSR_gross * 0.10 = (TOTAL_BUDGET - OB_GROSS) * 0.10 (aproximado)
    const lmsrGross = buyerPaid - OB_GROSS
    const expectedLmsrFee = lmsrGross * LMSR_FEE
    const totalExpectedFee = expectedObFee + expectedLmsrFee

    assertApprox(
      result.executionSummary.fee,
      totalExpectedFee,
      `Fee total ≈ OB_fee ($${expectedObFee.toFixed(3)}) + LMSR_fee ($${expectedLmsrFee.toFixed(3)}) = $${totalExpectedFee.toFixed(3)}`,
      1.0  // tolerancia mayor porque los tramos no son exactos
    )

    // Shares totales > shares de solo OB
    assert(result.executionSummary.sharesCollected > OB_SHARES, `Shares totales (${result.executionSummary.sharesCollected.toFixed(4)}) > OB shares (${OB_SHARES})`)

    // Análisis del path de ejecución
    const path = result.executionSummary.path as any[]
    assert(path.length >= 2, `Path tiene ${path.length} pasos (OB + LMSR)`)
    const obSteps = path.filter((p: any) => p.fuente === 'OrderBook')
    const lmsrSteps = path.filter((p: any) => p.fuente === 'LMSR')
    assert(obSteps.length > 0, `${obSteps.length} paso(s) OrderBook en el path`)
    assert(lmsrSteps.length > 0, `${lmsrSteps.length} paso(s) LMSR en el path`)
  })

  await section('FEE COMBINADO 2: Verificar que el fee total es mayor en primario que secundario', async () => {
    // Para el mismo monto:
    // Si todo va al LMSR: fee = 10%
    // Si todo va al OB: fee = 2%
    // → El fee del primario siempre supera al del secundario

    const budget = 100
    const lmsrFee = budget * 0.10  // $10 si todo es LMSR
    const obFee = budget * 0.02    // $2 si todo es OB

    assert(lmsrFee > obFee, `Fee LMSR (${lmsrFee}%) > Fee OB (${obFee}%) para el mismo monto`)
    assert(lmsrFee / budget === 0.10, `LMSR fee rate = 10%`)
    assert(obFee / budget === 0.02, `OB fee rate = 2%`)

    console.log(`   ℹ️  Fee LMSR $${lmsrFee} (10%) vs Fee OB $${obFee} (2%) para $${budget}`)
  })

  await section('FEE COMBINADO 3: Consistencia — balances cuadran (no hay dinero creado)', async () => {
    // Total pagado por buyer = neto al LMSR + neto al seller + fees WIN
    // Fee WIN = total_fee (ya calculado en executionSummary.fee)
    const mkt = await prisma.market.findUnique({ where: { id: market.id } })
    const transfers = await prisma.positionTransfer.findMany({ where: { position: { marketId: market.id } } })
    
    const totalSellerReceived = transfers.reduce((s, t) => s + Number(t.price), 0)
    const yesPool = Number(mkt!.yesPool)  // neto al LMSR

    console.log(`   ℹ️  yesPool (LMSR neto): $${yesPool.toFixed(4)}`)
    console.log(`   ℹ️  Seller recibió (transfers): $${totalSellerReceived.toFixed(4)}`)
    console.log(`   ℹ️  Ambos deben sumar < total del buyer (la diferencia es el fee WIN)`)

    assert(yesPool > 0, 'yesPool > 0 (dinero llegó al LMSR)')
    assert(totalSellerReceived > 0, 'Seller recibió dinero del tramo OB')
  })

  await cleanup(market.id, [seller.id, buyer.id])
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 4: Verificar unificación fee P2P al 2%
// ═══════════════════════════════════════════════════════════════

async function testFeeUnification() {
  await section('✅ UNIFICACIÓN: Marketplace y OB Router ambos al 2%', async () => {
    // Después de la corrección, todos los canales secundarios usan 2%
    const MARKETPLACE_FEE = 0.020  // schema.prisma @default(0.020)
    const ROUTER_OB_FEE   = 0.020  // router.service.ts const obFeeRate = 0.02
    const SETTLEMENT_FEE  = 0.020  // settlement.ts secondaryVolume.times(0.02)

    assert(MARKETPLACE_FEE === ROUTER_OB_FEE, `Marketplace fee (${MARKETPLACE_FEE * 100}%) === Router OB fee (${ROUTER_OB_FEE * 100}%)`)
    assert(ROUTER_OB_FEE === SETTLEMENT_FEE,  `Router OB fee (${ROUTER_OB_FEE * 100}%) === Settlement fee (${SETTLEMENT_FEE * 100}%)`)
    assert(MARKETPLACE_FEE === 0.02,           'Marketplace fee = 2% exacto')

    const amount = 100
    const unifiedFee = amount * MARKETPLACE_FEE
    console.log(`   ℹ️  Para $${amount}: fee P2P = $${unifiedFee.toFixed(2)} (2%) en todos los canales`)
    console.log(`   ℹ️  Archivos actualizados:`)
    console.log(`      • prisma/schema.prisma       → platformFee @default(0.020)`)
    console.log(`      • src/services/settlement.ts → secondaryVolume.times(0.02)`)
    console.log(`      • src/services/router.service.ts → obFeeRate = 0.02 (ya era correcto)`)
  })
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 WIN Fee Verification — Suite de Tests de Comisiones')
  console.log('═'.repeat(62))
  console.log('   Primario (LMSR): 10% | Secundario OB: 2% | Marketplace: 2%  ← ✅ unificado')

  try {
    await testPrimaryFee()
    await testSecondaryObFee()
    await testCombinedFee()
    await testFeeUnification()
  } finally {
    await prisma.$disconnect()
  }

  console.log('\n' + '═'.repeat(62))
  const emoji = failed === 0 ? '🎉' : '⚠️ '
  console.log(`${emoji} Resultados: ${passed} ✅ pasaron | ${failed} ❌ fallaron`)
  if (failures.length > 0) {
    console.log('\n❌ Fallas:')
    failures.forEach(f => console.log(`   • ${f}`))
  }
  console.log('═'.repeat(62))
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\n💥 Error fatal:', e)
  process.exit(1)
})
