import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, getUserWithPermissionsByEmail } from '@/lib/auth/config'
import { signToken } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })

  const userRow = await prisma.user.findUnique({ where: { email } })
  if (!userRow || !userRow.isActive || !userRow.passwordHash) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ok = await verifyPassword(password, userRow.passwordHash)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserWithPermissionsByEmail(email)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = signToken({
    sub: profile.id,
    email: profile.email,
    role: profile.role,
    permissions: profile.permissions,
  })

  const isProd = process.env.NODE_ENV === 'production'
  const res = NextResponse.json({ id: profile.id, email: profile.email, role: profile.role, permissions: profile.permissions })
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return res
}
