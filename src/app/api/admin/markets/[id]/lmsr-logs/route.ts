import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const snapshots = await prisma.lmsrSnapshot.findMany({
      where: { marketId: id },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to last 100 for performance
    })

    // Extract unique user IDs
    const userIds = Array.from(new Set(snapshots.map(s => s.userId).filter(Boolean))) as string[]

    // Fetch user details
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true }
    })

    const userMap = new Map(users.map(u => [u.id, u.username]))

    // Enhance snapshots with username
    const logs = snapshots.map(s => ({
      ...s,
      username: s.userId ? (userMap.get(s.userId) || 'Unknown') : 'SYSTEM'
    }))

    return NextResponse.json(logs)

  } catch (error) {
    console.error('Error fetching admin LMSR logs:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
