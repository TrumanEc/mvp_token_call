/**
 * Delete All Users Script
 * 
 * Usage: npx tsx scripts/delete-all-users.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Iniciando limpieza de usuarios...')
    
    // Primero borramos registros dependientes para evitar errores de llave foránea
    console.log('Eliminando transacciones y transferencias...')
    await prisma.transaction.deleteMany({})
    await prisma.positionTransfer.deleteMany({})
    
    console.log('Eliminando listings...')
    await prisma.marketplaceListing.deleteMany({})
    
    console.log('Eliminando posiciones...')
    await prisma.position.deleteMany({})
    
    console.log('Eliminando sesiones y cuentas (Auth.js)...')
    await prisma.session.deleteMany({})
    await prisma.account.deleteMany({})

    console.log('Eliminando usuarios...')
    const deletedUsers = await prisma.user.deleteMany({})

    console.log(`✅ ¡Éxito! Se han eliminado ${deletedUsers.count} usuarios y todos sus registros asociados.`)
  } catch (error) {
    console.error('Error al eliminar usuarios:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
