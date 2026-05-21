import { PrismaClient } from '@prisma/client'
import { RouterService } from '../src/services/router.service'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Creando Predicción Multi-Outcome ---')

  // 1. Obtener usuario de prueba
  const user = await prisma.user.findFirst({ where: { username: 'juan_futbol' } })
  if (!user) throw new Error('User no encontrado')

  // 2. Obtener un mercado de múltiples resultados
  const market = await prisma.market.findFirst({ 
    where: { question: '¿Quién ganará la Copa Mundial 2026?' },
    include: { outcomes: true } 
  })
  if (!market) throw new Error('Mercado no encontrado')

  // 3. Seleccionar un outcome (ej. Argentina)
  const outcome = market.outcomes.find(o => o.name === 'Argentina')
  if (!outcome) throw new Error('Outcome no encontrado')

  console.log(`Usuario: ${user.username} (Balance: $${user.balance})`)
  console.log(`Mercado: ${market.question}`)
  console.log(`Selección: ${outcome.name} (ID: ${outcome.id})`)
  console.log('Realizando una predicción (compra) por $50...')

  // 4. Realizar la predicción
  const result = await RouterService.executeMarketBuy({
    marketId: market.id,
    userId: user.id,
    outcomeId: outcome.id,
    budget: 50
  })

  console.log('✅ ¡Predicción creada con éxito!')
  console.log('Resumen de la ejecución:')
  console.log(`- Inversión bruta: $50`)
  console.log(`- Inversión neta: $${result.executionSummary.spentNet.toFixed(2)}`)
  console.log(`- Acciones (shares) obtenidas: ${result.executionSummary.sharesCollected.toFixed(4)}`)
  console.log(`- Fee cobrado: $${result.executionSummary.fee.toFixed(2)}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
