import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/user'

export async function GET() {
  const users = await UserService.getAll()
  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const { username, email } = await request.json()

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 })
  }

  try {
    const user = await UserService.create(username, email)
    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: 'Username already exists' }, { status: 400 })
  }
}
