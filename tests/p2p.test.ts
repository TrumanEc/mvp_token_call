/**
 * ============================================================
 * TESTS P2P — Mercado Secundario WIN
 * ============================================================
 * Corre contra la DB real de Supabase (env .env)
 * Uso: npx tsx tests/p2p.test.ts
 *
 * Usa DIRECT_URL para evitar timeouts del connection pooler
 * en transacciones de Prisma.
 * ============================================================
 */

import 'dotenv/config'

// ⚡ Usar DIRECT_URL para que los $transaction de Prisma no expiren
// en el pooler de Supabase. Esto afecta tanto al cliente local
// como al cliente importado por ListingService (src/lib/prisma.ts).
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL
}

import { PrismaClient } from '@prisma/client'
import Decimal from 'decimal.js'
import { ListingService } from '../src/services/listing'
import { LmsrService } from '../src/services/lmsr.service'

// Usar DIRECT_URL para evitar timeout del pooler de Supabase en $transaction
const prisma = new PrismaClient()

// ─── Runner ───────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(ok: boolean, msg: string) {
  if (ok) { console.log(`  ✅ ${msg}`); passed++ }
  else     { console.log(`  ❌ ${msg}`); failed++; failures.push(msg) }
}

function approxEqual(a: number, b: number, tol = 0.05) {
  return Math.abs(a - b) <= tol
}

function assertApprox(a: number, b: number, msg: string, tol = 0.05) {
  const ok = approxEqual(a, b, tol)
  assert(ok, `${msg} (got ${a.toFixed(4)}, expected ≈${b.toFixed(4)})`)
}

async function section(title: string, fn: () => Promise<void>) {
  console.log(`\n${'─'.repeat(62)}`)
  console.log(`📋 ${title}`)
  console.log('─'.repeat(62))
  try {
    await fn()
  } catch (e: any) {
    console.log(`  💥 FATAL: ${e.message}`)
    failed++
    failures.push(`[${title}]: ${e.message}`)
  }
}

// ─── Helpers de DB ────────────────────────────────────────────

async function createTestMarket() {
  return prisma.market.create({
    data: {
      question: `__TEST_P2P_${Date.now()}__`,
      status: 'ACTIVE',
      b: 100,
      qYes: 10,
      qNo: 10,
      seedCost: 69.31,
      resolutionDate: new Date('2030-01-01'),
      yesPool: new Decimal(0),
      noPool: new Decimal(0),
    },
  })
}

async function createTestUser(tag: string, balance: number) {
  const ts = Date.now()
  return prisma.user.create({
    data: {
      email: `p2p_${tag}_${ts}@test.win`,
      username: `p2p_${tag}_${ts}`,
      balance: new Decimal(balance),
    },
  })
}

async function createTestPosition(marketId: string, ownerId: string, side: 'YES' | 'NO', shares = 1.8) {
  return prisma.position.create({
    data: {
      marketId,
      originalOwnerId: ownerId,
      currentOwnerId: ownerId,
      side,
      amount: new Decimal(100),
      shares,
      avgCostPerShare: 55.56,
      totalCost: 100,
      initialProbability: new Decimal(0.5),
      status: 'ACTIVE',
    },
  })
}

async function cleanupByMarket(marketId: string) {
  await prisma.positionTransfer.deleteMany({ where: { position: { marketId } } })
  await prisma.marketplaceListing.deleteMany({ where: { marketId } })
  await prisma.position.deleteMany({ where: { marketId } })
  await prisma.market.delete({ where: { id: marketId } }).catch(() => {})
}

async function cleanupUsers(ids: string[]) {
  for (const id of ids) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
}

// ─── TESTS ────────────────────────────────────────────────────

