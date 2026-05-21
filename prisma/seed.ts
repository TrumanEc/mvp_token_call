import { PrismaClient } from '@prisma/client'
import { LmsrService } from '../src/services/lmsr.service'

const prisma = new PrismaClient({})

async function main() {
  console.log('🌱 Seeding database...')

  const usersData = [
    { username: 'admin',        email: 'admin@wsm.com',             role: 'ADMIN', balance: 10000 },
    { username: 'juan_futbol',  email: 'juan@example.com',          balance: 1000 },
    { username: 'maria_sports', email: 'maria@example.com',         balance: 1000 },
    { username: 'pedro_trader', email: 'pedro@example.com',         balance: 1000 },
    { username: 'carlos_bet',   email: 'carlos@example.com',        balance: 1000 },
    { username: 'Tecnico',      email: 'esteban@win.investments',   balance: 1000 },
  ]

  const users = []
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { username: u.username, role: u.role ?? 'USER' },
      create: u,
    })
    users.push(user)
  }
  console.log('✅ Users:', users.map(u => u.username))

  const lmsrService = new LmsrService()

  async function createMarket(data: {
    playerName?: string
    question: string
    description: string
    sport: string
    resolutionDate: Date
    outcomes: { name: string; probability: number }[]
    b?: number
    alpha?: number
    bMin?: number
    imageUrl?: string
    bannerUrl?: string
    isFeatured?: boolean
  }) {
    const existing = await prisma.market.findFirst({ where: { question: data.question } })
    if (existing) {
      // Update images if provided
      if (data.imageUrl || data.bannerUrl) {
        await prisma.market.update({
          where: { id: existing.id },
          data: {
            imageUrl: data.imageUrl ?? existing.imageUrl,
            bannerUrl: data.bannerUrl ?? existing.bannerUrl,
            isFeatured: data.isFeatured ?? existing.isFeatured,
          },
        })
      }
      console.log(`  ↩ Ya existe: ${data.question}`)
      return existing
    }

    const b = data.b ?? 100
    const params = { b, alpha: data.alpha ?? null, bMin: data.bMin ?? null }
    const priors = data.outcomes.map(o => o.probability)
    const qValues = lmsrService.getInitialQValuesLSN(params, priors)
    const seedCost = lmsrService.getSeedCostLSN(params, data.outcomes.length)
    const prices  = lmsrService.getPricesLSN(qValues, params)
    const oddsMap: Record<string, number> = {}
    data.outcomes.forEach((o, i) => { oddsMap[o.name] = prices[i] * 100 })

    return prisma.market.create({
      data: {
        playerName: data.playerName,
        question: data.question,
        description: data.description,
        status: 'ACTIVE',
        sport: data.sport,
        resolutionDate: data.resolutionDate,
        b,
        alpha: data.alpha ?? null,
        bMin: data.bMin ?? null,
        seedCost,
        imageUrl: data.imageUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        isFeatured: data.isFeatured ?? false,
        outcomes: {
          create: data.outcomes.map((o, i) => ({
            name: o.name,
            qOutstanding: qValues[i],
            displayOrder: i,
          })),
        },
        history: { create: { odds: oddsMap, totalPool: 0 } },
      },
      include: { outcomes: true },
    })
  }

  // ── 3 MARKETS DE PRUEBA ───────────────────────────────────────────────────

  // 1. Binario YES/NO
  await createMarket({
    playerName: 'Alexis Mac Allister',
    question: '¿Mac Allister será transferido antes del cierre del mercado?',
    description: 'Mediocampista del Liverpool con interés de Barcelona y Real Madrid',
    sport: 'futbol',
    resolutionDate: new Date('2026-08-31'),
    outcomes: [
      { name: 'YES', probability: 0.62 },
      { name: 'NO',  probability: 0.38 },
    ],
    b: 100,
    imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1400&q=85',
    isFeatured: false,
  })

  // 2. Multi-outcome (N>2)
  await createMarket({
    playerName: 'Copa Mundial 2026',
    question: '¿Quién ganará la Copa Mundial 2026?',
    description: 'El Mundial se juega en USA, Canadá y México — 48 equipos por primera vez.',
    sport: 'copa_mundial',
    resolutionDate: new Date('2026-07-19'),
    outcomes: [
      { name: 'Argentina', probability: 0.22 },
      { name: 'Francia',   probability: 0.18 },
      { name: 'España',    probability: 0.15 },
      { name: 'Brasil',    probability: 0.12 },
      { name: 'Otro',      probability: 0.33 },
    ],
    b: 100,
    imageUrl: 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1400&q=85',
    isFeatured: true,
  })

  // 3. Binario F1 con LS-LMSR
  await createMarket({
    playerName: 'Lewis Hamilton',
    question: '¿Hamilton ganará al menos 3 carreras con Ferrari en 2026?',
    description: 'El heptacampeón debuta con la Scuderia en busca de gloria.',
    sport: 'f1',
    resolutionDate: new Date('2026-11-29'),
    outcomes: [
      { name: 'YES', probability: 0.47 },
      { name: 'NO',  probability: 0.53 },
    ],
    b: 100,
    alpha: 0.10,
    bMin: 100,
    imageUrl: 'https://images.unsplash.com/photo-1698776696462-fb79dde2aabb?w=800&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1541789094913-f3809b7d1e4f?w=1400&q=85',
    isFeatured: false,
  })

  console.log('🎉 3 mercados creados. Seeding completo!')
}

main()
  .catch(e => { console.error('❌ Seeding error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
