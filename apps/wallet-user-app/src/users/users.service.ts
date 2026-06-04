import { prisma } from '@/lib/prisma'

export class UserService {
  static async getByUsername(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })

    if (!user) return null

    return {
      ...user,
      balance: user.balance.toNumber(),
      transactions: user.transactions.map((t) => ({
        ...t,
        amount: t.amount.toNumber(),
        balanceBefore: t.balanceBefore.toNumber(),
        balanceAfter: t.balanceAfter.toNumber(),
      })),
    }
  }

  static async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return null
    return { ...user, balance: user.balance.toNumber() }
  }

  static async create(username: string, email?: string) {
    return prisma.user.create({
      data: { username, email },
    })
  }

  static async getAll() {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return users.map((u) => ({ ...u, balance: u.balance.toNumber() }))
  }
}
