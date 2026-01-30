import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({})

async function main() {
  console.log('🌱 Seeding database...')

  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@wsm.com',
        role: 'ADMIN',
        balance: 10000,
      },
    }),
    prisma.user.create({
      data: {
        username: 'juan_futbol',
        email: 'juan@example.com',
        balance: 1000,
      },
    }),
    prisma.user.create({
      data: {
        username: 'maria_sports',
        email: 'maria@example.com',
        balance: 1000,
      },
    }),
    prisma.user.create({
      data: {
        username: 'pedro_trader',
        email: 'pedro@example.com',
        balance: 1000,
      },
    }),
    prisma.user.create({
      data: {
        username: 'carlos_bet',
        email: 'carlos@example.com',
        balance: 1000,
      },
    }),
  ])

  console.log('✅ Created users:', users.map((u) => u.username))

  const markets = await Promise.all([
    prisma.market.create({
      data: {
        playerName: 'Alexis Mac Allister',
        question: '¿Mac Allister será transferido antes del cierre del mercado?',
        description: 'Mediocampista del Liverpool con interés de Barcelona y Real Madrid',
        status: 'ACTIVE',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
    prisma.market.create({
      data: {
        playerName: 'Emiliano Martínez',
        question: '¿Dibu Martínez cambiará de club esta temporada?',
        description: 'Arquero del Aston Villa con interés del Bayern Munich',
        status: 'ACTIVE',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
    prisma.market.create({
      data: {
        playerName: 'Enzo Fernández',
        question: '¿Enzo Fernández dejará el Chelsea en verano?',
        description: 'Mediocampista del Chelsea podría volver a Argentina',
        status: 'DRAFT',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
  ])

  console.log('✅ Created markets:', markets.map((m) => m.playerName))
  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