async function test1_lmsrPrices() {
  await section('TEST 1: Motor LMSR — Precios y costos', async () => {
    const lmsr = new LmsrService()

    // Precio inicial balanceado
    const { pYes, pNo } = lmsr.getPrice(10, 10, 100)
    assertApprox(pYes, 0.5, 'pYes = 0.50 (qYes === qNo)')
    assertApprox(pNo, 0.5, 'pNo = 0.50 (qYes === qNo)')
    assert(Math.abs(pYes + pNo - 1) < 0.0001, 'pYes + pNo = 1.0')

    // Precio sesgado YES
    const { pYes: pBiased } = lmsr.getPrice(30, 10, 100)
    assert(pBiased > 0.5, `pYes = ${pBiased.toFixed(3)} > 0.5 cuando qYes > qNo`)

    // Costo por 1 share YES
    const cost1 = lmsr.getCostToBuy(10, 10, 100, 'YES', 1)
    assert(cost1 > 0, `Costo por 1 share YES = $${cost1.toFixed(4)} > 0`)
    assertApprox(cost1, 0.5, 'Costo ≈ $0.50 a 50/50 (=precio instantáneo)', 0.1)

    // Max loss del market maker
    const maxLoss = lmsr.getMaxLoss(100)
    assertApprox(maxLoss, 69.31, 'Max loss = b·ln(2) ≈ $69.31', 0.5)

    console.log(`   ℹ️  pYes=${pYes.toFixed(4)}, pNo=${pNo.toFixed(4)}, cost/share=${cost1.toFixed(4)}`)
  })
}

async function test2_createListing() {
  const market = await createTestMarket()
  const seller = await createTestUser('seller', 1000)
  const pos = await createTestPosition(market.id, seller.id, 'YES')
  let listingId: string

  await section('TEST 2: Crear listing', async () => {
    const listing = await ListingService.create({
      positionId: pos.id,
      userId: seller.id,
      askPrice: 90,
    })
    listingId = listing.id

    assert(listing.status === 'ACTIVE', 'Listing.status = ACTIVE')
    assertApprox(Number(listing.askPrice), 90, 'askPrice = $90')
    assert(listing.sellerId === seller.id, 'sellerId correcto')
    assert(listing.positionId === pos.id, 'positionId correcto')
    assert(listing.marketId === market.id, 'marketId correcto')
    assertApprox(listing.shares, 1.8, 'shares = 1.8', 0.01)

    // Position marcada isForSale
    const p = await prisma.position.findUnique({ where: { id: pos.id } })
    assert(p?.isForSale === true, 'Position.isForSale = true')
    console.log(`   ℹ️  fairValueAtListing = $${listing.fairValueAtListing.toFixed(4)}`)
  })

  await section('TEST 2b: No se puede listar posición ya en venta', async () => {
    try {
      await ListingService.create({ positionId: pos.id, userId: seller.id, askPrice: 80 })
      assert(false, 'Debería haber lanzado error')
    } catch (e: any) {
      assert(e.message === 'Position already listed', `Error correcto: "${e.message}"`)
    }
  })

  await section('TEST 2c: Otro usuario no puede listar posición ajena', async () => {
    const other = await createTestUser('intruder', 500)
    const otherPos = await createTestPosition(market.id, other.id, 'NO')
    try {
      await ListingService.create({ positionId: pos.id, userId: other.id, askPrice: 50 })
      assert(false, 'Debería haber lanzado error')
    } catch (e: any) {
      assert(e.message === 'Not position owner', `Error correcto: "${e.message}"`)
    }
    await prisma.position.delete({ where: { id: otherPos.id } })
    await cleanupUsers([other.id])
  })

  await cleanupByMarket(market.id)
  await cleanupUsers([seller.id])
}

