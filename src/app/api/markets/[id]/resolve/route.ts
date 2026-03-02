import { NextRequest, NextResponse } from 'next/server'
import { SettlementService } from '@/services/settlement'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { outcome } = await request.json()

  if (!outcome || !['YES', 'NO', 'VOID'].includes(outcome)) {
    return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 })
  }

  try {
    const result = await SettlementService.resolve(id, outcome)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Resolution failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  try {
    const report = await SettlementService.getReport(id)
    return NextResponse.json(report)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Report failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
