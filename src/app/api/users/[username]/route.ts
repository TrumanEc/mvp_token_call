import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/user'

export async function GET(_: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const user = await UserService.getByUsername(username)

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(user)
}
