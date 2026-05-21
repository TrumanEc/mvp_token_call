import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const comments = await prisma.marketComment.findMany({
    where: { marketId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
  })
  return NextResponse.json(comments)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId, content } = await req.json()

  if (!userId || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (content.trim().length > 500) {
    return NextResponse.json({ error: 'Comment too long' }, { status: 400 })
  }

  // Check user has a position in this market
  const hasPosition = await prisma.position.findFirst({
    where: { marketId: id, currentOwnerId: userId, shares: { gt: 0 } },
  })
  if (!hasPosition) {
    return NextResponse.json(
      { error: 'Solo holders con shares pueden comentar' },
      { status: 403 }
    )
  }

  const comment = await prisma.marketComment.create({
    data: { marketId: id, userId, content: content.trim() },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
  })
  return NextResponse.json(comment, { status: 201 })
}
