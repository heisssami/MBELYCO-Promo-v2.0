import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, signToken } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get('auth_token')?.value
  if (!cookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = verifyToken(cookie)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = signToken({
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions,
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return res
}
