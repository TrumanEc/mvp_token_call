import { NextRequest, NextResponse } from 'next/server'
import { PositionService } from '@/services/position'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const position = await PositionService.getById(id)

  if (!position) {
    return NextResponse.json({ error: 'Position not found' }, { status: 404 })
  }

  return NextResponse.json(position)
}
