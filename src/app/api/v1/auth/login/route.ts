import { NextRequest, NextResponse } from 'next/server'
import { validateUser } from '@/lib/auth/config'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = body?.email || ''
  const password = body?.password || ''
  if (!email || !password) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
  const user = await validateUser({ email, password })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ message: 'ok' })
}
