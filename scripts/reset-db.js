/**
 * 🔄 Database Reset & Seed Script
 * 
 * Borra TODOS los datos y recrea datos iniciales para testing:
 *   - 3 usuarios de prueba (admin, alice, bob) con $1000 cada uno
 *   - 2 mercados LMSR activos listos para tradear
 *   - 1 mercado en DRAFT para probar activación
 * 
 * Usage: node scripts/reset-db.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  🔄 Database Reset & Seed                          ║')
  console.log('╚════════════════════════════════════════════════════╝')

  // ─── Step 1: Borrar todo (en orden por foreign keys) ───
  console.log('\n🗑️  Borrando todos los datos...')
  
  await prisma.positionTransfer.deleteMany({})
  console.log('  ✓ PositionTransfers eliminados')
  
  await prisma.marketplaceListing.deleteMany({})
  console.log('  ✓ MarketplaceListings eliminados')
  
  await prisma.lmsrSnapshot.deleteMany({})
  console.log('  ✓ LmsrSnapshots eliminados')
  
  await prisma.marketHistory.deleteMany({})
  console.log('  ✓ MarketHistory eliminado')
  
  await prisma.position.deleteMany({})
  console.log('  ✓ Positions eliminadas')
  
  await prisma.transaction.deleteMany({})
  console.log('  ✓ Transactions eliminadas')
  
  await prisma.market.deleteMany({})
  console.log('  ✓ Markets eliminados')
  
  await prisma.user.deleteMany({})
  console.log('  ✓ Users eliminados')

  // ─── Step 2: Crear Usuarios ───
  console.log('\n👤 Creando usuarios...')
  
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@win.com',
      role: 'ADMIN',
      balance: 10000,
    }
  })
  console.log(`  ✅ Admin: ${admin.username} (ID: ${admin.id}, Balance: $${admin.balance})`)
  
  const alice = await prisma.user.create({
    data: {
      username: 'alice',
      email: 'alice@win.com',
      role: 'USER',
      balance: 1000,
    }
  })
  console.log(`  ✅ Alice: ${alice.username} (ID: ${alice.id}, Balance: $${alice.balance})`)
  
  const bob = await prisma.user.create({
    data: {
      username: 'bob',
      email: 'bob@win.com',
      role: 'USER',
      balance: 1000,
    }
  })
  console.log(`  ✅ Bob: ${bob.username} (ID: ${bob.id}, Balance: $${bob.balance})`)

  // ─── Step 3: Crear Mercados ───
  console.log('\n📊 Creando mercados...')
  
  const b1 = 100
  const seedCost1 = b1 * Math.log(2)
  
  const market1 = await prisma.market.create({
    data: {
      question: '¿Bitcoin superará los $150,000 antes de Junio 2026?',
      description: 'Se resuelve YES si Bitcoin (BTC/USD) cierra por encima de $150,000 en cualquier exchange principal antes del 1 de Junio de 2026.',
      playerName: 'Bitcoin',
      status: 'ACTIVE',
      b: b1,
      qYes: 0,
      qNo: 0,
      seedCost: seedCost1,
      yesPool: 0,
      noPool: 0,
      maxPool: 50000,
      resolutionDate: new Date('2026-06-01'),
      history: {
        create: {
          yesOdds: 50,
          noOdds: 50,
          totalPool: 0,
        }
      },
      lmsrSnapshots: {
        create: {
          qYesBefore: 0,
          qNoBefore: 0,
          pYesBefore: 0.5,
          side: 'INIT',
          deltaShares: 0,
          cost: seedCost1,
          qYesAfter: 0,
          qNoAfter: 0,
          pYesAfter: 0.5,
          triggerType: 'INIT',
          userId: 'SYSTEM',
        }
      }
    }
  })
  console.log(`  ✅ Mercado 1: "${market1.question}"`)
  console.log(`     ID: ${market1.id} | b=${b1} | SeedCost=$${seedCost1.toFixed(2)} | Status: ACTIVE`)

  const b2 = 50
  const seedCost2 = b2 * Math.log(2)
  
  const market2 = await prisma.market.create({
    data: {
      question: '¿Colombia ganará la Copa América 2026?',
      description: 'Se resuelve YES si la selección de Colombia gana la final de la Copa América 2026.',
      playerName: 'Colombia',
      status: 'ACTIVE',
      b: b2,
      qYes: 0,
      qNo: 0,
      seedCost: seedCost2,
      yesPool: 0,
      noPool: 0,
      maxPool: 20000,
      resolutionDate: new Date('2026-08-01'),
      history: {
        create: {
          yesOdds: 50,
          noOdds: 50,
          totalPool: 0,
        }
      },
      lmsrSnapshots: {
        create: {
          qYesBefore: 0,
          qNoBefore: 0,
          pYesBefore: 0.5,
          side: 'INIT',
          deltaShares: 0,
          cost: seedCost2,
          qYesAfter: 0,
          qNoAfter: 0,
          pYesAfter: 0.5,
          triggerType: 'INIT',
          userId: 'SYSTEM',
        }
      }
    }
  })
  console.log(`  ✅ Mercado 2: "${market2.question}"`)
  console.log(`     ID: ${market2.id} | b=${b2} | SeedCost=$${seedCost2.toFixed(2)} | Status: ACTIVE`)

  const b3 = 200
  const seedCost3 = b3 * Math.log(2)
  
  const market3 = await prisma.market.create({
    data: {
      question: '¿Tesla lanzará un auto sub-$25,000 en 2026?',
      description: 'Se resuelve YES si Tesla anuncia oficialmente y pone a la venta un vehículo con precio base inferior a $25,000 USD antes del 31 de Diciembre de 2026.',
      playerName: 'Tesla',
      status: 'DRAFT',
      b: b3,
      qYes: 0,
      qNo: 0,
      seedCost: seedCost3,
      yesPool: 0,
      noPool: 0,
      maxPool: 100000,
      resolutionDate: new Date('2026-12-31'),
    }
  })
  console.log(`  ✅ Mercado 3: "${market3.question}"`)
  console.log(`     ID: ${market3.id} | b=${b3} | SeedCost=$${seedCost3.toFixed(2)} | Status: DRAFT`)

  // ─── Summary ───
  console.log('\n\n╔════════════════════════════════════════════════════╗')
  console.log('║  ✅ Base de datos reiniciada correctamente          ║')
  console.log('╚════════════════════════════════════════════════════╝')
  console.log('\n📋 Resumen:')
  console.log('   👤 3 usuarios (admin, alice, bob)')
  console.log('   📊 2 mercados ACTIVOS (Bitcoin, Colombia)')
  console.log('   📝 1 mercado DRAFT (Tesla)')
  console.log('\n🔐 Credenciales:')
  console.log('   admin  → admin@win.com  (Balance: $10,000)')
  console.log('   alice  → alice@win.com  (Balance: $1,000)')
  console.log('   bob    → bob@win.com    (Balance: $1,000)')
  console.log('\n🚀 Listo para probar: npm run dev → http://localhost:3000')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