async function test3_fullBuy() {
  const market = await createTestMarket()
  const seller = await createTestUser('seller', 1000)
  const buyer  = await createTestUser('buyer', 1000)
  const pos = await createTestPosition(market.id, seller.id, 'YES')

  const listing = await ListingService.create({
    positionId: pos.id,
    userId: seller.id,
    askPrice: 90,
  })

  await section('TEST 3: Seller no puede comprar su propio listing', async () => {
    try {
      await ListingService.buy({ listingId: listing.id, buyerId: seller.id })
      assert(false, 'Debería haber lanzado error')
    } catch (e: any) {
      assert(e.message === 'Cannot buy own listing', `Error correcto: "${e.message}"`)
    }
  })

  await section('TEST 4: Compra completa (full buy)', async () => {
    const askPrice = 90
    const platformFee = 0.025
    const sellerNet = askPrice * (1 - platformFee)  // $87.75
    const winFee = askPrice * platformFee             // $2.25

    const sellerBefore = await prisma.user.findUnique({ where: { id: seller.id } })
    const buyerBefore  = await prisma.user.findUnique({ where: { id: buyer.id } })

    await ListingService.buy({ listingId: listing.id, buyerId: buyer.id })

    const sellerAfter = await prisma.user.findUnique({ where: { id: seller.id } })
    const buyerAfter  = await prisma.user.findUnique({ where: { id: buyer.id } })

    const sellerDelta = Number(sellerAfter!.balance) - Number(sellerBefore!.balance)
    const buyerDelta  = Number(buyerAfter!.balance)  - Number(buyerBefore!.balance)

    assertApprox(sellerDelta, sellerNet, `Seller recibió $${sellerNet.toFixed(2)} (net 97.5%)`)
    assertApprox(buyerDelta, -askPrice, `Buyer pagó $${askPrice.toFixed(2)}`)

    // Ownership transfer
    const p = await prisma.position.findUnique({ where: { id: pos.id } })
    assert(p?.currentOwnerId === buyer.id, 'Position.currentOwnerId = buyer')
    assert(p?.isForSale === false, 'Position.isForSale = false')

    // Listing SOLD
    const l = await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })
    assert(l?.status === 'SOLD', 'Listing.status = SOLD')
    assert(l?.buyerId === buyer.id, 'Listing.buyerId = buyer')
    assert(l?.soldAt !== null, 'Listing.soldAt registrado')

    // PositionTransfer creado
    const transfer = await prisma.positionTransfer.findFirst({
      where: { positionId: pos.id, toUserId: buyer.id },
    })
    assert(transfer !== null, 'PositionTransfer creado')
    assert(transfer?.fromUserId === seller.id, 'Transfer.fromUserId = seller')
    assertApprox(Number(transfer?.price), askPrice, 'Transfer.price = $90')
    assert(transfer?.listingId === listing.id, 'Transfer.listingId correcto')

    console.log(`   ℹ️  Fee WIN: $${winFee.toFixed(2)} | Seller neto: $${sellerNet.toFixed(2)}`)
  })

  await section('TEST 5: Nuevo owner puede re-listar la posición', async () => {
    // Leer la posición actualizada para obtener el currentOwnerId correcto
    const updatedPos = await prisma.position.findUnique({ where: { id: pos.id } })
    assert(updatedPos?.currentOwnerId === buyer.id, 'Position.currentOwnerId = buyer (pre-check)')

    const listing2 = await ListingService.create({
      positionId: pos.id,
      userId: buyer.id,
      askPrice: 95,
    })
    assert(listing2.status === 'ACTIVE', 'Re-listing ACTIVE')
    assertApprox(Number(listing2.askPrice), 95, 'askPrice = $95')
    assert(listing2.sellerId === buyer.id, 'sellerId = buyer (nuevo owner)')

    // Cancelar para cleanup
    await ListingService.cancel(listing2.id, buyer.id)
    const l = await prisma.marketplaceListing.findUnique({ where: { id: listing2.id } })
    assert(l?.status === 'CANCELLED', 'Listing cancelado correctamente')
  })

  await cleanupByMarket(market.id)
  await cleanupUsers([seller.id, buyer.id])
}

