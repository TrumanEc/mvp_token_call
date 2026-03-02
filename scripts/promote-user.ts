/**
 * Promote User to ADMIN Script
 * 
 * Usage: npx tsx scripts/promote-user.ts <email_or_id>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const identifier = process.argv[2]

  if (!identifier) {
    console.error('Por favor proporciona un email o ID de usuario.')
    console.log('Uso: npx tsx scripts/promote-user.ts user@example.com')
    process.exit(1)
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { id: identifier }
        ]
      }
    })

    if (!user) {
      console.error(`Usuario no encontrado con: ${identifier}`)
      process.exit(1)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' }
    })

    console.log(`✅ ¡Éxito! El usuario ${user.email || user.username} ha sido promovido a ADMIN.`)
  } catch (error) {
    console.error('Error al promover usuario:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
