import { PrismaClient } from '@prisma/client'
import { LmsrService } from '../src/services/lmsr.service'

const prisma = new PrismaClient()
const lmsr = new LmsrService()

async function main() {
  console.log('Creando Showcase Markets (con graficos)...')

  const usernames = ['carlos_investor', 'maria_trader', 'juan_crypto', 'satoshi_fan', 'bale_fan']
  const testUsers = []
  for (const un of usernames) {
    const email = `${un}@showcase.com`
    const user = await prisma.user.upsert({
      where: { email },
      update: { balance: 5000 },
      create: { username: un, email, balance: 5000, role: 'USER' }
    })
    testUsers.push(user)
  }

  const newMarkets = [
    {
      question: "Cual equipo clasificara a semifinales de Champions? (YES=R. Madrid, NO=Bayern)",
      description: "El Clasico de Europa.",
      resolutionDate: new Date('2026-04-15T23:59:59Z'),
      b: 100,
    },
    {
      question: "Terminara algun piloto (fuera de RedBull) 1ro en el GP de Suzuka?",
      description: "F1: El GP de Japon en Suzuka.",
      resolutionDate: new Date('2026-03-29T23:59:59Z'),
      b: 100,
    },
    {
      question: "Lograra Boca Juniors o Flamengo ganar su debut en Copa Libertadores?",
      description: "Debut de los Pesos Pesados.",
      resolutionDate: new Date('2026-04-09T23:59:59Z'),
      b: 100,
    }
  ]

  for (const m of newMarkets) {
    let market = await prisma.market.findFirst({ where: { question: m.question } })
    if (market) {
      console.log(`Borrando mercado existente para regenerarlo: ${m.question}`)
      await prisma.lmsrSnapshot.deleteMany({ where: { marketId: market.id } })
      await prisma.position.deleteMany({ where: { marketId: market.id } })
      await prisma.marketOutcome.deleteMany({ where: { marketId: market.id } })
      await prisma.market.delete({ where: { id: market.id } })
    }

    const tZero = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const params = { b: m.b, alpha: null, bMin: null }
    const priors = [0.5, 0.5]
    const qValues = lmsr.getInitialQValuesLSN(params, priors)
    const seedCost = lmsr.getSeedCostLSN(params, 2)

    const initialPrices = lmsr.getPricesLSN(qValues, params)

    const createdMarket = await prisma.market.create({
      data: {
        question: m.question,
        description: m.description,
        status: 'ACTIVE',
        b: m.b,
        seedCost,
        totalPool: 0,
        platformFee: 0.10,
        resolutionDate: m.resolutionDate,
        createdAt: tZero,
        outcomes: {
          create: [
            { name: 'YES', qOutstanding: qValues[0], displayOrder: 0 },
            { name: 'NO', qOutstanding: qValues[1], displayOrder: 1 },
          ],
        },
        lmsrSnapshots: {
          create: {
            qBefore: { YES: qValues[0], NO: qValues[1] },
            qAfter: { YES: qValues[0], NO: qValues[1] },
            pBefore: { YES: initialPrices[0], NO: initialPrices[1] },
            pAfter: { YES: initialPrices[0], NO: initialPrices[1] },
            side: 'INIT', deltaShares: 0, cost: seedCost,
            triggerType: 'INIT', userId: 'SYSTEM',
            createdAt: tZero,
          },
        },
      },
      include: { outcomes: { orderBy: { displayOrder: 'asc' } } },
    })
    market = createdMarket
    console.log(`Creado Market: ${m.question} con b=${m.b}`)

    const yesOutcome = createdMarket.outcomes[0]
    const noOutcome = createdMarket.outcomes[1]
    let qVec = [yesOutcome.qOutstanding, noOutcome.qOutstanding]
    let currentTime = new Date(tZero.getTime() + 1000)

    for (let i = 0; i < 20; i++) {
      currentTime = new Date(currentTime.getTime() + Math.random() * 6 * 60 * 60 * 1000)
      const user = testUsers[Math.floor(Math.random() * testUsers.length)]

      let sideIdx = Math.random() > 0.45 ? 0 : 1
      if (m.question.includes('Suzuka')) {
        sideIdx = Math.random() > 0.25 ? 1 : 0
      } else if (m.question.includes('Boca') && i > 5) {
        sideIdx = Math.random() > 0.3 ? 0 : 1
      }

      const amount = Math.floor(Math.random() * 300) + 10
      const netAmount = amount * 0.9

      const pBefore = lmsr.getPricesLSN(qVec, params)
      const qBefore = [...qVec]

      const shares = lmsr.getSharesToBuyLSN(qVec, params, sideIdx, netAmount)
      const outcome = sideIdx === 0 ? yesOutcome : noOutcome

      await prisma.position.create({
        data: {
          marketId: market.id,
          outcomeId: outcome.id,
          originalOwnerId: user.id,
          currentOwnerId: user.id,
          side: outcome.name,
          amount,
          status: 'ACTIVE',
          shares,
          avgCostPerShare: netAmount / shares,
          totalCost: netAmount,
          createdAt: currentTime,
        },
      })

      qVec[sideIdx] += shares

      const pAfter = lmsr.getPricesLSN(qVec, params)

      await prisma.lmsrSnapshot.create({
        data: {
          marketId: market.id,
          userId: user.id,
          triggerType: 'BUY',
          outcomeId: outcome.id,
          qBefore: { YES: qBefore[0], NO: qBefore[1] },
          qAfter: { YES: qVec[0], NO: qVec[1] },
          pBefore: { YES: pBefore[0], NO: pBefore[1] },
          pAfter: { YES: pAfter[0], NO: pAfter[1] },
          side: outcome.name,
          deltaShares: shares,
          cost: netAmount,
          createdAt: currentTime,
        },
      })
    }

    // Update outcomes q values
    await prisma.marketOutcome.update({
      where: { id: yesOutcome.id },
      data: { qOutstanding: qVec[0] },
    })
    await prisma.marketOutcome.update({
      where: { id: noOutcome.id },
      data: { qOutstanding: qVec[1] },
    })
  }

  console.log('Showcase markets seeded con graficos y fechas correctas!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