async function test4_partialBuy() {
  const market = await createTestMarket()
  const seller = await createTestUser('seller', 1000)
  const buyer  = await createTestUser('buyer', 500)
  const pos = await createTestPosition(market.id, seller.id, 'YES', 2.0)

  const listing = await ListingService.create({
    positionId: pos.id,
    userId: seller.id,
    askPrice: 100,
  })

  await section('TEST 6: Compra parcial (50%) del listing', async () => {
    const fullPrice    = 100
    const partialAmt   = 50     // 50% del listing
    const platformFee  = 0.025
    const sellerNet    = partialAmt * (1 - platformFee)  // $48.75

    const sellerBefore = await prisma.user.findUnique({ where: { id: seller.id } })
    const buyerBefore  = await prisma.user.findUnique({ where: { id: buyer.id } })

    await ListingService.buy({ listingId: listing.id, buyerId: buyer.id, amount: partialAmt })

    const sellerAfter = await prisma.user.findUnique({ where: { id: seller.id } })
    const buyerAfter  = await prisma.user.findUnique({ where: { id: buyer.id } })

    const sellerDelta = Number(sellerAfter!.balance) - Number(sellerBefore!.balance)
    const buyerDelta  = Number(buyerAfter!.balance)  - Number(buyerBefore!.balance)

    assertApprox(sellerDelta, sellerNet, `Seller recibió ≈$${sellerNet.toFixed(2)} (net 97.5%)`)
    assertApprox(buyerDelta, -partialAmt, `Buyer pagó $${partialAmt.toFixed(2)}`)

    // Listing sigue ACTIVE con precio reducido
    const l = await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })
    assert(l?.status === 'ACTIVE', 'Listing sigue ACTIVE tras compra parcial')
    assertApprox(Number(l!.askPrice), fullPrice - partialAmt, `Listing.askPrice reducido a ≈$${(fullPrice - partialAmt).toFixed(2)}`)
    assertApprox(l!.shares, 2.0 / 2, `Listing.shares reducido a ≈${(2.0 / 2).toFixed(2)}`, 0.05)

    // Nueva position creada para el buyer
    const buyerPos = await prisma.position.findFirst({
      where: { currentOwnerId: buyer.id, marketId: market.id },
    })
    assert(buyerPos !== null, 'Nueva Position creada para comprador parcial')
    assertApprox(buyerPos!.shares, 2.0 / 2, `Buyer shares ≈ ${(2.0 / 2).toFixed(2)}`, 0.05)
    assert(buyerPos?.side === 'YES', 'Position.side = YES')

    // Transfer parcial registrado
    const transfer = await prisma.positionTransfer.findFirst({
      where: { toUserId: buyer.id },
    })
    assert(transfer !== null, 'PositionTransfer creado para compra parcial')
    assertApprox(Number(transfer?.price), partialAmt, `Transfer.price ≈ $${partialAmt}`)

    console.log(`   ℹ️  OK: Listing restante = $${Number(l!.askPrice).toFixed(2)}, shares restantes = ${l!.shares.toFixed(4)}`)
  })

  await section('TEST 7: Cancelar listing restante', async () => {
    await ListingService.cancel(listing.id, seller.id)
    const l = await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })
    assert(l?.status === 'CANCELLED', 'Listing.status = CANCELLED')
    assert(l?.cancelledAt !== null, 'Listing.cancelledAt registrado')

    const p = await prisma.position.findUnique({ where: { id: pos.id } })
    assert(p?.isForSale === false, 'Position.isForSale = false tras cancelar')
  })

  await cleanupByMarket(market.id)
  await cleanupUsers([seller.id, buyer.id])
}

