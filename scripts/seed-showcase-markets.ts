import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function costFunction(qYes: number, qNo: number, b: number) {
  const maxQ = Math.max(qYes / b, qNo / b)
  return b * (maxQ + Math.log(
    Math.exp(qYes / b - maxQ) + Math.exp(qNo / b - maxQ)
  ))
}

function getSharesToBuy(qYes: number, qNo: number, b: number, side: 'YES' | 'NO', amount: number) {
  let low = 0, high = amount * 10
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    const before = costFunction(qYes, qNo, b)
    const after = side === 'YES'
      ? costFunction(qYes + mid, qNo, b)
      : costFunction(qYes, qNo + mid, b)
    const cost = after - before
    if (Math.abs(cost - amount) < 1e-6) return mid
    if (cost < amount) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function getCostToBuy(qYes: number, qNo: number, b: number, side: 'YES' | 'NO', delta: number) {
  const before = costFunction(qYes, qNo, b)
  const after = side === 'YES'
    ? costFunction(qYes + delta, qNo, b)
    : costFunction(qYes, qNo + delta, b)
  return after - before
}

function getPrice(qYes: number, qNo: number, b: number) {
  const expYes = Math.exp(qYes / b)
  const expNo = Math.exp(qNo / b)
  const sum = expYes + expNo
  return { pYes: expYes / sum, pNo: expNo / sum }
}

async function main() {
  console.log('🌱 Creando Showcase Markets (y recreando gráficos)...')
  const platformFee = 0.10

  // 1. Create mock users
  const usernames = ['carlos_investor', 'maria_trader', 'juan_crypto', 'satoshi_fan', 'bale_fan']
  const testUsers = []
  for (let i = 0; i < usernames.length; i++) {
    const email = `${usernames[i]}@showcase.com`
    const user = await prisma.user.upsert({
      where: { email },
      update: { balance: 5000 },
      create: { username: usernames[i], email, balance: 5000, role: 'USER' }
    })
    testUsers.push(user)
  }

  // Define markets
  const newMarkets = [
    {
      question: "¿Cuál equipo clasificará a semifinales de Champions? (YES=R. Madrid, NO=Bayern)",
      description: "El Clásico de Europa. Ida: 7 de abril, Vuelta: 15 de abril.",
      resolutionDate: new Date('2026-04-15T23:59:59Z'),
      liquidity: 1500,
    },
    {
      question: "¿Terminará algún piloto (fuera de RedBull) 1ro en el GP de Suzuka?",
      description: "F1: El GP de Japón en Suzuka.",
      resolutionDate: new Date('2026-03-29T23:59:59Z'),
      liquidity: 1000,
    },
    {
      question: "¿Logrará Boca Juniors o Flamengo ganar su debut en Copa Libertadores?",
      description: "Debut de los Pesos Pesados. (YES = Al menos uno gana, NO = Ninguno gana)",
      resolutionDate: new Date('2026-04-09T23:59:59Z'),
      liquidity: 1500,
    }
  ]

  for (const m of newMarkets) {
    const b = m.liquidity / Math.log(2)
    const seedCost = m.liquidity

    let market = await prisma.market.findFirst({ where: { question: m.question } })
    if (market) {
      console.log(`🗑  Borrando mercado existente para regenerarlo: ${m.question}`)
      await prisma.lmsrSnapshot.deleteMany({ where: { marketId: market.id } })
      await prisma.position.deleteMany({ where: { marketId: market.id } })
      await prisma.market.delete({ where: { id: market.id } })
    }

    const tZero = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // Start chart 5 days ago

    market = await prisma.market.create({
      data: {
        question: m.question,
        description: m.description,
        status: 'ACTIVE',
        b,
        qYes: 0,
        qNo: 0,
        seedCost,
        yesPool: 0,
        noPool: 0,
        maxPool: 50000,
        platformFee: platformFee,
        resolutionDate: m.resolutionDate,
        createdAt: tZero, // Market created 5 days ago
        lmsrSnapshots: {
          create: {
            qYesBefore: 0, qNoBefore: 0, pYesBefore: 0.5,
            side: 'INIT', deltaShares: 0, cost: seedCost,
            qYesAfter: 0, qNoAfter: 0, pYesAfter: 0.5,
            triggerType: 'INIT', userId: 'SYSTEM',
            createdAt: tZero
          }
        }
      }
    })
    console.log(`✅ Creado Market: ${m.question} con b=${b.toFixed(2)} (Liq=${m.liquidity})`)

    // Simulate Primary Market Purchases (spread across last 5 days for charts)
    let qYes = market.qYes
    let qNo = market.qNo
    let yesPool = 0
    let noPool = 0
    let currentTime = new Date(tZero.getTime() + 1000) // Start right after creation

    for (let i = 0; i < 20; i++) {
        // Random time jump, between 1 to 6 hours
        currentTime = new Date(currentTime.getTime() + Math.random() * 6 * 60 * 60 * 1000)

        const user = testUsers[Math.floor(Math.random() * testUsers.length)]
        
        // Let's add occasional volatility but mostly normal
        const ratio = qYes > qNo ? (qYes / (qYes + qNo + 1)) : (qNo / (qYes + qNo + 1))
        let side = Math.random() > 0.45 ? 'YES' : 'NO' 
        // Force trend for realistic visuals:
        if (m.question.includes('Suzuka')) {
            // Unlikely to win against RedBull -> mostly NO volume, but some YES speculation
            side = Math.random() > 0.25 ? 'NO' : 'YES'
        } else if (m.question.includes('Boca') && i > 5) {
            // Trending to YES
            side = Math.random() > 0.3 ? 'YES' : 'NO'
        }

        const amount = Math.floor(Math.random() * 300) + 10 // $10 to $310
        const netAmount = amount * (1 - platformFee)

        const beforePrice = getPrice(qYes, qNo, b)
        const pYesBefore = beforePrice.pYes
        const qYesBefore = qYes
        const qNoBefore = qNo

        const shares = getSharesToBuy(qYes, qNo, b, side as "YES"|"NO", netAmount)
        const cost = getCostToBuy(qYes, qNo, b, side as "YES"|"NO", shares)

        await prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: amount } } })
        
        await prisma.position.create({
            data: {
                marketId: market.id,
                originalOwnerId: user.id,
                currentOwnerId: user.id,
                side,
                amount,
                status: 'ACTIVE',
                shares,
                avgCostPerShare: cost / shares,
                totalCost: cost,
                createdAt: currentTime
            }
        })

        if (side === 'YES') {
            qYes += shares
            yesPool += amount
        } else {
            qNo += shares
            noPool += amount
        }

        const afterPrice = getPrice(qYes, qNo, b)
        
        // Snapshot
        await prisma.lmsrSnapshot.create({
            data: {
                marketId: market.id,
                userId: user.id,
                triggerType: 'BUY',
                qYesBefore, qNoBefore, pYesBefore,
                side,
                deltaShares: shares,
                cost,
                qYesAfter: qYes, qNoAfter: qNo, pYesAfter: afterPrice.pYes,
                createdAt: currentTime
            }
        })

        console.log(`    -> [${currentTime.toISOString()}] User ${user.username} bought ${side} for $${amount}`)
    }

    // Final update of qYes / qNo to Market
    await prisma.market.update({
        where: { id: market.id },
        data: { qYes, qNo, yesPool, noPool }
    })

    // Simulate Secondary Market (Listings and Orders)
    const positions = await prisma.position.findMany({ where: { marketId: market.id, isForSale: false } })
    if (positions.length > 0) {
        const posToSell = positions[0]
        const sharesToSell = posToSell.shares * 0.5
        const askPricePerShare = (posToSell.avgCostPerShare * 1.5)
        const askePriceGross = sharesToSell * askPricePerShare

        const listing = await prisma.marketplaceListing.create({
            data: {
                positionId: posToSell.id,
                marketId: market.id,
                sellerId: posToSell.currentOwnerId,
                askPrice: askePriceGross,
                suggestedPrice: askePriceGross,
                shares: sharesToSell,
                askPricePerShare: askPricePerShare,
                fairValueAtListing: askPricePerShare * sharesToSell,
                status: 'ACTIVE'
            }
        })
        await prisma.position.update({ where: { id: posToSell.id }, data: { isForSale: true } })
        console.log(`    -> User listed secondary position: ${sharesToSell.toFixed(2)} shares at $${askPricePerShare.toFixed(2)}`)
    }
  }

  console.log('🎉 Showcase markets seeded con gráficos y fechas correctas!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
