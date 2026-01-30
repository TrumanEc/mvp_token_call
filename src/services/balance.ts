import { Decimal } from '@prisma/client/runtime/library'
import { TransactionType, PrismaClient, Prisma } from '@prisma/client'

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
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const amountDec = new Decimal(amount)
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
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const amountDec = new Decimal(amount)
    const balanceBefore = new Decimal(user.balance)
    const balanceAfter = balanceBefore.plus(amountDec)

    await tx.user.update({
      where: { id: userId },
      data: { balance: balanceAfter },
    })

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
