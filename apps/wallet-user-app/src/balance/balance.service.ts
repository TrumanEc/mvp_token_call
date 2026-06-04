import { Decimal } from '@prisma/client/runtime/library'
import { PrismaClient } from '@prisma/client'

export type TransactionType = 'BET_PLACED' | 'BET_REFUNDED' | 'PAYOUT_RECEIVED' | 'POSITION_PURCHASED' | 'POSITION_SOLD' | 'DEPOSIT' | 'WITHDRAWAL' | 'LIMIT_ORDER_PLACED' | 'LIMIT_ORDER_CANCELLED'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export class BalanceService {
  static async deduct(
    tx: TxClient,
    userId: string,
    amount: Decimal | number,
    type: TransactionType,
    description: string,
    reference?: string
  ) {
    const amountDec = new Decimal(amount)
    
    // Perform update with balance check in where clause for atomicity
    // Note: Prisma returns the updated record. If the where clause doesn't match, it throws.
    // However, findUniqueOrThrow + update is safer if we want a specific error message for "Insufficient balance"
    // but we can also just do the update and catch the error.
    // For now, let's keep the findUnique to check balance explicitly but optimize slightly.
    
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const balanceBefore = new Decimal(user.balance)
    const balanceAfter = balanceBefore.minus(amountDec)

    if (balanceAfter.lessThan(0)) {
      throw new Error('Insufficient balance')
    }

    await tx.user.update({
      where: { id: userId },
      data: { balance: balanceAfter },
    })

    await tx.transaction.create({
      data: {
        userId,
        type,
        amount: amountDec.negated(),
        balanceBefore,
        balanceAfter,
        reference,
        description,
      },
    })

    return balanceAfter
  }

  static async credit(
    tx: TxClient,
    userId: string,
    amount: Decimal | number,
    type: TransactionType,
    description: string,
    reference?: string
  ) {
    const amountDec = new Decimal(amount)
    
    // Atomic update to increment balance and get the new record in one go
    const user = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amountDec } },
    })
    
    const balanceAfter = new Decimal(user.balance)
    const balanceBefore = balanceAfter.minus(amountDec)

    await tx.transaction.create({
      data: {
        userId,
        type,
        amount: amountDec,
        balanceBefore,
        balanceAfter,
        reference,
        description,
      },
    })

    return balanceAfter
  }
}