async function test5_edgeCases() {
  const market = await createTestMarket()
  const seller = await createTestUser('seller', 1000)
  const broke  = await createTestUser('broke', 10)   // Solo $10
  const pos = await createTestPosition(market.id, seller.id, 'YES')

  const listing = await ListingService.create({
    positionId: pos.id,
    userId: seller.id,
    askPrice: 500,  // Mucho más de lo que tiene broke
  })

  await section('TEST 8: Saldo insuficiente rechazado', async () => {
    try {
      await ListingService.buy({ listingId: listing.id, buyerId: broke.id })
      assert(false, 'Debería rechazar por saldo insuficiente')
    } catch (e: any) {
      assert(e.message === 'Insufficient balance', `Error correcto: "${e.message}"`)
    }
  })

  await section('TEST 9: Cancelar listing de mercado ACTIVE', async () => {
    await ListingService.cancel(listing.id, seller.id)
    const l = await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })
    assert(l?.status === 'CANCELLED', 'Listing cancelado')

    // No se puede volver a cancelar
    try {
      await ListingService.cancel(listing.id, seller.id)
      assert(false, 'Debería rechazar re-cancelar')
    } catch (e: any) {
      assert(e.message === 'Listing not active', `Error correcto: "${e.message}"`)
    }
  })

  await cleanupByMarket(market.id)
  await cleanupUsers([seller.id, broke.id])
}

async function test6_statsIntegrity() {
  const market = await createTestMarket()
  const seller = await createTestUser('seller', 1000)
  const buyer  = await createTestUser('buyer', 1000)

  // Crear 3 posiciones y hacer 3 trades
  const positions = await Promise.all([
    createTestPosition(market.id, seller.id, 'YES', 1.0),
    createTestPosition(market.id, seller.id, 'YES', 1.5),
    createTestPosition(market.id, seller.id, 'NO', 2.0),
  ])

  await section('TEST 10: Múltiples trades — integridad de stats', async () => {
    const prices = [50, 80, 60]

    for (let i = 0; i < 3; i++) {
      const l = await ListingService.create({
        positionId: positions[i].id,
        userId: seller.id,
        askPrice: prices[i],
      })
      await ListingService.buy({ listingId: l.id, buyerId: buyer.id })
    }

    const transfers = await prisma.positionTransfer.findMany({
      where: { position: { marketId: market.id } },
    })
    assert(transfers.length === 3, `3 PositionTransfers registrados (got ${transfers.length})`)

    const totalVolume = transfers.reduce((s, t) => s + Number(t.price), 0)
    const expectedVolume = prices.reduce((s, p) => s + p, 0) // 190
    assertApprox(totalVolume, expectedVolume, `Volumen total ≈ $${expectedVolume}`, 1)

    // Calcular fee WIN (2.5% sobre cada transacción bruta)
    const winFees = transfers.reduce((s, t) => {
      const net = Number(t.price)
      const fee = (net / 0.975) - net  // back-calculate gross
      return s + fee
    }, 0)

    console.log(`   ℹ️  Transfers:     ${transfers.length}`)
    console.log(`   ℹ️  Volumen total: $${totalVolume.toFixed(2)}`)
    console.log(`   ℹ️  Fees WIN:      $${winFees.toFixed(2)}`)

    assert(totalVolume > 0, 'Volumen P2P > $0')
    assert(winFees > 0, `Fees WIN > $0 (got $${winFees.toFixed(2)})`)

    // Todos los transfers tienen listingId (no son transfers primarios)
    const allHaveListingId = transfers.every(t => t.listingId !== null)
    assert(allHaveListingId, 'Todos los transfers tienen listingId (son P2P)')
  })

  await cleanupByMarket(market.id)
  await cleanupUsers([seller.id, buyer.id])
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 WIN P2P Marketplace — Suite de Tests')
  console.log('═'.repeat(62))
  console.log(`   DB: ${(process.env.DIRECT_URL || process.env.DATABASE_URL || '').split('@').pop()}`)

  try {
    await test1_lmsrPrices()
    await test2_createListing()
    await test3_fullBuy()
    await test4_partialBuy()
    await test5_edgeCases()
    await test6_statsIntegrity()
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
  console.error('\n💥 Error fatal en runner:', e)
  process.exit(1)
})
